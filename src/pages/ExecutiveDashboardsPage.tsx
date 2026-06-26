import React, { useEffect, useMemo, useState } from "react";
import Header from "@/components/layout/Header";
import KPICard from "@/components/ui/KPICard";
import TrendLineChart from "@/components/charts/TrendLineChart";
import DepartmentBenchmarkChart from "@/components/charts/DepartmentBenchmarkChart";
import CategoryHeatmap from "@/components/charts/CategoryHeatmap";
import EmptyState from "@/components/common/EmptyState";
import EvaluationCampaignBreakdown, { CampaignBreakdownItem } from "@/components/dashboard/EvaluationCampaignBreakdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { supabase } from "@/integrations/supabase/client";
import { buildTrendFromEvaluations } from "@/utils/trends";
import {
  CAMPAIGN_TYPE_ORDER,
  averageEvaluationScore,
  isCrossCampaign,
  normalizeCampaignType,
  type CampaignTypeKey,
} from "@/utils/evaluationCampaigns";
import { exportExecutiveDashboardsToPdf, exportExecutiveDashboardsToXlsx } from "@/utils/executiveDashboardExport";
import {
  deleteExecFilter,
  loadSavedExecFilters,
  loadSavedExecFiltersServer,
  saveExecFilter,
  saveExecFilterServer,
  deleteExecFilterServer,
  type ExecDashboardFilters,
  type SavedExecFilter,
} from "@/utils/executiveDashboardFilters";
import { Activity, AlertTriangle, ClipboardCheck, Loader2, SlidersHorizontal, TrendingDown, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { downloadXlsx } from "@/utils/exportXlsx";
import {
  createActionTicket,
  loadActionTickets,
  loadDashboardFlags,
  toggleProfileFlag,
} from "@/utils/executiveActions";
import CustomDashboardsTab from "@/components/executive/CustomDashboardsTab";

type EvaluationRow = {
  id: string;
  evaluatee_id: string;
  evaluator_id: string;
  evaluation_type: string;
  status: string;
  performance_score: number | null;
  teamwork_score: number | null;
  workload_score: number | null;
  created_at?: string;
};

type ProfileRow = {
  id: string;
  name_en: string;
  name_ar: string;
  department_id: string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
};

type DepartmentRow = {
  id: string;
  name_en: string;
  name_ar: string;
};

function isCross(evaluationType: string) {
  return isCrossCampaign(evaluationType);
}

function buildCampaignBreakdown(evaluations: EvaluationRow[]): CampaignBreakdownItem[] {
  const buckets = new Map<CampaignTypeKey, EvaluationRow[]>();
  CAMPAIGN_TYPE_ORDER.forEach((key) => buckets.set(key, []));
  evaluations.forEach((row) => {
    const key = normalizeCampaignType(row.evaluation_type);
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  });
  return CAMPAIGN_TYPE_ORDER.map((key) => {
    const rows = buckets.get(key) ?? [];
    return {
      key,
      count: rows.length,
      average: averageEvaluationScore(rows),
      evaluatorCount: new Set(rows.map((row) => row.evaluator_id).filter(Boolean)).size,
      evaluateeCount: new Set(rows.map((row) => row.evaluatee_id).filter(Boolean)).size,
    };
  });
}

function safeNum(n: any) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function pct(n: number) {
  return `${Math.round(n)}%`;
}

function toYM(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthOptions(count = 24) {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < count; i++) {
    out.push(toYM(d));
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

function ymToRange(ym: string) {
  // [start, end)
  const [y, m] = ym.split("-").map((x) => Number(x));
  const start = new Date(y, (m || 1) - 1, 1);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

// A tiny helper to keep the UI robust even if some tables/columns differ between environments.
async function safeSelect<T>(query: Promise<{ data: T | null; error: any }>, fallback: T) {
  try {
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? fallback) as T;
  } catch {
    return fallback;
  }
}

const ExecutiveDashboardsPage: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const { hasPermission, user } = useSupabaseAuth();
  const { toast } = useToast();

  // Export should be available to exec roles; fall back to true if permission table isn't wired in a customer env.
  const canExport = hasPermission?.("reports.export") ?? true;

  const [filters, setFilters] = useState<ExecDashboardFilters>({
    timeMode: "period",
    selectedMonth: toYM(new Date()),
    selectedMonths: [],
    months: 12,
    departmentId: null,
    evaluationScope: "all",
  });
  const [savedFilters, setSavedFilters] = useState<SavedExecFilter[]>(() => loadSavedExecFilters());
  const [selectedSavedId, setSelectedSavedId] = useState<string>("__none__");
  const [saveName, setSaveName] = useState<string>("");

  const [deptColumns, setDeptColumns] = useState({
    same: true,
    cross: true,
    participation: true,
    employees: true,
  });

  const [peopleColumns, setPeopleColumns] = useState({
    dept: true,
  });

  // Load server-side saved filters (if migration is applied). Falls back to localStorage automatically.
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    (async () => {
      const server = await loadSavedExecFiltersServer(uid);
      if (server.length) {
        // Merge local + server (prefer server by id uniqueness)
        const local = loadSavedExecFilters().map((f) => ({ ...f, source: 'local' as const }));
        const byId = new Map<string, SavedExecFilter>();
        for (const f of [...server, ...local]) byId.set(f.id, f);
        setSavedFilters(Array.from(byId.values()).sort((a, b) => (b.createdAtIso > a.createdAtIso ? 1 : -1)));
      }
    })();
  }, [user?.id]);

  useEffect(() => {
    if (selectedSavedId === "__none__") return;
    const found = savedFilters.find((f) => f.id === selectedSavedId);
    if (!found) return;
    setFilters(found.filters);
  }, [selectedSavedId, savedFilters]);

  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRow[]>([]);

  const canManageActions = (hasPermission?.("actions.manage") ?? false) || (hasPermission?.("users.manage") ?? false);
  const canViewActions = (hasPermission?.("actions.view") ?? true);

  const [flags, setFlags] = useState<Record<string, boolean>>({}); // profileId -> flagged

  const [tickets, setTickets] = useState<any[]>([]);
  const [ticketTargets, setTicketTargets] = useState<any[]>([]);

  // People selection for bulk actions
  const [selectedPeople, setSelectedPeople] = useState<Record<string, boolean>>({});
  const selectedPeopleIds = useMemo(
    () => Object.keys(selectedPeople).filter((k) => selectedPeople[k]),
    [selectedPeople]
  );

  // Ticket creation
  const [createTicketOpen, setCreateTicketOpen] = useState(false);
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketDueDate, setTicketDueDate] = useState<string>("");
  const [ticketSeverity, setTicketSeverity] = useState<'low'|'medium'|'high'>('medium');
  const [creatingTicket, setCreatingTicket] = useState(false);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      // Keep queries simple (and fast). If a column is missing in a customer DB, the dashboard still renders.
      const nextProfiles = await safeSelect(
        supabase.from("profiles").select("id,name_en,name_ar,department_id,is_active,deleted_at") as any,
        [] as ProfileRow[],
      );
      const nextDepts = await safeSelect(
        supabase.from("departments").select("id,name_en,name_ar") as any,
        [] as DepartmentRow[],
      );
      const nextEvals = await safeSelect(
        supabase
          .from("evaluations")
          .select(
            "id,evaluatee_id,evaluator_id,evaluation_type,status,performance_score,teamwork_score,workload_score,created_at",
          )
          .eq("status", "completed") as any,
        [] as EvaluationRow[],
      );

      setProfiles(nextProfiles.filter((profile) => profile.is_active !== false && profile.deleted_at == null));
      setDepartments(nextDepts);
      setEvaluations(nextEvals);
      setLoading(false);
    };

    void run();
  }, []);

  // Load flags + action tickets (best-effort; if Step 5 migration isn't run yet, we just hide the data)
  useEffect(() => {
    if (!canViewActions) return;
    (async () => {
      const rows = await loadDashboardFlags();
      const next: Record<string, boolean> = {};
      for (const r of rows) {
        if (r.target_type === "profile") next[r.target_id] = true;
      }
      setFlags(next);

      const t = await loadActionTickets();
      setTickets(t.tickets as any);
      setTicketTargets(t.targets as any);
    })();
  }, [canViewActions]);

  const filteredProfiles = useMemo(() => {
    if (!filters.departmentId) return profiles;
    return profiles.filter((p) => p.department_id === filters.departmentId);
  }, [profiles, filters.departmentId]);

  const filteredEvaluations = useMemo(() => {
    let next = evaluations;

    // --- Time filter (Month / Period)
    const mode = filters.timeMode ?? "period";
    const selectedMonth = (filters.selectedMonth || "").trim();
    const selectedMonths = Array.isArray(filters.selectedMonths)
      ? filters.selectedMonths.map((x) => String(x).trim()).filter(Boolean)
      : [];

    const byMonthKey = (iso?: string) => {
      if (!iso) return null;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      return toYM(d);
    };

    if (mode === "month" && selectedMonth) {
      const { start, end } = ymToRange(selectedMonth);
      next = next.filter((e) => {
        const d = e.created_at ? new Date(e.created_at) : null;
        return d ? d >= start && d < end : true;
      });
    } else if (mode === "period" && selectedMonths.length) {
      const set = new Set(selectedMonths);
      next = next.filter((e) => {
        const k = byMonthKey(e.created_at);
        return k ? set.has(k) : true;
      });
    } else if (filters.months > 0) {
      // Fallback (legacy): last N months
      const since = new Date();
      since.setMonth(since.getMonth() - filters.months);
      next = next.filter((e) => {
        const d = e.created_at ? new Date(e.created_at) : null;
        return d ? d >= since : true;
      });
    }

    // Scope filter
    if (filters.evaluationScope === "same") {
      next = next.filter((e) => !isCross(e.evaluation_type));
    } else if (filters.evaluationScope === "cross") {
      next = next.filter((e) => isCross(e.evaluation_type));
    }

    // Department filter applies to evaluatees
    if (filters.departmentId) {
      const allowed = new Set(filteredProfiles.map((p) => p.id));
      next = next.filter((e) => allowed.has(e.evaluatee_id));
    }

    return next;
  }, [evaluations, filters.months, filters.timeMode, filters.selectedMonth, filters.selectedMonths, filters.evaluationScope, filters.departmentId, filteredProfiles]);

  const totals = useMemo(() => {
    const scoped = filteredEvaluations;
    const totalEmployees = filteredProfiles.length;
    const activeProfileIds = new Set(filteredProfiles.map((profile) => profile.id));
    const totalCompleted = scoped.length;
    const same = scoped.filter((e) => !isCross(e.evaluation_type));
    const cross = scoped.filter((e) => isCross(e.evaluation_type));

    const avgSame = averageEvaluationScore(same) ?? 0;
    const avgCross = averageEvaluationScore(cross) ?? 0;

    const evaluatedEmployees = new Set(scoped.map((e) => e.evaluatee_id).filter((id) => activeProfileIds.has(id)));
    const participation = totalEmployees ? (evaluatedEmployees.size / totalEmployees) * 100 : 0;

    return {
      totalEmployees,
      totalCompleted,
      avgSame,
      avgCross,
      participation,
    };
  }, [filteredProfiles, filteredEvaluations]);

  const trendData = useMemo(() => {
    // Uses existing util (based on created_at).
    return buildTrendFromEvaluations(filteredEvaluations as any, language, filters.months);
  }, [filteredEvaluations, language, filters.months]);

  const campaignBreakdown = useMemo(() => buildCampaignBreakdown(filteredEvaluations), [filteredEvaluations]);

  const departmentBenchmarks = useMemo(() => {
    const now = new Date();
    const minDate = new Date(now);
    minDate.setMonth(minDate.getMonth() - Math.max(1, filters.months));

    const deptFilterId = filters.departmentId;

    // Build department-level benchmarks similar to CompanyDashboard.
    const byDeptEmployees = new Map<string, string[]>();
    for (const p of profiles) {
      if (!p.department_id) continue;
      if (!byDeptEmployees.has(p.department_id)) byDeptEmployees.set(p.department_id, []);
      byDeptEmployees.get(p.department_id)!.push(p.id);
    }

    const filteredDepartments = deptFilterId ? departments.filter((d) => d.id === deptFilterId) : departments;

    const scopedEvaluations = evaluations.filter((e) => {
      const dt = e.created_at ? new Date(e.created_at) : now;
      if (dt < minDate) return false;
      if (filters.evaluationScope === "same" && isCross(e.evaluation_type)) return false;
      if (filters.evaluationScope === "cross" && !isCross(e.evaluation_type)) return false;
      return true;
    });

    return filteredDepartments
      .map((d) => {
        const empIds = byDeptEmployees.get(d.id) ?? [];
        const empIdSet = new Set(empIds);
        const deptEvals = empIds.length ? scopedEvaluations.filter((e) => empIdSet.has(e.evaluatee_id)) : [];
        const same = deptEvals.filter((e) => !isCross(e.evaluation_type));
        const cross = deptEvals.filter((e) => isCross(e.evaluation_type));

        const avgSameDept = averageEvaluationScore(same) ?? 0;
        const avgCrossDept = averageEvaluationScore(cross) ?? 0;

        const evaluated = new Set(deptEvals.map((e) => e.evaluatee_id).filter((id) => empIdSet.has(id)));
        const participation = empIds.length ? (evaluated.size / empIds.length) * 100 : 0;

        return {
          id: d.id,
          nameEn: d.name_en,
          nameAr: d.name_ar,
          avgSameDept,
          avgCrossDept,
          employeeCount: empIds.length,
          participation: Math.round(participation),
          alertCount: 0,
        };
      })
      .sort((a, b) => b.avgSameDept - a.avgSameDept);
  }, [profiles, departments, evaluations, filters]);

  const peopleStats = useMemo(() => {
    const now = new Date();
    const minDate = new Date(now);
    minDate.setMonth(minDate.getMonth() - Math.max(1, filters.months));

    const deptEmployeeIds = filters.departmentId
      ? new Set(profiles.filter((p) => p.department_id === filters.departmentId).map((p) => p.id))
      : null;

    const scopedEvaluations = evaluations.filter((e) => {
      const dt = e.created_at ? new Date(e.created_at) : now;
      if (dt < minDate) return false;
      if (deptEmployeeIds && !deptEmployeeIds.has(e.evaluatee_id)) return false;
      if (filters.evaluationScope === "same" && isCross(e.evaluation_type)) return false;
      if (filters.evaluationScope === "cross" && !isCross(e.evaluation_type)) return false;
      return true;
    });

    // Aggregate per employee.
    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const deptMap = new Map(departments.map((d) => [d.id, d]));

    const scoreByUser: Record<string, { same: number[]; cross: number[]; workload: number[]; months: Record<string, number[]> }> = {};
    for (const e of scopedEvaluations) {
      if (!scoreByUser[e.evaluatee_id]) {
        scoreByUser[e.evaluatee_id] = { same: [], cross: [], workload: [], months: {} };
      }
      const monthKey = (e.created_at ? new Date(e.created_at) : new Date()).toISOString().slice(0, 7);
      if (!scoreByUser[e.evaluatee_id].months[monthKey]) scoreByUser[e.evaluatee_id].months[monthKey] = [];

      if (isCross(e.evaluation_type)) {
        const v = safeNum(e.teamwork_score);
        scoreByUser[e.evaluatee_id].cross.push(v);
        scoreByUser[e.evaluatee_id].months[monthKey].push(v);
      } else {
        const v = safeNum(e.performance_score);
        scoreByUser[e.evaluatee_id].same.push(v);
        scoreByUser[e.evaluatee_id].months[monthKey].push(v);
      }
      if (e.workload_score !== null && e.workload_score !== undefined) {
        scoreByUser[e.evaluatee_id].workload.push(safeNum(e.workload_score));
      }
    }

    const rows = Object.entries(scoreByUser)
      .map(([userId, s]) => {
        const p = profileMap.get(userId);
        const dept = p?.department_id ? deptMap.get(p.department_id) : undefined;

        const avgSame = s.same.length ? s.same.reduce((a, b) => a + b, 0) / s.same.length : 0;
        const avgCross = s.cross.length ? s.cross.reduce((a, b) => a + b, 0) / s.cross.length : 0;
        const overall = (avgSame + avgCross) / (avgSame && avgCross ? 2 : 1);

        // Volatility proxy: avg absolute delta between last two months with data.
        const monthKeys = Object.keys(s.months).sort();
        let volatility = 0;
        if (monthKeys.length >= 2) {
          const last = monthKeys[monthKeys.length - 1];
          const prev = monthKeys[monthKeys.length - 2];
          const lastAvg = s.months[last].reduce((a, b) => a + b, 0) / s.months[last].length;
          const prevAvg = s.months[prev].reduce((a, b) => a + b, 0) / s.months[prev].length;
          volatility = Math.abs(lastAvg - prevAvg);
        }

        return {
          userId,
          nameEn: p?.name_en ?? userId,
          nameAr: p?.name_ar ?? userId,
          deptEn: dept?.name_en ?? "—",
          deptAr: dept?.name_ar ?? "—",
          avgSame,
          avgCross,
          overall,
          volatility,
        };
      })
      .sort((a, b) => b.overall - a.overall);

    const top = rows.slice(0, 10);
    const bottom = [...rows].reverse().slice(0, 10);
    const risky = [...rows]
      .sort((a, b) => b.volatility - a.volatility)
      .slice(0, 10);

    return { top, bottom, risky, totalRated: rows.length };
  }, [profiles, departments, evaluations, filters]);

  const executiveNotes = useMemo(() => {
    const notes: string[] = [];
    const t = trendData as Array<{ sameDept: number | null; crossDept: number | null; month?: string; monthKey?: string }>;
    const overall = (p: any) => {
      const s = typeof p?.sameDept === "number" ? p.sameDept : null;
      const c = typeof p?.crossDept === "number" ? p.crossDept : null;
      if (typeof s === "number" && typeof c === "number") return (s + c) / 2;
      if (typeof s === "number") return s;
      if (typeof c === "number") return c;
      return 0;
    };
    if (t.length >= 2) {
      const last = overall(t[t.length - 1]);
      const prev = overall(t[t.length - 2]);
      const diff = last - prev;
      const label = isAr ? "تغير الاتجاه عن الشهر السابق" : "Trend vs previous month";
      notes.push(`${label}: ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}`);
    }

    // Participation risks
    const lowPart = departmentBenchmarks.filter((d) => d.participation < 70).slice(0, 3);
    if (lowPart.length) {
      notes.push(
        (isAr ? "أقسام بحاجة متابعة (مشاركة منخفضة): " : "Low participation departments: ") +
          lowPart.map((d) => (isAr ? d.nameAr : d.nameEn)).join(", "),
      );
    }

    // Biggest drop among departments (same-dept average)
    const lastTwoMonths = (() => {
      const months = new Set<string>();
      for (const e of filteredEvaluations) {
        const k = (e.created_at ? new Date(e.created_at) : new Date()).toISOString().slice(0, 7);
        months.add(k);
      }
      return [...months].sort().slice(-2);
    })();

    if (lastTwoMonths.length === 2) {
      const [m1, m2] = lastTwoMonths;
      const deptDiffs = departmentBenchmarks
        .map((d) => {
          const empIds = profiles.filter((p) => p.department_id === d.id).map((p) => p.id);
          const m1E = filteredEvaluations.filter(
            (e) => !isCross(e.evaluation_type) && empIds.includes(e.evaluatee_id) && (e.created_at ? e.created_at.slice(0, 7) : "") === m1,
          );
          const m2E = filteredEvaluations.filter(
            (e) => !isCross(e.evaluation_type) && empIds.includes(e.evaluatee_id) && (e.created_at ? e.created_at.slice(0, 7) : "") === m2,
          );
          const a1 = m1E.length ? m1E.reduce((s, e) => s + safeNum(e.performance_score), 0) / m1E.length : 0;
          const a2 = m2E.length ? m2E.reduce((s, e) => s + safeNum(e.performance_score), 0) / m2E.length : 0;
          return { d, diff: a2 - a1 };
        })
        .filter((x) => Number.isFinite(x.diff));

      const best = [...deptDiffs].sort((a, b) => b.diff - a.diff)[0];
      const worst = [...deptDiffs].sort((a, b) => a.diff - b.diff)[0];

      if (best) {
        notes.push(
          (isAr ? "أكبر تحسن: " : "Biggest improvement: ") +
            `${isAr ? best.d.nameAr : best.d.nameEn} (${best.diff >= 0 ? "+" : ""}${best.diff.toFixed(1)})`,
        );
      }
      if (worst) {
        notes.push(
          (isAr ? "أكبر انخفاض: " : "Biggest drop: ") +
            `${isAr ? worst.d.nameAr : worst.d.nameEn} (${worst.diff >= 0 ? "+" : ""}${worst.diff.toFixed(1)})`,
        );
      }
    }

    return notes;
  }, [trendData, departmentBenchmarks, filteredEvaluations, profiles, isAr]);

  const ops = useMemo(() => {
    return {
      completed: totals.totalCompleted,
      completionRate: totals.totalEmployees ? (peopleStats.totalRated / totals.totalEmployees) * 100 : 0,
    };
  }, [totals.totalCompleted, totals.totalEmployees, peopleStats.totalRated]);

  const exportPayload = useMemo(() => {
    const scopeLabel = filters.evaluationScope;
    return {
      meta: {
        generatedAtIso: new Date().toISOString(),
        language: (isAr ? "ar" : "en") as "en" | "ar",
        months: filters.months,
        departmentId: filters.departmentId,
        evaluationScope: scopeLabel,
      },
      overview: [
        { label: isAr ? "إجمالي الموظفين" : "Total Employees", value: totals.totalEmployees },
        { label: isAr ? "التقييمات المكتملة" : "Completed Evaluations", value: totals.totalCompleted },
        { label: isAr ? "متوسط نفس القسم" : "Avg Same Dept", value: totals.avgSame.toFixed(2) },
        { label: isAr ? "متوسط عبر الأقسام" : "Avg Cross Dept", value: totals.avgCross.toFixed(2) },
        { label: isAr ? "مشاركة الشركة" : "Participation", value: pct(totals.participation) },
      ],
      trend: (trendData as any[]).map((r) => ({
        month: r.month ?? "",
        month_key: r.monthKey ?? "",
        same_dept_avg: r.sameDept ?? null,
        cross_dept_avg: r.crossDept ?? null,
        overall_avg:
          typeof r.sameDept === "number" && typeof r.crossDept === "number"
            ? Number(((r.sameDept + r.crossDept) / 2).toFixed(2))
            : typeof r.sameDept === "number"
              ? r.sameDept
              : typeof r.crossDept === "number"
                ? r.crossDept
                : null,
      })),
      departments: departmentBenchmarks.map((d, idx) => ({
        rank: idx + 1,
        department_id: d.id,
        department: isAr ? d.nameAr : d.nameEn,
        same_avg: d.avgSameDept.toFixed(2),
        cross_avg: d.avgCrossDept.toFixed(2),
        participation_pct: d.participation,
        employees: d.employeeCount,
      })),
      peopleTop: peopleStats.top.map((r) => ({
        user_id: r.userId,
        name: isAr ? r.nameAr : r.nameEn,
        department: isAr ? r.deptAr : r.deptEn,
        same_avg: r.avgSame.toFixed(2),
        cross_avg: r.avgCross.toFixed(2),
        overall: r.overall.toFixed(2),
      })),
      peopleBottom: peopleStats.bottom.map((r) => ({
        user_id: r.userId,
        name: isAr ? r.nameAr : r.nameEn,
        department: isAr ? r.deptAr : r.deptEn,
        same_avg: r.avgSame.toFixed(2),
        cross_avg: r.avgCross.toFixed(2),
        overall: r.overall.toFixed(2),
      })),
      peopleVolatility: peopleStats.risky.map((r) => ({
        user_id: r.userId,
        name: isAr ? r.nameAr : r.nameEn,
        volatility: r.volatility.toFixed(2),
      })),
      ops: [{
        completion_rate: pct(ops.completionRate),
        employees_rated: peopleStats.totalRated,
        completed: ops.completed,
      }],
      notes: executiveNotes.map((n) => ({ note: n })),
    };
  }, [filters, isAr, totals, trendData, departmentBenchmarks, peopleStats, ops, executiveNotes]);

  const handleExportXlsx = () => {
    try {
      exportExecutiveDashboardsToXlsx(exportPayload);
      toast({ title: isAr ? "تم تصدير Excel" : "Excel exported" });
    } catch {
      toast({ title: isAr ? "فشل التصدير" : "Export failed", variant: "destructive" });
    }
  };

  const handleExportPdf = () => {
    try {
      exportExecutiveDashboardsToPdf(exportPayload);
      toast({ title: isAr ? "تم تصدير PDF" : "PDF exported" });
    } catch {
      toast({ title: isAr ? "فشل التصدير" : "Export failed", variant: "destructive" });
    }
  };

  const handleExportAllDataXlsx = () => {
    try {
      const profileMap = new Map(profiles.map((p) => [p.id, p]));
      const deptMap = new Map(departments.map((d) => [d.id, d]));
      const evalRows = filteredEvaluations.map((e) => ({
        id: e.id,
        created_at: e.created_at,
        status: e.status,
        evaluation_type: e.evaluation_type,
        evaluatee_id: e.evaluatee_id,
        evaluatee_name_en: profileMap.get(e.evaluatee_id)?.name_en || "",
        evaluatee_name_ar: profileMap.get(e.evaluatee_id)?.name_ar || "",
        evaluatee_department_id: profileMap.get(e.evaluatee_id)?.department_id || "",
        evaluatee_department_en: profileMap.get(e.evaluatee_id)?.department_id ? (deptMap.get(profileMap.get(e.evaluatee_id)!.department_id!)?.name_en || "") : "",
        evaluatee_department_ar: profileMap.get(e.evaluatee_id)?.department_id ? (deptMap.get(profileMap.get(e.evaluatee_id)!.department_id!)?.name_ar || "") : "",
        evaluator_id: e.evaluator_id,
        performance_score: e.performance_score,
        teamwork_score: e.teamwork_score,
        workload_score: e.workload_score,
      }));

      downloadXlsx(
        `executive_dashboards_full_${new Date().toISOString().slice(0, 10)}.xlsx`,
        [
          { name: "Filters", rows: [{ ...filters }] },
          { name: "Profiles", rows: profiles },
          { name: "Departments", rows: departments },
          { name: "Evaluations (filtered)", rows: evalRows },
          { name: "Dept Benchmarks", rows: departmentBenchmarks.map((d: any) => ({
              department_id: d.id,
              department_en: d.nameEn,
              department_ar: d.nameAr,
              avg_same: d.avgSameDept,
              avg_cross: d.avgCrossDept,
              participation_pct: d.participation,
              employees: d.employeeCount,
            })) as any },
          { name: "People Top", rows: peopleStats.top.map((r: any) => ({ ...r, department_id: profileMap.get(r.userId)?.department_id || "" })) as any },
          { name: "People Bottom", rows: peopleStats.bottom.map((r: any) => ({ ...r, department_id: profileMap.get(r.userId)?.department_id || "" })) as any },
          { name: "People Volatility", rows: peopleStats.risky.map((r: any) => ({ ...r, department_id: profileMap.get(r.userId)?.department_id || "" })) as any },
          { name: "Action Tickets", rows: tickets.map((t: any) => ({
              ...t,
              targets: ticketTargets.filter((x: any) => x.ticket_id === t.id).map((x: any) => `${x.target_type}:${x.target_id}`).join(", "),
            })) },
        ]
      );

      toast({ title: isAr ? "تم تصدير كل البيانات" : "All data exported" });
    } catch {
      toast({ title: isAr ? "فشل التصدير" : "Export failed", variant: "destructive" });
    }
  };

  const handleExportSelectedPeople = () => {
    try {
      if (!selectedPeopleIds.length) {
        toast({ title: isAr ? "اختر موظفين أولاً" : "Select people first", variant: "destructive" });
        return;
      }
      const selected = peopleStats.risky
        .concat(peopleStats.bottom)
        .concat(peopleStats.top)
        .filter((p: any) => selectedPeopleIds.includes(p.userId));

      const withDeptId = selected.map((r: any) => {
        const p = profiles.find((x) => x.id === r.userId);
        return { ...r, department_id: p?.department_id || "" };
      });

      downloadXlsx(
        `selected_people_${new Date().toISOString().slice(0, 10)}.xlsx`,
        [{ name: "Selected People", rows: withDeptId as any }]
      );
      toast({ title: isAr ? "تم تصدير المحدد" : "Selected exported" });
    } catch {
      toast({ title: isAr ? "فشل التصدير" : "Export failed", variant: "destructive" });
    }
  };

  const handleToggleFlag = async (profileId: string) => {
    const ok = await toggleProfileFlag(profileId);
    if (!ok) {
      toast({ title: isAr ? "فشل تحديث العلامة" : "Failed to update flag", variant: "destructive" });
      return;
    }
    setFlags((prev) => ({ ...prev, [profileId]: !prev[profileId] }));
  };

  const handleFlagSelected = async () => {
    if (!selectedPeopleIds.length) {
      toast({ title: isAr ? "اختر موظفين" : "Select people", variant: "destructive" });
      return;
    }
    for (const id of selectedPeopleIds) {
      if (flags[id]) continue;
      await toggleProfileFlag(id);
    }
    const rows = await loadDashboardFlags();
    const next: Record<string, boolean> = {};
    for (const r of rows) if (r.target_type === 'profile') next[r.target_id] = true;
    setFlags(next);
    toast({ title: isAr ? "تم وضع علامة" : "Flagged" });
  };

  const handleCreateTicket = async () => {
    if (!ticketTitle.trim()) {
      toast({ title: isAr ? "اكتب عنواناً" : "Enter a title", variant: "destructive" });
      return;
    }
    if (!selectedPeopleIds.length) {
      toast({ title: isAr ? "اختر موظفين" : "Select people", variant: "destructive" });
      return;
    }
    setCreatingTicket(true);
    const targets = selectedPeopleIds.map((id) => {
      const p = profiles.find((x) => x.id === id);
      return {
        target_type: "profile" as const,
        target_id: id,
        label: p ? `${p.name_en} / ${p.name_ar}` : id,
      };
    });
    const id = await createActionTicket({
      title: ticketTitle,
      description: ticketDescription,
      severity: ticketSeverity,
      due_date: ticketDueDate || undefined,
      targets,
    });
    setCreatingTicket(false);
    if (!id) {
      toast({ title: isAr ? "فشل إنشاء المهمة" : "Failed to create ticket", variant: "destructive" });
      return;
    }
    toast({ title: isAr ? "تم إنشاء المهمة" : "Ticket created" });
    setCreateTicketOpen(false);
    setTicketTitle("");
    setTicketDescription("");
    setTicketDueDate("");
    setTicketSeverity('medium');
    setSelectedPeople({});
    const t = await loadActionTickets();
    setTickets(t.tickets as any);
    setTicketTargets(t.targets as any);
  };

  const applySaved = (id: string) => {
    setSelectedSavedId(id);
    if (id === "__none__") return;
    const found = savedFilters.find((s) => s.id === id);
    if (found) setFilters(found.filters);
  };

  const doSaveCurrent = async () => {
    // Try server first, then local.
    const uid = user?.id;
    if (uid) {
      const serverItem = await saveExecFilterServer(uid, saveName, filters);
      if (serverItem) {
        setSavedFilters([serverItem, ...savedFilters]);
        setSelectedSavedId(serverItem.id);
        setSaveName("");
        toast({ title: isAr ? "تم حفظ الفلتر" : "Filter saved" });
        return;
      }
    }

    const localItem = { ...saveExecFilter(saveName, filters), source: 'local' as const };
    setSavedFilters([localItem, ...savedFilters]);
    setSelectedSavedId(localItem.id);
    setSaveName("");
    toast({ title: isAr ? "تم حفظ الفلتر" : "Filter saved" });
  };

  const doDeleteSelected = async () => {
    if (selectedSavedId === "__none__") return;
    const selected = savedFilters.find((f) => f.id === selectedSavedId);
    if (selected?.source === 'server') {
      await deleteExecFilterServer(selectedSavedId);
      setSavedFilters(savedFilters.filter((f) => f.id !== selectedSavedId));
    } else {
      const next = deleteExecFilter(selectedSavedId);
      setSavedFilters(next);
    }
    setSelectedSavedId("__none__");
    toast({ title: isAr ? "تم حذف الفلتر" : "Filter deleted" });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profiles.length || !departments.length) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={isAr ? "لوحات الإدارة التنفيذية" : "Executive Dashboards"} />
        <div className="p-6">
          <EmptyState
            title={isAr ? "لا توجد بيانات كافية" : "Not enough data"}
            description={
              isAr
                ? "يجب إضافة موظفين وأقسام ثم إكمال بعض التقييمات لعرض لوحات الإدارة التنفيذية."
                : "Add departments and employees, then complete some evaluations to populate the executive dashboards."
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header
        title={isAr ? "لوحات الإدارة التنفيذية" : "Executive Dashboards"}
        subtitle={
          isAr
            ? "نظرة شاملة على الأداء والمخاطر ومؤشرات التشغيل"
            : "Company performance, risk signals, and operational KPIs"
        }
      />

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isAr ? "الفلاتر والتصدير" : "Filters & Export"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[180px]">
                <p className="text-xs text-muted-foreground mb-1">{isAr ? "الوضع" : "Mode"}</p>
                <Select
                  value={filters.timeMode ?? "period"}
                  onValueChange={(v) =>
                    setFilters((f) => ({
                      ...f,
                      timeMode: v as any,
                      // Keep current selections; just switch behavior.
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isAr ? "اختر" : "Select"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">{isAr ? "شهر" : "Month"}</SelectItem>
                    <SelectItem value="period">{isAr ? "فترة" : "Period"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[260px]">
                <p className="text-xs text-muted-foreground mb-1">{isAr ? "الشهر / الفترة" : "Month / period"}</p>

                {(filters.timeMode ?? "period") === "month" ? (
                  <Select
                    value={(filters.selectedMonth || toYM(new Date())) as string}
                    onValueChange={(v) => setFilters((f) => ({ ...f, selectedMonth: v, selectedMonths: [] }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={isAr ? "اختر الشهر" : "Select month"} />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions(24).map((ym) => (
                        <SelectItem key={ym} value={ym}>
                          {ym}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="secondary" className="justify-between w-[220px]">
                          {filters.selectedMonths?.length
                            ? isAr
                              ? `تم اختيار ${filters.selectedMonths.length}`
                              : `${filters.selectedMonths.length} selected`
                            : isAr
                              ? "اختر الأشهر"
                              : "Select months"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[260px] max-h-[340px] overflow-auto">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">{isAr ? "الأشهر" : "Months"}</p>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setFilters((f) => ({ ...f, selectedMonths: [] }))}
                            >
                              {isAr ? "مسح" : "Clear"}
                            </Button>
                          </div>
                          {monthOptions(24).map((ym) => {
                            const checked = !!filters.selectedMonths?.includes(ym);
                            return (
                              <div key={ym} className="flex items-center gap-2">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(c) => {
                                    setFilters((f) => {
                                      const cur = Array.isArray(f.selectedMonths) ? [...f.selectedMonths] : [];
                                      const has = cur.includes(ym);
                                      const next = c ? (has ? cur : [...cur, ym]) : cur.filter((x) => x !== ym);
                                      return { ...f, selectedMonths: next };
                                    });
                                  }}
                                />
                                <span className="text-sm">{ym}</span>
                              </div>
                            );
                          })}

                          <div className="pt-2 border-t">
                            <p className="text-xs text-muted-foreground mb-1">
                              {isAr ? "إذا لم تختَر أشهرًا، سنستخدم المدة الافتراضية" : "If no months are selected, we use the default range"}
                            </p>
                            <Select
                              value={String(filters.months)}
                              onValueChange={(v) => setFilters((f) => ({ ...f, months: Number(v) }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={isAr ? "اختر" : "Select"} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="3">{isAr ? "آخر 3 أشهر" : "Last 3 months"}</SelectItem>
                                <SelectItem value="6">{isAr ? "آخر 6 أشهر" : "Last 6 months"}</SelectItem>
                                <SelectItem value="12">{isAr ? "آخر 12 شهر" : "Last 12 months"}</SelectItem>
                                <SelectItem value="24">{isAr ? "آخر 24 شهر" : "Last 24 months"}</SelectItem>
                                <SelectItem value="0">{isAr ? "الكل" : "All time"}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>

              <div className="min-w-[180px]">
                <p className="text-xs text-muted-foreground mb-1">{isAr ? "نوع التقييم" : "Evaluation scope"}</p>
                <Select
                  value={filters.evaluationScope}
                  onValueChange={(v) => setFilters((f) => ({ ...f, evaluationScope: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isAr ? "اختر" : "Select"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                    <SelectItem value="same">{isAr ? "نفس القسم" : "Same dept"}</SelectItem>
                    <SelectItem value="cross">{isAr ? "عبر الأقسام" : "Cross dept"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[220px]">
                <p className="text-xs text-muted-foreground mb-1">{isAr ? "القسم" : "Department"}</p>
                <Select
                  value={filters.departmentId ?? "__all__"}
                  onValueChange={(v) => setFilters((f) => ({ ...f, departmentId: v === "__all__" ? null : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isAr ? "الكل" : "All"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{isAr ? "كل الأقسام" : "All departments"}</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {isAr ? d.name_ar : d.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[240px]">
                <p className="text-xs text-muted-foreground mb-1">{isAr ? "فلاتر محفوظة" : "Saved filters"}</p>
                <Select value={selectedSavedId} onValueChange={applySaved}>
                  <SelectTrigger>
                    <SelectValue placeholder={isAr ? "لا يوجد" : "None"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{isAr ? "بدون" : "None"}</SelectItem>
                    {savedFilters.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary">{isAr ? "حفظ الفلتر" : "Save filter"}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{isAr ? "حفظ الفلتر الحالي" : "Save current filter"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {isAr
                        ? "اكتب اسم بسيط ليسهل الرجوع إليه لاحقاً."
                        : "Choose a short name so you can re-use it later."}
                    </p>
                    <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder={isAr ? "مثال: الإدارة الطبية" : "e.g., Medical Admin"} />
                  </div>
                  <DialogFooter>
                    <Button onClick={doSaveCurrent}>{isAr ? "حفظ" : "Save"}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                variant="outline"
                disabled={selectedSavedId === "__none__"}
                onClick={doDeleteSelected}
              >
                {isAr ? "حذف" : "Delete"}
              </Button>

              <div className="flex-1" />

              {canExport ? (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleExportXlsx}>{isAr ? "تصدير Excel" : "Export Excel"}</Button>
                  <Button variant="secondary" onClick={handleExportAllDataXlsx}>
                    {isAr ? "تصدير كل البيانات" : "Export All Data"}
                  </Button>
                  <Button variant="outline" onClick={handleExportPdf}>
                    {isAr ? "تصدير PDF" : "Export PDF"}
                  </Button>
                </div>
              ) : null}
            </div>
            {executiveNotes.length ? (
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium mb-2">{isAr ? "ملخص تنفيذي" : "Executive Summary"}</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                  {executiveNotes.map((n, idx) => (
                    <li key={idx}>{n}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Tabs defaultValue="overview">
          <TabsList className="w-full flex flex-wrap justify-start gap-2">
            <TabsTrigger value="overview">{isAr ? "نظرة عامة" : "Overview"}</TabsTrigger>
            <TabsTrigger value="departments">{isAr ? "الأقسام" : "Departments"}</TabsTrigger>
            <TabsTrigger value="people">{isAr ? "الأفراد والمخاطر" : "People & Risk"}</TabsTrigger>
            <TabsTrigger value="ops">{isAr ? "تشغيل التقييمات" : "Survey Ops"}</TabsTrigger>
            <TabsTrigger value="custom">{isAr ? "لوحات مخصصة" : "Custom Dashboards"}</TabsTrigger>
            {canViewActions ? (
              <TabsTrigger value="actions">{isAr ? "المتابعات" : "Actions"}</TabsTrigger>
            ) : null}
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <KPICard
                title={isAr ? "إجمالي الموظفين" : "Total Employees"}
                value={totals.totalEmployees}
                icon={<Users className="w-4 h-4" />}
              />
              <KPICard
                title={isAr ? "التقييمات المكتملة" : "Completed Evaluations"}
                value={totals.totalCompleted}
                icon={<ClipboardCheck className="w-4 h-4" />}
              />
              <KPICard
                title={isAr ? "متوسط نفس القسم" : "Avg Same Dept"}
                value={Number(totals.avgSame.toFixed(1))}
                icon={<TrendingUp className="w-4 h-4" />}
                sparklineData={(trendData as any[])
                  .map((d: any) => Number(d?.sameDept ?? 0))
                  .filter((n: number) => Number.isFinite(n))}
              />
              <KPICard
                title={isAr ? "متوسط عبر الأقسام" : "Avg Cross Dept"}
                value={Number(totals.avgCross.toFixed(1))}
                icon={<TrendingUp className="w-4 h-4" />}
                sparklineData={(trendData as any[])
                  .map((d: any) => Number(d?.crossDept ?? 0))
                  .filter((n: number) => Number.isFinite(n))}
              />
            </div>

            <div className="mt-6">
              <EvaluationCampaignBreakdown
                title={isAr ? "تفصيل أنواع حملات التقييم" : "Evaluation Campaign Type Breakdown"}
                subtitle={isAr ? "يعكس الهيكل الجديد: داخلي للوحدة، بين الوحدات، بين الأقسام، المدير للفريق، والفريق للمدير." : "Reflects the new structure: self unit, cross station, cross department, manager-to-team, and team-to-manager."}
                items={campaignBreakdown}
                language={language}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="w-4 h-4" />
                    {isAr ? "اتجاه الأداء الشهري" : "Monthly Trend"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TrendLineChart data={trendData as any} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="w-4 h-4" />
                    {isAr ? "مقارنة الأقسام" : "Department Benchmark"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DepartmentBenchmarkChart data={departmentBenchmarks as any} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* DEPARTMENTS */}
          <TabsContent value="departments">
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <CardTitle className="text-base">{isAr ? "ترتيب الأقسام" : "Department Ranking"}</CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <SlidersHorizontal className="w-4 h-4" />
                        {isAr ? "الأعمدة" : "Columns"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align={isAr ? "start" : "end"} className="w-52">
                      <DropdownMenuLabel>{isAr ? "إظهار/إخفاء" : "Show/Hide"}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuCheckboxItem
                        checked={deptColumns.same}
                        onCheckedChange={(v) => setDeptColumns((s) => ({ ...s, same: Boolean(v) }))}
                      >
                        {isAr ? "نفس القسم" : "Same"}
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={deptColumns.cross}
                        onCheckedChange={(v) => setDeptColumns((s) => ({ ...s, cross: Boolean(v) }))}
                      >
                        {isAr ? "عبر الأقسام" : "Cross"}
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={deptColumns.participation}
                        onCheckedChange={(v) => setDeptColumns((s) => ({ ...s, participation: Boolean(v) }))}
                      >
                        {isAr ? "المشاركة" : "Participation"}
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={deptColumns.employees}
                        onCheckedChange={(v) => setDeptColumns((s) => ({ ...s, employees: Boolean(v) }))}
                      >
                        {isAr ? "الموظفين" : "Employees"}
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[520px] overflow-auto rounded-lg border">
                    <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>{isAr ? "القسم" : "Department"}</TableHead>
                        {deptColumns.same ? <TableHead>{isAr ? "نفس القسم" : "Same"}</TableHead> : null}
                        {deptColumns.cross ? <TableHead>{isAr ? "عبر الأقسام" : "Cross"}</TableHead> : null}
                        {deptColumns.participation ? <TableHead>{isAr ? "المشاركة" : "Participation"}</TableHead> : null}
                        {deptColumns.employees ? <TableHead>{isAr ? "الموظفين" : "Employees"}</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {departmentBenchmarks.slice(0, 15).map((d, idx) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">{idx + 1}</TableCell>
                          <TableCell>{isAr ? d.nameAr : d.nameEn}</TableCell>
                          {deptColumns.same ? <TableCell>{d.avgSameDept.toFixed(1)}</TableCell> : null}
                          {deptColumns.cross ? <TableCell>{d.avgCrossDept.toFixed(1)}</TableCell> : null}
                          {deptColumns.participation ? <TableCell>{pct(d.participation)}</TableCell> : null}
                          {deptColumns.employees ? <TableCell>{d.employeeCount}</TableCell> : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{isAr ? "إشارات المخاطر" : "Risk Signals"}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {departmentBenchmarks.slice(-3).reverse().map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{isAr ? d.nameAr : d.nameEn}</p>
                        <p className="text-xs text-muted-foreground">
                          {isAr ? "أقل متوسط (نفس القسم)" : "Lowest same-dept average"}
                        </p>
                      </div>
                      <Badge variant="destructive" className="gap-1">
                        <TrendingDown className="w-3 h-3" />
                        {d.avgSameDept.toFixed(1)}
                      </Badge>
                    </div>
                  ))}
                  <div className="rounded-lg border p-3">
                    <p className="text-sm font-medium">{isAr ? "مشاركة الشركة" : "Company Participation"}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isAr ? "نسبة الموظفين الذين لديهم تقييمات مكتملة" : "Employees with at least one completed evaluation"}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <Badge variant={totals.participation >= 70 ? "default" : "secondary"}>
                        {pct(totals.participation)}
                      </Badge>
                      {totals.participation < 70 ? (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {isAr ? "بحاجة متابعة" : "Needs follow-up"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* PEOPLE & RISK */}
          <TabsContent value="people">
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">{isAr ? "إجراءات جماعية" : "Bulk Actions"}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                <Badge variant={selectedPeopleIds.length ? "default" : "secondary"}>
                  {isAr ? `المحدد: ${selectedPeopleIds.length}` : `Selected: ${selectedPeopleIds.length}`}
                </Badge>
                <div className="flex-1" />
                <Button variant="outline" onClick={handleExportSelectedPeople} disabled={!selectedPeopleIds.length}>
                  {isAr ? "تصدير المحدد" : "Export Selected"}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <SlidersHorizontal className="w-4 h-4" />
                      {isAr ? "الأعمدة" : "Columns"}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align={isAr ? "start" : "end"} className="w-52">
                    <DropdownMenuLabel>{isAr ? "إظهار/إخفاء" : "Show/Hide"}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={peopleColumns.dept}
                      onCheckedChange={(v) => setPeopleColumns((p) => ({ ...p, dept: Boolean(v) }))}
                    >
                      {isAr ? "القسم" : "Department"}
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {canManageActions ? (
                  <>
                    <Button variant="secondary" onClick={handleFlagSelected} disabled={!selectedPeopleIds.length}>
                      {isAr ? "وضع علامة" : "Flag"}
                    </Button>
                    <Dialog open={createTicketOpen} onOpenChange={setCreateTicketOpen}>
                      <DialogTrigger asChild>
                        <Button disabled={!selectedPeopleIds.length}>{isAr ? "إنشاء متابعة" : "Create Follow-up"}</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{isAr ? "إنشاء متابعة" : "Create Follow-up Ticket"}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm mb-1">{isAr ? "العنوان" : "Title"}</p>
                            <Input value={ticketTitle} onChange={(e) => setTicketTitle(e.target.value)} placeholder={isAr ? "مثال: جلسة متابعة أداء" : "e.g., Performance follow-up"} />
                          </div>
                          <div>
                            <p className="text-sm mb-1">{isAr ? "الوصف" : "Description"}</p>
                            <Input value={ticketDescription} onChange={(e) => setTicketDescription(e.target.value)} placeholder={isAr ? "تفاصيل مختصرة" : "Short details"} />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-sm mb-1">{isAr ? "الأولوية" : "Severity"}</p>
                              <Select value={ticketSeverity} onValueChange={(v: any) => setTicketSeverity(v)}>
                                <SelectTrigger><SelectValue placeholder={isAr ? "اختر" : "Choose"} /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="low">{isAr ? "منخفض" : "Low"}</SelectItem>
                                  <SelectItem value="medium">{isAr ? "متوسط" : "Medium"}</SelectItem>
                                  <SelectItem value="high">{isAr ? "مرتفع" : "High"}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <p className="text-sm mb-1">{isAr ? "تاريخ الاستحقاق" : "Due date"}</p>
                              <Input type="date" value={ticketDueDate} onChange={(e) => setTicketDueDate(e.target.value)} />
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {isAr ? "سيتم ربط المتابعة بجميع الموظفين المحددين." : "This follow-up will be linked to all selected employees."}
                          </p>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setCreateTicketOpen(false)}>
                            {isAr ? "إلغاء" : "Cancel"}
                          </Button>
                          <Button onClick={handleCreateTicket} disabled={creatingTicket}>
                            {creatingTicket ? (isAr ? "جارٍ الإنشاء..." : "Creating...") : (isAr ? "إنشاء" : "Create")}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </>
                ) : null}
              </CardContent>
            </Card>
            <div className="grid gap-6 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{isAr ? "أفضل 10" : "Top 10"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[360px] overflow-auto rounded-md border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
                        <TableHead>{isAr ? "الاسم" : "Name"}</TableHead>
                        {peopleColumns.dept ? (
                          <TableHead>{isAr ? "القسم" : "Dept"}</TableHead>
                        ) : null}
                        <TableHead className="text-right">{isAr ? "المجموع" : "Overall"}</TableHead>
                        <TableHead className="w-[90px]">{isAr ? "علامة" : "Flag"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {peopleStats.top.map((r) => (
                        <TableRow key={r.userId}>
                          <TableCell>
                            <Checkbox
                              checked={!!selectedPeople[r.userId]}
                              onCheckedChange={(v) =>
                                setSelectedPeople((prev) => ({ ...prev, [r.userId]: Boolean(v) }))
                              }
                            />
                          </TableCell>
                          <TableCell className="font-medium">{isAr ? r.nameAr : r.nameEn}</TableCell>
                          {peopleColumns.dept ? (
                            <TableCell className="text-muted-foreground">{isAr ? r.deptAr : r.deptEn}</TableCell>
                          ) : null}
                          <TableCell className="text-right">{r.overall.toFixed(1)}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant={flags[r.userId] ? "secondary" : "outline"}
                              disabled={!canManageActions}
                              onClick={() => handleToggleFlag(r.userId)}
                            >
                              {flags[r.userId] ? (isAr ? "معلّم" : "Flagged") : (isAr ? "وضع" : "Flag")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{isAr ? "الأقل 10" : "Bottom 10"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[360px] overflow-auto rounded-md border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
                        <TableHead>{isAr ? "الاسم" : "Name"}</TableHead>
                        {peopleColumns.dept ? (
                          <TableHead>{isAr ? "القسم" : "Dept"}</TableHead>
                        ) : null}
                        <TableHead className="text-right">{isAr ? "المجموع" : "Overall"}</TableHead>
                        <TableHead className="w-[90px]">{isAr ? "علامة" : "Flag"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {peopleStats.bottom.map((r) => (
                        <TableRow key={r.userId}>
                          <TableCell>
                            <Checkbox
                              checked={!!selectedPeople[r.userId]}
                              onCheckedChange={(v) =>
                                setSelectedPeople((prev) => ({ ...prev, [r.userId]: Boolean(v) }))
                              }
                            />
                          </TableCell>
                          <TableCell className="font-medium">{isAr ? r.nameAr : r.nameEn}</TableCell>
                          {peopleColumns.dept ? (
                            <TableCell className="text-muted-foreground">{isAr ? r.deptAr : r.deptEn}</TableCell>
                          ) : null}
                          <TableCell className="text-right">{r.overall.toFixed(1)}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant={flags[r.userId] ? "secondary" : "outline"}
                              disabled={!canManageActions}
                              onClick={() => handleToggleFlag(r.userId)}
                            >
                              {flags[r.userId] ? (isAr ? "معلّم" : "Flagged") : (isAr ? "وضع" : "Flag")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{isAr ? "تذبذب عالي" : "High Volatility"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[360px] overflow-auto rounded-md border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
                        <TableHead>{isAr ? "الاسم" : "Name"}</TableHead>
                        {peopleColumns.dept ? (
                          <TableHead>{isAr ? "القسم" : "Dept"}</TableHead>
                        ) : null}
                        <TableHead className="text-right">{isAr ? "التذبذب" : "Volatility"}</TableHead>
                        <TableHead className="w-[90px]">{isAr ? "علامة" : "Flag"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {peopleStats.risky.map((r) => (
                        <TableRow key={r.userId}>
                          <TableCell>
                            <Checkbox
                              checked={!!selectedPeople[r.userId]}
                              onCheckedChange={(v) =>
                                setSelectedPeople((prev) => ({ ...prev, [r.userId]: Boolean(v) }))
                              }
                            />
                          </TableCell>
                          <TableCell className="font-medium">{isAr ? r.nameAr : r.nameEn}</TableCell>
                          {peopleColumns.dept ? (
                            <TableCell className="text-muted-foreground">{isAr ? r.deptAr : r.deptEn}</TableCell>
                          ) : null}
                          <TableCell className="text-right">{r.volatility.toFixed(1)}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant={flags[r.userId] ? "secondary" : "outline"}
                              disabled={!canManageActions}
                              onClick={() => handleToggleFlag(r.userId)}
                            >
                              {flags[r.userId] ? (isAr ? "معلّم" : "Flagged") : (isAr ? "وضع" : "Flag")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    {isAr
                      ? "التذبذب = فرق متوسط الشهر الأخير عن الشهر الذي قبله (مؤشر مبسط)."
                      : "Volatility = difference between last month average and the previous month (simple proxy)."}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* SURVEY OPS */}
          <TabsContent value="ops">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{isAr ? "مؤشرات التشغيل" : "Operational KPIs"}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <KPICard
                    title={isAr ? "معدل الإكمال" : "Completion Rate"}
                    value={Number((ops.completionRate * 100).toFixed(0))}
                    icon={<Activity className="w-4 h-4" />}
                  />
                  <KPICard
                    title={isAr ? "عدد الموظفين المُقيّمين" : "Employees Rated"}
                    value={peopleStats.totalRated}
                    icon={<Users className="w-4 h-4" />}
                  />
                  <KPICard
                    title={isAr ? "التقييمات المكتملة" : "Completed"}
                    value={ops.completed}
                    icon={<ClipboardCheck className="w-4 h-4" />}
                  />
                  <KPICard
                    title={isAr ? "ملاحظة" : "Note"}
                    value={0}
                    subtitle={isAr ? "يمكن إضافة مؤشرات أدق لاحقاً" : "More detailed ops metrics can be added"}
                    icon={<AlertTriangle className="w-4 h-4" />}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{isAr ? "حرارة الفئات" : "Category Heatmap"}</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Reuse existing heatmap component. We'll feed a simplified shape using same/cross/workload averages per employee. */}
                  <CategoryHeatmap
                    data={peopleStats.top.map((r) => ({
                      id: r.userId,
                      nameEn: r.nameEn,
                      nameAr: r.nameAr,
                      performance: r.avgSame,
                      teamwork: r.avgCross,
                      workload: undefined,
                    })) as any}
                  />
                  <p className="text-xs text-muted-foreground mt-3">
                    {isAr
                      ? "هذه الخريطة تستخدم بيانات مختصرة (أفضل 10) لتبقى سريعة."
                      : "This heatmap uses a small sample (top 10) to stay fast."}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* CUSTOM DASHBOARDS */}
          <TabsContent value="custom">
            <CustomDashboardsTab />
          </TabsContent>

          {/* ACTIONS */}
          {canViewActions ? (
            <TabsContent value="actions">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{isAr ? "المتابعات" : "Follow-up Tickets"}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <Button variant="outline" onClick={() => {
                        downloadXlsx(
                          `action_tickets_${new Date().toISOString().slice(0, 10)}.xlsx`,
                          [{ name: "Action Tickets", rows: tickets.map((t: any) => ({
                            ...t,
                            targets: ticketTargets.filter((x: any) => x.ticket_id === t.id).map((x: any) => `${x.target_type}:${x.target_id}`).join(", "),
                          })) }]
                        );
                      }}>
                        {isAr ? "تصدير المهام" : "Export Tickets"}
                      </Button>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{isAr ? "العنوان" : "Title"}</TableHead>
                          <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                          <TableHead>{isAr ? "الأولوية" : "Severity"}</TableHead>
                          <TableHead className="text-right">{isAr ? "الأهداف" : "Targets"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tickets.slice(0, 30).map((t: any) => {
                          const count = ticketTargets.filter((x: any) => x.ticket_id === t.id).length;
                          return (
                            <TableRow key={t.id}>
                              <TableCell className="font-medium">{t.title}</TableCell>
                              <TableCell>
                                <Badge variant={t.status === 'done' ? 'default' : t.status === 'in_progress' ? 'secondary' : 'outline'}>
                                  {t.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant={t.severity === 'high' ? 'destructive' : t.severity === 'medium' ? 'secondary' : 'outline'}>
                                  {t.severity}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">{count}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {!tickets.length ? (
                      <p className="text-sm text-muted-foreground mt-3">
                        {isAr ? "لا توجد متابعات بعد." : "No tickets yet."}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{isAr ? "العلامات" : "Flags"}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="outline"
                      className="mb-3"
                      onClick={() => {
                        const flaggedProfiles = profiles
                          .filter((p) => flags[p.id])
                          .map((p) => ({
                            id: p.id,
                            name_en: p.name_en,
                            name_ar: p.name_ar,
                            department_id: p.department_id,
                          }));
                        downloadXlsx(`flags_${new Date().toISOString().slice(0, 10)}.xlsx`, [{ name: "Flags", rows: flaggedProfiles }]);
                      }}
                    >
                      {isAr ? "تصدير العلامات" : "Export Flags"}
                    </Button>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{isAr ? "الاسم" : "Name"}</TableHead>
                          <TableHead>{isAr ? "القسم" : "Dept"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profiles.filter((p) => flags[p.id]).slice(0, 30).map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{isAr ? p.name_ar : p.name_en}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {(() => {
                                const d = departments.find((x) => x.id === p.department_id);
                                return d ? (isAr ? d.name_ar : d.name_en) : '—';
                              })()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {!profiles.some((p) => flags[p.id]) ? (
                      <p className="text-sm text-muted-foreground mt-3">
                        {isAr ? "لا توجد علامات." : "No flags."}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
    </div>
  );
};

export default ExecutiveDashboardsPage;
