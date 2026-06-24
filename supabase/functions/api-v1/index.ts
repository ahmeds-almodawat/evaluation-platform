import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { jsonOk, jsonErr } from '../_shared/responses.ts';
import { getRequesterUser, getRequesterRole } from '../_shared/authz.ts';
import { auditLog } from '../_shared/audit.ts';
import { AppRole, isAtLeast } from '../_shared/roles.ts';
/**
 * API (v1) - Integration boundary + secured exports + audit tooling.
 *
 * Call via:
 * - /functions/v1/api-v1/api/v1/health
 */

type EvaluationRow = {
  id: string;
  created_at: string;
  period: string;
  status: string;
  evaluation_type: string | null;
  evaluator_id: string | null;
  evaluatee_id: string;
  performance_score: number;
  teamwork_score: number;
  workload_score: number | null;
  comment: string | null;
};

type DepartmentRow = { id: string; name_en: string | null; name_ar: string | null };

type ProfileRow = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  email: string | null;
  department_id: string | null;
  position: string | null;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const ipFromHeaders = (req: Request) => {
  const xff = req.headers.get('x-forwarded-for');
  if (!xff) return null;
  return xff.split(',')[0]?.trim() ?? null;
};

const safeJson = async (req: Request) => {
  try {
    return await req.json();
  } catch {
    return null;
  }
};

const normalizeTypeLabel = (evaluationType: string | null) => {
  const t = (evaluationType || '').toLowerCase();
  if (t === 'cross_managers') return 'cross_managers';
  if (t === 'cross_individuals' || t === 'cross') return 'cross_individuals';
  if (t.includes('cross')) return 'cross_other';
  return 'same_dept';
};

const scoreOf = (e: EvaluationRow) => {
  const vals: number[] = [e.performance_score, e.teamwork_score];
  if (typeof e.workload_score === 'number') vals.push(e.workload_score);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
};

const avg = (nums: number[]) => {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
};

