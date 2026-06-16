import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

import { corsHeaders } from '../_shared/cors.ts';
import { getRequesterRole, getRequesterUser } from '../_shared/authz.ts';
import { auditLog } from '../_shared/audit.ts';
import { highestRole, type AppRole } from '../_shared/roles.ts';
import { getClientIp, getRequestId, getUserAgent } from '../_shared/observability.ts';

function escapeCsv(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const request_id = getRequestId(req);
  const ip = getClientIp(req);
  const user_agent = getUserAgent(req);

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Missing Authorization header' } }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-request-id': request_id },
    });
  }

  const supabaseUrl =
    Deno.env.get('PROJECT_URL') ??
    Deno.env.get('SUPABASE_URL') ??
    '';

  const serviceRoleKey =
    Deno.env.get('SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_JWT') ??
    Deno.env.get('SERVICE_ROLE_JWT') ??
    '';

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: { code: 'SERVER_MISCONFIG', message: 'Missing PROJECT_URL or SERVICE_ROLE_KEY' } }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-request-id': request_id },
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Authenticate requester
    const { user, error: userErr } = await getRequesterUser(adminClient, authHeader);
    if (userErr || !user) {
      await auditLog(adminClient, {
        actor_user_id: null,
        actor_email: null,
        action: 'EXPORT_USERS_CSV_UNAUTHORIZED',
        success: false,
        request_id,
        ip,
        user_agent,
      });

      return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-request-id': request_id },
      });
    }

    const { role, error: roleErr } = await getRequesterRole(adminClient, user.id);
    if (roleErr || !role) {
      await auditLog(adminClient, {
        actor_user_id: user.id,
        actor_email: user.email ?? null,
        action: 'EXPORT_USERS_CSV_DENIED',
        success: false,
        request_id,
        ip,
        user_agent,
        metadata: { reason: 'ROLE_LOOKUP_FAILED' },
      });

      return new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-request-id': request_id },
      });
    }

    // Permission check: supports both legacy roles and custom roles via has_permission()
    const { data: canExportUsers, error: permErr } = await adminClient.rpc('has_permission', {
      p_user_id: user.id,
      p_permission: 'users.manage',
    });

    if (permErr) {
      console.error('Permission check failed:', permErr);
      return new Response(JSON.stringify({ error: { code: 'SERVER_ERROR', message: 'Permission check failed' } }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-request-id': request_id },
      });
    }

    if (!canExportUsers) {
      await auditLog(adminClient, {
        actor_user_id: user.id,
        actor_email: user.email ?? null,
        action: 'EXPORT_USERS_CSV_DENIED',
        success: false,
        request_id,
        ip,
        user_agent,
        metadata: { requester_role: role, reason: 'MISSING_PERMISSION' },
      });

      return new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-request-id': request_id },
      });
    }

    // Read data
    const { data: profiles, error: profilesErr } = await adminClient
      .from('profiles')
      .select(
        'id,email,name_en,name_ar,department_id,phone,staff_id,is_active,position,department:departments(name_en,name_ar)'
      )
      .order('name_en');

    if (profilesErr) throw profilesErr;

    const { data: roleRows, error: rolesErr } = await adminClient
      .from('user_roles')
      .select('user_id,role');

    if (rolesErr) throw rolesErr;

    // Map roles (defensive: users can have multiple role rows)
    const bucket = new Map<string, AppRole[]>();
    for (const r of roleRows || []) {
      const user_id = (r as any).user_id as string;
      const roleVal = (r as any).role as AppRole;
      if (!user_id || !roleVal) continue;
      bucket.set(user_id, [...(bucket.get(user_id) || []), roleVal]);
    }

    const roleMap = new Map<string, AppRole>();
    for (const [uid, roles] of bucket.entries()) {
      roleMap.set(uid, highestRole(roles));
    }

    const headers = [
      'email',
      'name_en',
      'name_ar',
      'department_id',
      'department_name_en',
      'department_name_ar',
      'role',
      'phone',
      'staff_id',
      'is_active',
      'position',
    ];

    const rows: string[] = [];
    rows.push(headers.map(escapeCsv).join(','));

    for (const p of profiles || []) {
      const department = (p as any).department;
      const row = {
        email: (p as any).email,
        name_en: (p as any).name_en,
        name_ar: (p as any).name_ar,
        department_id: (p as any).department_id,
        department_name_en: department?.name_en ?? '',
        department_name_ar: department?.name_ar ?? '',
        role: roleMap.get((p as any).id) || 'user',
        phone: (p as any).phone ?? '',
        staff_id: (p as any).staff_id ?? '',
        is_active: (p as any).is_active !== false,
        position: (p as any).position ?? '',
      };

      rows.push(
        [
          row.email,
          row.name_en,
          row.name_ar,
          row.department_id,
          row.department_name_en,
          row.department_name_ar,
          row.role,
          row.phone,
          row.staff_id,
          row.is_active,
          row.position,
        ]
          .map(escapeCsv)
          .join(','),
      );
    }

    // BOM for Excel Arabic compatibility
    const csv = `\ufeff${rows.join('\n')}`;

    await auditLog(adminClient, {
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      action: 'EXPORT_USERS_CSV',
      success: true,
      entity_type: 'profiles',
      entity_id: null,
      request_id,
      ip,
      user_agent,
      metadata: { count: (profiles || []).length, requester_role: role },
    });

    const date = new Date().toISOString().slice(0, 10);
    const filename = `users_export_${date}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'x-request-id': request_id,
      },
    });
  } catch (e) {
    console.error('[export-users] failed', e);
    try {
      await auditLog(adminClient, {
        actor_user_id: null,
        actor_email: null,
        action: 'EXPORT_USERS_CSV_FAILED',
        success: false,
        request_id,
        ip,
        user_agent,
      });
    } catch {
      // ignore
    }

    return new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'Failed to export users' } }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-request-id': request_id },
    });
  }
});