const stddev = (nums: number[]) => {
  if (nums.length < 2) return 0;
  const m = nums.reduce((a, b) => a + b, 0) / nums.length;
  const v = nums.reduce((acc, x) => acc + (x - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(v);
};

const monthKey = (iso: string) => iso.slice(0, 7);

const lastNMonths = (n: number) => {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
};

const monthLabel = (yyyymm: string, locale: string) => {
  try {
    const [y, m] = yyyymm.split('-').map((x) => parseInt(x, 10));
    if (!y || !m) return yyyymm;
    const d = new Date(y, m - 1, 1);
    return d.toLocaleString(locale, { month: 'short' });
  } catch {
    return yyyymm;
  }
};

async function requireAtLeast(role: AppRole, required: AppRole) {
  if (!isAtLeast(role, required)) {
    throw new Error('FORBIDDEN');
  }
}

async function buildPdfReport(args: {
  title: string;
  subtitle?: string;
  locale: string;
  meta: Record<string, string>;
  sections: Array<{ title: string; lines?: string[]; table?: { columns: string[]; rows: string[][] } }>;
}) {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('https://esm.sh/pdf-lib@1.17.1');

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize: [number, number] = [595.28, 841.89]; // A4
  let page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - 48;

  const drawWatermark = (p: any) => {
    const { width, height } = p.getSize();
    p.drawText('CONFIDENTIAL', {
      x: width / 2 - 180,
      y: height / 2,
      size: 48,
      font: fontBold,
      color: rgb(0.75, 0.75, 0.75),
      rotate: degrees(30),
      opacity: 0.15,
    });
  };

  const newPage = () => {
    page = pdfDoc.addPage(pageSize);
    y = page.getHeight() - 48;
    drawWatermark(page);
  };

  const line = (text: string, opts?: { bold?: boolean; size?: number; gap?: number }) => {
    const size = opts?.size ?? 10;
    const gap = opts?.gap ?? 4;
    if (y < 60) newPage();
    page.drawText(text, { x: 44, y, size, font: opts?.bold ? fontBold : font, color: rgb(0.12, 0.12, 0.12) });
    y -= size + gap;
  };

  const hr = () => {
    if (y < 70) newPage();
    page.drawLine({
      start: { x: 44, y },
      end: { x: page.getWidth() - 44, y },
      thickness: 1,
      color: rgb(0.85, 0.85, 0.85),
    });
    y -= 14;
  };

  drawWatermark(page);

  line(args.title, { bold: true, size: 18, gap: 10 });
  if (args.subtitle) line(args.subtitle, { size: 11, gap: 12 });

  Object.entries(args.meta).forEach(([k, v]) => line(`${k}: ${v}`, { size: 10, gap: 2 }));

  hr();

  const fixed = (s: string, w: number) => {
    const txt = s ?? '';
    if (txt.length === w) return txt;
    if (txt.length < w) return txt + ' '.repeat(w - txt.length);
    return txt.slice(0, Math.max(0, w - 1)) + '…';
  };

  const renderTable = (columns: string[], rows: string[][]) => {
    const widths = columns.map((c) => clamp(c.length, 8, 22));
    // Adjust widths based on first N rows
    rows.slice(0, 40).forEach((r) => {
      r.forEach((cell, i) => {
        widths[i] = clamp(Math.max(widths[i], (cell ?? '').length), 8, 28);
      });
    });

    const header = columns.map((c, i) => fixed(c, widths[i])).join(' | ');
    const sep = widths.map((w) => '-'.repeat(w)).join('-|-');

    line(header, { bold: true, size: 9, gap: 2 });
    line(sep, { size: 8, gap: 6 });

    rows.slice(0, 120).forEach((r) => {
      const rowLine = r.map((cell, i) => fixed(cell ?? '', widths[i])).join(' | ');
      line(rowLine, { size: 8, gap: 2 });
    });

    if (rows.length > 120) {
      line(`… (${rows.length - 120} more rows)`, { size: 8, gap: 8 });
    }
  };

  for (const s of args.sections) {
    line(s.title, { bold: true, size: 12, gap: 8 });
    if (s.lines?.length) {
      s.lines.forEach((l) => line(l, { size: 10, gap: 2 }));
      y -= 6;
    }
    if (s.table) {
      renderTable(s.table.columns, s.table.rows);
      y -= 8;
    }
    hr();
  }

  return await pdfDoc.save();
}

async function buildXlsxReport(args: {
  title: string;
  meta: Record<string, string>;
  sheets: Array<{ name: string; rows: any[] }>;
}) {
  const XLSX = await import('https://esm.sh/xlsx@0.18.5');
  const wb = XLSX.utils.book_new();

  const metaRows = Object.entries(args.meta).map(([k, v]) => ({ Key: k, Value: v }));
  const wsMeta = XLSX.utils.json_to_sheet(metaRows);
  XLSX.utils.book_append_sheet(wb, wsMeta, 'META');

  for (const s of args.sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(out as ArrayBuffer);
}

function buildCompanyExport(
  evaluations: EvaluationRow[],
  profiles: ProfileRow[],
  departments: DepartmentRow[],
  locale: string,
) {
  const deptByUser = new Map<string, string | null>();
  profiles.forEach((p) => deptByUser.set(p.id, p.department_id));

  const deptNameById = new Map<string, { en: string; ar: string }>();
  departments.forEach((d) => deptNameById.set(d.id, { en: d.name_en ?? d.id, ar: d.name_ar ?? d.id }));

  const last6 = lastNMonths(6);
  const evals = evaluations.filter((e) => last6.includes(monthKey(e.created_at)));

  const scores = evals.map(scoreOf).filter((x) => typeof x === 'number');
  const overallAvg = avg(scores) ?? 0;
  const vol = overallAvg > 0 ? Math.round((stddev(scores) / overallAvg) * 100) : 0;

  const sameScores: number[] = [];
  const crossScores: number[] = [];

  const evaluated = new Set<string>();
  evals.forEach((e) => {
    evaluated.add(e.evaluatee_id);
    const evaluatorDept = e.evaluator_id ? deptByUser.get(e.evaluator_id) : null;
    const evaluateeDept = deptByUser.get(e.evaluatee_id) ?? null;
    const isSame = evaluatorDept && evaluateeDept && evaluatorDept === evaluateeDept;
    (isSame ? sameScores : crossScores).push(scoreOf(e));
  });

  const participation = profiles.length ? Math.round((evaluated.size / profiles.length) * 100) : 0;

  const trend = last6.map((m) => {
    const bucket = evals.filter((e) => monthKey(e.created_at) === m);
    const same: number[] = [];
    const cross: number[] = [];
    bucket.forEach((e) => {
      const evaluatorDept = e.evaluator_id ? deptByUser.get(e.evaluator_id) : null;
      const evaluateeDept = deptByUser.get(e.evaluatee_id) ?? null;
      const isSame = evaluatorDept && evaluateeDept && evaluatorDept === evaluateeDept;
      (isSame ? same : cross).push(scoreOf(e));
    });

    return {
      month: monthLabel(m, locale),
      sameDept: avg(same) === null ? null : Number((avg(same) as number).toFixed(2)),
      crossDept: avg(cross) === null ? null : Number((avg(cross) as number).toFixed(2)),
    };
  });

  const deptBench = departments.map((d) => {
    const usersInDept = profiles.filter((p) => p.department_id === d.id).map((p) => p.id);
    const set = new Set(usersInDept);
    const deptEvals = evals.filter((e) => set.has(e.evaluatee_id));
    const same: number[] = [];
    const cross: number[] = [];
    const lowAlerts: number[] = [];
    const evaluatedInDept = new Set<string>();

    deptEvals.forEach((e) => {
      evaluatedInDept.add(e.evaluatee_id);
      const evaluatorDept = e.evaluator_id ? deptByUser.get(e.evaluator_id) : null;
      const evaluateeDept = deptByUser.get(e.evaluatee_id) ?? null;
      const isSame = evaluatorDept && evaluateeDept && evaluatorDept === evaluateeDept;
      const s = scoreOf(e);
      (isSame ? same : cross).push(s);
      if (s < 2) lowAlerts.push(s);
    });

    const deptParticipation = usersInDept.length ? Math.round((evaluatedInDept.size / usersInDept.length) * 100) : 0;

    return {
      deptId: d.id,
      nameEn: d.name_en ?? d.id,
      nameAr: d.name_ar ?? d.id,
      avgSameDept: avg(same) === null ? null : Number((avg(same) as number).toFixed(2)),
      avgCrossDept: avg(cross) === null ? null : Number((avg(cross) as number).toFixed(2)),
      participation: deptParticipation,
      alerts: lowAlerts.length,
    };
  }).sort((a, b) => (b.avgSameDept ?? 0) - (a.avgSameDept ?? 0));

  const metrics = {
    totalEmployees: profiles.length,
    totalEvaluations: evals.length,
    avgSameDept: avg(sameScores) === null ? null : Number((avg(sameScores) as number).toFixed(2)),
    avgCrossDept: avg(crossScores) === null ? null : Number((avg(crossScores) as number).toFixed(2)),
    participation,
    volatility: vol,
  };

  return { metrics, trend, deptBench };
}

function buildReportsOverviewExport(args: {
  evaluations: EvaluationRow[];
  profiles: ProfileRow[];
  departments: DepartmentRow[];
  filters: { period?: string; departmentId?: string; type?: string; status?: string; q?: string };
  locale: string;
}) {
  const { evaluations, profiles, departments, filters, locale } = args;

  const profileById = new Map<string, ProfileRow>();
  profiles.forEach((p) => profileById.set(p.id, p));

  const deptById = new Map<string, DepartmentRow>();
  departments.forEach((d) => deptById.set(d.id, d));

  const filtered = evaluations.filter((e) => {
    if (filters.period && filters.period !== 'all' && e.period !== filters.period) return false;
    if (filters.status && filters.status !== 'all' && e.status !== filters.status) return false;
    if (filters.type && filters.type !== 'all' && normalizeTypeLabel(e.evaluation_type) !== filters.type) return false;

    const evalDept = profileById.get(e.evaluatee_id)?.department_id ?? null;
    if (filters.departmentId && filters.departmentId !== 'all' && evalDept !== filters.departmentId) return false;

    if (filters.q && filters.q.trim()) {
      const needle = filters.q.trim().toLowerCase();
      const evalName = (profileById.get(e.evaluatee_id)?.name_en || profileById.get(e.evaluatee_id)?.name_ar || '').toLowerCase();
      const evaluatorName = (e.evaluator_id ? (profileById.get(e.evaluator_id)?.name_en || profileById.get(e.evaluator_id)?.name_ar || '') : '').toLowerCase();
      const deptName = evalDept
        ? ((deptById.get(evalDept)?.name_en || deptById.get(evalDept)?.name_ar || '') as string).toLowerCase()
        : '';
      const comment = (e.comment || '').toLowerCase();
      const typeStr = (e.evaluation_type || '').toLowerCase();
      if (![evalName, evaluatorName, deptName, comment, typeStr, (e.period || '').toLowerCase()].some((x) => x.includes(needle))) {
        return false;
      }
    }

    return true;
  });

  const total = filtered.length;
  const completed = filtered.filter((e) => e.status === 'completed').length;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;

  const avgKey = (pick: (e: EvaluationRow) => number | null) => {
    const vals = filtered.map(pick).filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    return vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0;
  };

  const metrics = {
    total,
    completed,
    completionRate,
    avgPerformance: avgKey((e) => e.performance_score),
    avgTeamwork: avgKey((e) => e.teamwork_score),
    avgWorkload: avgKey((e) => (typeof e.workload_score === 'number' ? e.workload_score : null)),
    uniqueEvaluatees: new Set(filtered.map((e) => e.evaluatee_id)).size,
    uniqueEvaluators: new Set(filtered.map((e) => e.evaluator_id).filter(Boolean) as string[]).size,
  };

  const months = lastNMonths(6);
  const trend = months.map((m) => {
    const bucket = filtered.filter((e) => monthKey(e.created_at) === m);
    const perf = bucket.map((e) => e.performance_score);
    const team = bucket.map((e) => e.teamwork_score);
    const work = bucket.map((e) => (typeof e.workload_score === 'number' ? e.workload_score : null)).filter((x): x is number => typeof x === 'number');
    return {
      month: monthLabel(m, locale),
      performance: perf.length ? Number((perf.reduce((a, b) => a + b, 0) / perf.length).toFixed(2)) : null,
      teamwork: team.length ? Number((team.reduce((a, b) => a + b, 0) / team.length).toFixed(2)) : null,
      workload: work.length ? Number((work.reduce((a, b) => a + b, 0) / work.length).toFixed(2)) : null,
    };
  });

  return { metrics, trend, filtered };
}

Deno.serve(async (req) => {
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
const cors = handleCors(req);
  if (cors) return cors;

  const url = new URL(req.url);
  const path = url.pathname;

  const requestId = crypto.randomUUID();
  const ip = ipFromHeaders(req);
  const userAgent = req.headers.get('user-agent') ?? null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey =
    Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_JWT') ??
    Deno.env.get('SERVICE_ROLE_JWT') ??
    '';

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });


// ===== PUBLIC AUTH ROUTES (no bearer token yet) =====
// Allows login using: email OR phone OR staff_id (single identifier field).
// IMPORTANT: Responds with a generic error to avoid leaking whether an identifier exists.
if (path.endsWith('/api/v1/auth/sign-in')) {
  if (req.method !== 'POST') return jsonErr('METHOD_NOT_ALLOWED', 'Use POST', 405);

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('PUBLIC_ANON_KEY') ?? Deno.env.get('PUBLIC_ANON_KEY') ?? Deno.env.get('PUBLIC_ANON_KEY') ?? '';
  if (!anonKey) return jsonErr('SERVER_MISCONFIG', 'Missing SUPABASE_ANON_KEY', 500);

  const body = await req.json().catch(() => null) as any;
  const identifier = String(body?.identifier ?? '').trim();
  const password = String(body?.password ?? '');

  if (!identifier || !password) return jsonErr('BAD_REQUEST', 'Missing credentials', 400);

  let email = identifier;

  // If identifier isn't an email, resolve it to email via profiles (service role).
  if (!identifier.includes('@')) {
    // 1) staff_id exact match
    const { data: byStaff } = await adminClient
      .from('profiles')
      .select('email,is_active,deleted_at')
      .eq('staff_id', identifier)
      .limit(2);

    const matchStaff = (byStaff || []).find((p) => p?.email && p?.is_active !== false && (p as any).deleted_at == null);

    // 2) phone exact match (if not found by staff id)
    if (!matchStaff) {
      const { data: byPhone } = await adminClient
        .from('profiles')
        .select('email,is_active,deleted_at')
        .eq('phone', identifier)
        .limit(2);

      const matchPhone = (byPhone || []).find((p) => p?.email && p?.is_active !== false && (p as any).deleted_at == null);
      email = matchPhone?.email ?? '__unknown__@example.com';
    } else {
      email = matchStaff.email ?? '__unknown__@example.com';
    }
  } else {
    // If email provided, block inactive accounts (if profile exists).
    const { data: prof } = await adminClient
      .from('profiles')
      .select('is_active,deleted_at')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (prof && ((prof as any).is_active === false || (prof as any).deleted_at != null)) {
      return jsonErr('INVALID_CREDENTIALS', 'Invalid credentials', 401);
    }
  }

  // Password sign-in through Supabase Auth REST API (returns access + refresh tokens).
  const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { ...corsHeaders, 'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!authRes.ok) {
    // Generic error: do not expose details (prevents account enumeration).
    return jsonErr('INVALID_CREDENTIALS', 'Invalid credentials', 401);
  }

  const authJson = await authRes.json().catch(() => null);
  if (!authJson?.access_token || !authJson?.refresh_token) {
    return jsonErr('INVALID_CREDENTIALS', 'Invalid credentials', 401);
  }

  // Extra safety: ensure profile is active for resolved email (if exists).
  const { data: activeCheck } = await adminClient
    .from('profiles')
    .select('is_active,deleted_at')
    .eq('email', String(email).toLowerCase())
    .maybeSingle();

  if (activeCheck && ((activeCheck as any).is_active === false || (activeCheck as any).deleted_at != null)) {
    return jsonErr('INVALID_CREDENTIALS', 'Invalid credentials', 401);
  }

  return jsonOk(authJson, 200);
}

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonErr('UNAUTHORIZED', 'Missing Authorization bearer token', 401);
  }

  const { user, error: userErr } = await getRequesterUser(adminClient, authHeader);
  if (userErr || !user) return jsonErr('UNAUTHORIZED', 'Invalid token', 401);

  const { role, error: roleErr } = await getRequesterRole(adminClient, user.id);
  if (roleErr || !role) return jsonErr('FORBIDDEN', 'Role lookup failed', 403);

  // Health
  if (path.endsWith('/api/v1/health')) {
    return jsonOk({ ok: true, version: 'v1', role, requestId }, 200);
  }

  // ===== AUDIT ROUTES =====

  if (path.endsWith('/api/v1/audit/ping')) {
    try {
      await requireAtLeast(role, 'audit');
    } catch {
      return jsonErr('FORBIDDEN', 'Insufficient role', 403);
    }
    await auditLog(adminClient, {
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      action: 'AUDIT_PING',
      success: true,
      request_id: requestId,
      ip,
      user_agent: userAgent,
      metadata: { role },
    });
    return jsonOk({ ok: true }, 200);
  }

  if (path.endsWith('/api/v1/audit/logs')) {
    try {
      await requireAtLeast(role, 'audit');
    } catch {
      return jsonErr('FORBIDDEN', 'Insufficient role', 403);
    }

    const limit = clamp(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1, 200);
    const offset = clamp(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0, 50_000);
    const action = url.searchParams.get('action');
    const q = url.searchParams.get('q');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    let query: any = adminClient
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (action && action !== 'all') query = query.eq('action', action);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    if (q && q.trim()) {
      const needle = q.trim().replaceAll('%', '');
      // actor_email may not exist on older DBs; if it errors we fallback.
      query = query.or(`action.ilike.%${needle}%,actor_email.ilike.%${needle}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      // Fallback without actor_email search
      let q2: any = adminClient
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (action && action !== 'all') q2 = q2.eq('action', action);
      if (from) q2 = q2.gte('created_at', from);
      if (to) q2 = q2.lte('created_at', to);
      if (q && q.trim()) {
        const needle = q.trim().replaceAll('%', '');
        q2 = q2.ilike('action', `%${needle}%`);
      }
      const res2 = await q2;
      if (res2.error) return jsonErr('DB_ERROR', res2.error.message, 500);
      return jsonOk({ rows: res2.data ?? [], total: res2.count ?? (res2.data?.length ?? 0), limit, offset, requestId }, 200);
    }

    return jsonOk({ rows: data ?? [], total: count ?? (data?.length ?? 0), limit, offset, requestId }, 200);
  }

  // ===== REPORT EXPORTS =====

  if (path.endsWith('/api/v1/reports/export')) {
    try {
      await requireAtLeast(role, 'audit');
    } catch {
      return jsonErr('FORBIDDEN', 'Insufficient role', 403);
    }

    if (req.method !== 'POST') return jsonErr('METHOD_NOT_ALLOWED', 'Use POST', 405);

    // Rate-limit: max 5 exports/minute/user (best-effort)
    try {
      const since = new Date(Date.now() - 60_000).toISOString();
      const { count } = await adminClient
        .from('audit_logs')
        .select('id', { count: 'exact' })
        .eq('actor_user_id', user.id)
        .gte('created_at', since)
        .in('action', ['EXPORT_PDF', 'EXPORT_EXCEL', 'EXPORT_REPORT_PDF', 'EXPORT_REPORT_XLSX']);
      if ((count ?? 0) >= 5) return jsonErr('RATE_LIMIT', 'Too many exports. Please wait and try again.', 429);
    } catch {
      // ignore rate-limit failures
    }

    const body = await safeJson(req);
    const report = (body?.report ?? '').toString();
    const formatRaw = (body?.format ?? 'pdf').toString().toLowerCase();
    const format = formatRaw === 'xlsx' || formatRaw === 'excel' ? 'xlsx' : 'pdf';
    const language = body?.language === 'ar' ? 'ar' : 'en';
    const locale = language === 'ar' ? 'ar' : 'en';
    const params = (body?.params ?? {}) as Record<string, any>;

    if (!['reports_overview', 'company', 'department', 'employee'].includes(report)) {
      return jsonErr('VALIDATION_ERROR', 'Unknown report type', 400);
    }

    // Fetch core datasets (service role bypasses RLS)
    const [{ data: evals, error: evalErr }, { data: profs, error: profErr }, { data: depts, error: deptErr }] =
      await Promise.all([
        adminClient
          .from('evaluations')
          .select('id,created_at,period,status,evaluation_type,evaluator_id,evaluatee_id,performance_score,teamwork_score,workload_score,comment')
          .order('created_at', { ascending: false }),
        adminClient.from('profiles').select('id,name_en,name_ar,email,department_id,position'),
        adminClient.from('departments').select('id,name_en,name_ar'),
      ]);

    if (evalErr) return jsonErr('DB_ERROR', evalErr.message, 500);
    if (profErr) return jsonErr('DB_ERROR', profErr.message, 500);
    if (deptErr) return jsonErr('DB_ERROR', deptErr.message, 500);

    const evaluations = (evals as any as EvaluationRow[]) ?? [];
    const profiles = (profs as any as ProfileRow[]) ?? [];
    const departments = (depts as any as DepartmentRow[]) ?? [];

    const nowIso = new Date().toISOString();

    try {
      if (report === 'company') {
        const { metrics, trend, deptBench } = buildCompanyExport(evaluations, profiles, departments, locale);

        const meta = {
          ExportedAt: new Date().toLocaleString(locale),
          ExportedBy: user.email ?? user.id,
          Report: 'Company',
          RequestId: requestId,
        };

        const filenameBase = `almodawat_company_${new Date().toISOString().replace(/[:.]/g, '-')}`;

        if (format === 'pdf') {
          const pdfBytes = await buildPdfReport({
            title: language === 'ar' ? 'تقرير الشركة' : 'Company Report',
            subtitle: language === 'ar' ? 'ملخص أداء الشركة (آخر 6 أشهر)' : 'Company performance summary (last 6 months)',
            locale,
            meta,
            sections: [
              {
                title: language === 'ar' ? 'مؤشرات رئيسية' : 'Key metrics',
                lines: [
                  `${language === 'ar' ? 'إجمالي الموظفين' : 'Total employees'}: ${metrics.totalEmployees}`,
                  `${language === 'ar' ? 'إجمالي التقييمات' : 'Total evaluations'}: ${metrics.totalEvaluations}`,
                  `${language === 'ar' ? 'متوسط نفس القسم' : 'Avg same department'}: ${metrics.avgSameDept ?? '—'}`,
                  `${language === 'ar' ? 'متوسط عبر الأقسام' : 'Avg cross department'}: ${metrics.avgCrossDept ?? '—'}`,
                  `${language === 'ar' ? 'المشاركة' : 'Participation'}: ${metrics.participation}%`,
                  `${language === 'ar' ? 'تقلب الأداء' : 'Volatility'}: ${metrics.volatility}%`,
                ],
              },
              {
                title: language === 'ar' ? 'الاتجاه الشهري' : 'Monthly trend',
                table: {
                  columns: [language === 'ar' ? 'الشهر' : 'Month', language === 'ar' ? 'نفس القسم' : 'Same', language === 'ar' ? 'عبر الأقسام' : 'Cross'],
                  rows: trend.map((r) => [String(r.month), String(r.sameDept ?? '—'), String(r.crossDept ?? '—')]),
                },
              },
              {
                title: language === 'ar' ? 'مقارنة الأقسام' : 'Department benchmarks',
                table: {
                  columns: [
                    language === 'ar' ? 'القسم' : 'Department',
                    language === 'ar' ? 'نفس القسم' : 'Same avg',
                    language === 'ar' ? 'عبر الأقسام' : 'Cross avg',
                    language === 'ar' ? 'المشاركة' : 'Participation',
                    language === 'ar' ? 'تنبيهات' : 'Alerts',
                  ],
                  rows: deptBench.slice(0, 25).map((d) => [
                    language === 'ar' ? d.nameAr : d.nameEn,
                    String(d.avgSameDept ?? '—'),
                    String(d.avgCrossDept ?? '—'),
                    `${d.participation}%`,
                    String(d.alerts),
                  ]),
                },
              },
            ],
          });

          await auditLog(adminClient, {
            actor_user_id: user.id,
            actor_email: user.email ?? null,
            action: 'EXPORT_REPORT_PDF',
            success: true,
            entity_type: 'report',
            entity_id: null,
            request_id: requestId,
            ip,
            user_agent: userAgent,
            metadata: { report, format: 'pdf', generated_at: nowIso },
          });

          return new Response(pdfBytes, {
            status: 200,
            headers: { ...corsHeaders, ...corsHeaders,
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
              'Access-Control-Expose-Headers': 'Content-Disposition, X-Request-Id',
              'X-Request-Id': requestId,
            },
          });
        } else {
          const bytes = await buildXlsxReport({
            title: 'Company Report',
            meta,
            sheets: [
              { name: 'Summary', rows: [metrics] },
              { name: 'Trend', rows: trend },
              { name: 'Departments', rows: deptBench },
            ],
          });

          await auditLog(adminClient, {
            actor_user_id: user.id,
            actor_email: user.email ?? null,
            action: 'EXPORT_REPORT_XLSX',
            success: true,
            entity_type: 'report',
            entity_id: null,
            request_id: requestId,
            ip,
            user_agent: userAgent,
            metadata: { report, format: 'xlsx', generated_at: nowIso },
          });

          return new Response(bytes, {
            status: 200,
            headers: { ...corsHeaders, ...corsHeaders,
              'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'Content-Disposition': `attachment; filename="${filenameBase}.xlsx"`,
              'Access-Control-Expose-Headers': 'Content-Disposition, X-Request-Id',
              'X-Request-Id': requestId,
            },
          });
        }
      }

      if (report === 'department') {
        const deptId = (params.departmentId ?? params.deptId ?? '').toString();
        if (!deptId) return jsonErr('VALIDATION_ERROR', 'departmentId is required', 400);

        const usersInDept = profiles.filter((p) => p.department_id === deptId).map((p) => p.id);
        const set = new Set(usersInDept);
        const deptEvals = evaluations.filter((e) => set.has(e.evaluatee_id));

        const dept = departments.find((d) => d.id === deptId);
        const deptName = language === 'ar' ? (dept?.name_ar ?? deptId) : (dept?.name_en ?? deptId);

        const same: number[] = [];
        const cross: number[] = [];
        const deptByUser = new Map(profiles.map((p) => [p.id, p.department_id]));

        deptEvals.forEach((e) => {
          const evaluatorDept = e.evaluator_id ? deptByUser.get(e.evaluator_id) : null;
          const evaluateeDept = deptByUser.get(e.evaluatee_id) ?? null;
          const isSame = evaluatorDept && evaluateeDept && evaluatorDept === evaluateeDept;
          (isSame ? same : cross).push(scoreOf(e));
        });

        const metrics = {
          deptId,
          deptName,
          employees: usersInDept.length,
          evaluations: deptEvals.length,
          avgSameDept: avg(same) === null ? null : Number((avg(same) as number).toFixed(2)),
          avgCrossDept: avg(cross) === null ? null : Number((avg(cross) as number).toFixed(2)),
        };

        const filenameBase = `almodawat_department_${deptId}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
        const meta = {
          ExportedAt: new Date().toLocaleString(locale),
          ExportedBy: user.email ?? user.id,
          Report: 'Department',
          Department: deptName,
          RequestId: requestId,
        };

        if (format === 'pdf') {
          const pdfBytes = await buildPdfReport({
            title: language === 'ar' ? 'تقرير قسم' : 'Department Report',
            subtitle: deptName,
            locale,
            meta,
            sections: [
              {
                title: language === 'ar' ? 'مؤشرات رئيسية' : 'Key metrics',
                lines: [
                  `${language === 'ar' ? 'الموظفون' : 'Employees'}: ${metrics.employees}`,
                  `${language === 'ar' ? 'التقييمات' : 'Evaluations'}: ${metrics.evaluations}`,
                  `${language === 'ar' ? 'متوسط نفس القسم' : 'Avg same department'}: ${metrics.avgSameDept ?? '—'}`,
                  `${language === 'ar' ? 'متوسط عبر الأقسام' : 'Avg cross department'}: ${metrics.avgCrossDept ?? '—'}`,
                ],
              },
              {
                title: language === 'ar' ? 'آخر 50 تقييم' : 'Latest 50 evaluations',
                table: {
                  columns: [language === 'ar' ? 'التاريخ' : 'Date', language === 'ar' ? 'الفترة' : 'Period', language === 'ar' ? 'الحالة' : 'Status', language === 'ar' ? 'النتيجة' : 'Score'],
                  rows: deptEvals.slice(0, 50).map((e) => [e.created_at.slice(0, 10), e.period, e.status, scoreOf(e).toFixed(2)]),
                },
              },
            ],
          });

          await auditLog(adminClient, {
            actor_user_id: user.id,
            actor_email: user.email ?? null,
            action: 'EXPORT_REPORT_PDF',
            success: true,
            entity_type: 'department',
            entity_id: deptId,
            request_id: requestId,
            ip,
            user_agent: userAgent,
            metadata: { report, deptId, format: 'pdf', generated_at: nowIso },
          });

          return new Response(pdfBytes, {
            status: 200,
            headers: { ...corsHeaders, ...corsHeaders,
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
              'Access-Control-Expose-Headers': 'Content-Disposition, X-Request-Id',
              'X-Request-Id': requestId,
            },
          });
        } else {
          const bytes = await buildXlsxReport({
            title: 'Department Report',
            meta,
            sheets: [
              { name: 'Summary', rows: [metrics] },
              { name: 'Evaluations', rows: deptEvals.slice(0, 500).map((e) => ({ ...e, score: Number(scoreOf(e).toFixed(2)) })) },
            ],
          });

          await auditLog(adminClient, {
            actor_user_id: user.id,
            actor_email: user.email ?? null,
            action: 'EXPORT_REPORT_XLSX',
            success: true,
            entity_type: 'department',
            entity_id: deptId,
            request_id: requestId,
            ip,
            user_agent: userAgent,
            metadata: { report, deptId, format: 'xlsx', generated_at: nowIso },
          });

          return new Response(bytes, {
            status: 200,
            headers: { ...corsHeaders, ...corsHeaders,
              'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'Content-Disposition': `attachment; filename="${filenameBase}.xlsx"`,
              'Access-Control-Expose-Headers': 'Content-Disposition, X-Request-Id',
              'X-Request-Id': requestId,
            },
          });
        }
      }

      if (report === 'employee') {
        const employeeId = (params.userId ?? params.employeeId ?? '').toString();
        if (!employeeId) return jsonErr('VALIDATION_ERROR', 'userId is required', 400);

        const prof = profiles.find((p) => p.id === employeeId);
        const name = language === 'ar' ? (prof?.name_ar ?? prof?.email ?? employeeId) : (prof?.name_en ?? prof?.email ?? employeeId);

        const employeeEvals = evaluations.filter((e) => e.evaluatee_id === employeeId);

        const scores = employeeEvals.map(scoreOf);
        const metrics = {
          userId: employeeId,
          employee: name,
          evaluations: employeeEvals.length,
          avgScore: avg(scores) === null ? null : Number((avg(scores) as number).toFixed(2)),
          avgPerformance: avg(employeeEvals.map((e) => e.performance_score)) === null ? null : Number((avg(employeeEvals.map((e) => e.performance_score)) as number).toFixed(2)),
          avgTeamwork: avg(employeeEvals.map((e) => e.teamwork_score)) === null ? null : Number((avg(employeeEvals.map((e) => e.teamwork_score)) as number).toFixed(2)),
          avgWorkload: avg(employeeEvals.map((e) => (typeof e.workload_score === 'number' ? e.workload_score : NaN)).filter((x) => !Number.isNaN(x))) === null ? null : Number((avg(employeeEvals.map((e) => (typeof e.workload_score === 'number' ? e.workload_score : NaN)).filter((x) => !Number.isNaN(x))) as number[]).toFixed(2)),
        };

        const filenameBase = `almodawat_employee_${employeeId}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
        const meta = {
          ExportedAt: new Date().toLocaleString(locale),
          ExportedBy: user.email ?? user.id,
          Report: 'Employee',
          Employee: name,
          RequestId: requestId,
        };

        if (format === 'pdf') {
          const pdfBytes = await buildPdfReport({
            title: language === 'ar' ? 'تقرير موظف' : 'Employee Report',
            subtitle: name,
            locale,
            meta,
            sections: [
              {
                title: language === 'ar' ? 'مؤشرات رئيسية' : 'Key metrics',
                lines: [
                  `${language === 'ar' ? 'عدد التقييمات' : 'Evaluations'}: ${metrics.evaluations}`,
                  `${language === 'ar' ? 'متوسط الدرجة' : 'Avg score'}: ${metrics.avgScore ?? '—'}`,
                  `${language === 'ar' ? 'الأداء' : 'Performance'}: ${metrics.avgPerformance ?? '—'}`,
                  `${language === 'ar' ? 'العمل الجماعي' : 'Teamwork'}: ${metrics.avgTeamwork ?? '—'}`,
                  `${language === 'ar' ? 'عبء العمل' : 'Workload'}: ${metrics.avgWorkload ?? '—'}`,
                ],
              },
              {
                title: language === 'ar' ? 'آخر 50 تقييم' : 'Latest 50 evaluations',
                table: {
                  columns: [language === 'ar' ? 'التاريخ' : 'Date', language === 'ar' ? 'الفترة' : 'Period', language === 'ar' ? 'الحالة' : 'Status', language === 'ar' ? 'النتيجة' : 'Score'],
                  rows: employeeEvals.slice(0, 50).map((e) => [e.created_at.slice(0, 10), e.period, e.status, scoreOf(e).toFixed(2)]),
                },
              },
            ],
          });

          await auditLog(adminClient, {
            actor_user_id: user.id,
            actor_email: user.email ?? null,
            action: 'EXPORT_REPORT_PDF',
            success: true,
            entity_type: 'employee',
            entity_id: employeeId,
            request_id: requestId,
            ip,
            user_agent: userAgent,
            metadata: { report, employeeId, format: 'pdf', generated_at: nowIso },
          });

          return new Response(pdfBytes, {
            status: 200,
            headers: { ...corsHeaders, ...corsHeaders,
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
              'Access-Control-Expose-Headers': 'Content-Disposition, X-Request-Id',
              'X-Request-Id': requestId,
            },
          });
        } else {
          const bytes = await buildXlsxReport({
            title: 'Employee Report',
            meta,
            sheets: [
              { name: 'Summary', rows: [metrics] },
              { name: 'Evaluations', rows: employeeEvals.slice(0, 500).map((e) => ({ ...e, score: Number(scoreOf(e).toFixed(2)) })) },
            ],
          });

          await auditLog(adminClient, {
            actor_user_id: user.id,
            actor_email: user.email ?? null,
            action: 'EXPORT_REPORT_XLSX',
            success: true,
            entity_type: 'employee',
            entity_id: employeeId,
            request_id: requestId,
            ip,
            user_agent: userAgent,
            metadata: { report, employeeId, format: 'xlsx', generated_at: nowIso },
          });

          return new Response(bytes, {
            status: 200,
            headers: { ...corsHeaders, ...corsHeaders,
              'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'Content-Disposition': `attachment; filename="${filenameBase}.xlsx"`,
              'Access-Control-Expose-Headers': 'Content-Disposition, X-Request-Id',
              'X-Request-Id': requestId,
            },
          });
        }
      }

      // reports_overview
      const filters = {
        period: (params.period ?? 'all').toString(),
        departmentId: (params.departmentId ?? 'all').toString(),
        type: (params.type ?? 'all').toString(),
        status: (params.status ?? 'all').toString(),
        q: (params.q ?? '').toString(),
      };

      const { metrics, trend, filtered } = buildReportsOverviewExport({ evaluations, profiles, departments, filters, locale });

      const filenameBase = `almodawat_reports_${new Date().toISOString().replace(/[:.]/g, '-')}`;
      const meta = {
        ExportedAt: new Date().toLocaleString(locale),
        ExportedBy: user.email ?? user.id,
        Report: 'Reports Overview',
        RequestId: requestId,
        Filters: JSON.stringify(filters),
      };

      if (format === 'pdf') {
        const pdfBytes = await buildPdfReport({
          title: language === 'ar' ? 'التقارير' : 'Reports',
          subtitle: language === 'ar' ? 'نظرة عامة' : 'Overview',
          locale,
          meta,
          sections: [
            {
              title: language === 'ar' ? 'ملخص' : 'Summary',
              lines: [
                `${language === 'ar' ? 'إجمالي التقييمات' : 'Total'}: ${metrics.total}`,
                `${language === 'ar' ? 'مكتملة' : 'Completed'}: ${metrics.completed}`,
                `${language === 'ar' ? 'نسبة الإكمال' : 'Completion rate'}: ${metrics.completionRate}%`,
                `${language === 'ar' ? 'متوسط الأداء' : 'Avg performance'}: ${metrics.avgPerformance}`,
                `${language === 'ar' ? 'متوسط العمل الجماعي' : 'Avg teamwork'}: ${metrics.avgTeamwork}`,
                `${language === 'ar' ? 'متوسط عبء العمل' : 'Avg workload'}: ${metrics.avgWorkload}`,
              ],
            },
            {
              title: language === 'ar' ? 'الاتجاه (آخر 6 أشهر)' : 'Trend (last 6 months)',
              table: {
                columns: [language === 'ar' ? 'الشهر' : 'Month', language === 'ar' ? 'الأداء' : 'Performance', language === 'ar' ? 'العمل الجماعي' : 'Teamwork', language === 'ar' ? 'عبء العمل' : 'Workload'],
                rows: trend.map((r) => [String(r.month), String(r.performance ?? '—'), String(r.teamwork ?? '—'), String(r.workload ?? '—')]),
              },
            },
            {
              title: language === 'ar' ? 'آخر 100 تقييم' : 'Latest 100 evaluations',
              table: {
                columns: [language === 'ar' ? 'التاريخ' : 'Date', language === 'ar' ? 'الفترة' : 'Period', language === 'ar' ? 'الحالة' : 'Status', language === 'ar' ? 'النوع' : 'Type', language === 'ar' ? 'النتيجة' : 'Score'],
                rows: filtered.slice(0, 100).map((e) => [e.created_at.slice(0, 10), e.period, e.status, normalizeTypeLabel(e.evaluation_type), scoreOf(e).toFixed(2)]),
              },
            },
          ],
        });

        await auditLog(adminClient, {
          actor_user_id: user.id,
          actor_email: user.email ?? null,
          action: 'EXPORT_REPORT_PDF',
          success: true,
          entity_type: 'report',
          entity_id: null,
          request_id: requestId,
          ip,
          user_agent: userAgent,
          metadata: { report, filters, format: 'pdf', generated_at: nowIso },
        });

        return new Response(pdfBytes, {
          status: 200,
          headers: { ...corsHeaders, ...corsHeaders,
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
            'Access-Control-Expose-Headers': 'Content-Disposition, X-Request-Id',
            'X-Request-Id': requestId,
          },
        });
      } else {
        const bytes = await buildXlsxReport({
          title: 'Reports',
          meta,
          sheets: [
            { name: 'Summary', rows: [metrics] },
            { name: 'Trend', rows: trend },
            { name: 'Evaluations', rows: filtered.slice(0, 2000).map((e) => ({ ...e, score: Number(scoreOf(e).toFixed(2)) })) },
          ],
        });

        await auditLog(adminClient, {
          actor_user_id: user.id,
          actor_email: user.email ?? null,
          action: 'EXPORT_REPORT_XLSX',
          success: true,
          entity_type: 'report',
          entity_id: null,
          request_id: requestId,
          ip,
          user_agent: userAgent,
          metadata: { report, filters, format: 'xlsx', generated_at: nowIso },
        });

        return new Response(bytes, {
          status: 200,
          headers: { ...corsHeaders, ...corsHeaders,
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filenameBase}.xlsx"`,
            'Access-Control-Expose-Headers': 'Content-Disposition, X-Request-Id',
            'X-Request-Id': requestId,
          },
        });
      }
    } catch (e) {
      await auditLog(adminClient, {
        actor_user_id: user.id,
        actor_email: user.email ?? null,
        action: 'EXPORT_REPORT_FAILED',
        success: false,
        request_id: requestId,
        ip,
        user_agent: userAgent,
        metadata: { report, format, message: e instanceof Error ? e.message : String(e) },
      });

      return jsonErr('EXPORT_FAILED', 'Failed to generate export', 500);
    }
  }

  return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Unknown route' } }), {
    status: 404,
    headers: { ...corsHeaders, ...corsHeaders, 'Content-Type': 'application/json', 'X-Request-Id': requestId },
  });
});



