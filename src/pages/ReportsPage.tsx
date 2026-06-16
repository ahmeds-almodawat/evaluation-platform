import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/components/layout/Header';
import KPICard from '@/components/ui/KPICard';
import TrendLineChart from '@/components/charts/TrendLineChart';
import DepartmentBenchmarkChart from '@/components/charts/DepartmentBenchmarkChart';
import CategoryBarChart from '@/components/charts/CategoryBarChart';
import DepartmentMonthHeatmap, { type DeptMonthHeatmapRow } from '@/components/charts/DepartmentMonthHeatmap';
import ExportButtons from '@/components/ui/ExportButtons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import { exportReportServer } from '@/utils/exportServer';
import { logAudit } from '@/lib/audit';
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, MessageSquareText, Users, Building2, FileText, Target, TrendingUp } from 'lucide-react';

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

type DepartmentRow = {
  id: string;
  name_en: string;
  name_ar: string;
};

type ProfileRow = {
  id: string;
  name_en: string;
  name_ar: string;
  department_id: string | null;
  position: string | null;
};

const isCross = (evaluationType: string | null) => {
  const t = (evaluationType || '').toLowerCase();
  return t === 'cross' || t === 'cross_individuals' || t === 'cross_managers' || t === 'cross_department' || t === 'cross_station' || t.includes('cross');
};

const normalizeTypeLabel = (evaluationType: string | null) => {
  const t = (evaluationType || '').toLowerCase();
  if (t === 'self_station') return 'self_station';
  if (t === 'cross_station') return 'cross_station';
  if (t === 'cross_department' || t === 'cross_individuals' || t === 'cross_managers' || t === 'cross') return 'cross_department';
  if (t === 'manager_to_team') return 'manager_to_team';
  if (t === 'team_to_manager') return 'team_to_manager';
  if (t.includes('cross')) return 'cross_other';
  return 'same_dept';
};

const lastNMonths = (n: number) => {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push(key);
  }
  return out;
};

const ReportsPage: React.FC = () => {
  const { t, language } = useLanguage();
  const { role } = useSupabaseAuth();
  const reportScope = role === 'user' ? 'self_or_department' : 'full';

  // Keep the UI simple: only two main tabs (Overview + Details)
  // Details view can switch between evaluation history and anonymized comments.
  const [detailsView, setDetailsView] = useState<'evaluations' | 'comments'>('evaluations');
  const [exporting, setExporting] = useState(false);

  // Ultra Pro: department drill-down dialog
  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState<EvaluationRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [departments, setDepartments] = useState<Record<string, DepartmentRow>>({});

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<ProfileRow | null>(null);

  // Filters
  const [period, setPeriod] = useState<string>('all');
  const [departmentId, setDepartmentId] = useState<string>('all');
  const [type, setType] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [q, setQ] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Best-effort: fetch current user id (for manager/self dashboards)
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id || null;
        setMyUserId(uid);

        const [{ data: evals, error: evalErr }, { data: profs, error: profErr }, { data: depts, error: deptErr }] =
          await Promise.all([
            supabase.from('evaluations').select('*').order('created_at', { ascending: false }),
            supabase.from('profiles').select('id,name_en,name_ar,department_id,position'),
            supabase.from('departments').select('id,name_en,name_ar'),
          ]);

        if (evalErr) throw evalErr;
        if (profErr) throw profErr;
        if (deptErr) throw deptErr;

        const profileMap: Record<string, ProfileRow> = {};
        (profs || []).forEach((p: any) => {
          profileMap[p.id] = p;
        });

        const deptMap: Record<string, DepartmentRow> = {};
        (depts || []).forEach((d: any) => {
          deptMap[d.id] = d;
        });

        setProfiles(profileMap);
        setDepartments(deptMap);
        setEvaluations((evals as any) || []);

        if (uid && profileMap[uid]) {
          setMyProfile(profileMap[uid]);
        } else {
          setMyProfile(null);
        }
      } catch (e) {
        console.error('Reports load error', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const isManager = useMemo(() => {
    const pos = (myProfile?.position || '').toLowerCase();
    return pos.includes('manager') || pos.includes('head') || pos.includes('director') || pos.includes('مدير') || pos.includes('رئيس');
  }, [myProfile]);

  const periods = useMemo(() => {
    const s = new Set<string>();
    evaluations.forEach((e) => e.period && s.add(e.period));
    return Array.from(s).sort();
  }, [evaluations]);

  const departmentOptions = useMemo(() => {
    return Object.values(departments).sort((a, b) => (a.name_en || '').localeCompare(b.name_en || ''));
  }, [departments]);

  const filtered = useMemo(() => {
    return evaluations.filter((e) => {
      if (period !== 'all' && e.period !== period) return false;
      if (status !== 'all' && e.status !== status) return false;
      if (type !== 'all' && normalizeTypeLabel(e.evaluation_type) !== type) return false;

      // department filter based on evaluatee department
      const evalDept = profiles[e.evaluatee_id]?.department_id || null;
      if (departmentId !== 'all' && evalDept !== departmentId) return false;

      if (q.trim()) {
        const needle = q.toLowerCase();
        const evalName = (profiles[e.evaluatee_id]?.name_en || profiles[e.evaluatee_id]?.name_ar || '').toLowerCase();
        const evaluatorName = (
          e.evaluator_id
            ? profiles[e.evaluator_id]?.name_en || profiles[e.evaluator_id]?.name_ar || ''
            : ''
        ).toLowerCase();
        const deptName = evalDept
          ? (departments[evalDept]?.name_en || departments[evalDept]?.name_ar || '').toLowerCase()
          : '';
        const comment = (e.comment || '').toLowerCase();
        const typeStr = (e.evaluation_type || '').toLowerCase();
        if (![evalName, evaluatorName, deptName, comment, typeStr, (e.period || '').toLowerCase()].some((x) => x.includes(needle))) {
          return false;
        }
      }

      return true;
    });
  }, [evaluations, profiles, departments, period, departmentId, type, status, q]);

  const metrics = useMemo(() => {
    const total = filtered.length;
    const completed = filtered.filter((e) => e.status === 'completed').length;
    const completionRate = total ? Math.round((completed / total) * 100) : 0;

    const avg = (key: keyof EvaluationRow) => {
      const vals = filtered.map((e) => (e[key] as any)).filter((v) => typeof v === 'number');
      if (!vals.length) return 0;
      return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
    };

    const avgPerformance = avg('performance_score');
    const avgTeamwork = avg('teamwork_score');
    const avgWorkload = avg('workload_score');

    const uniqueEvaluatees = new Set(filtered.map((e) => e.evaluatee_id)).size;
    const uniqueEvaluators = new Set(filtered.map((e) => e.evaluator_id).filter(Boolean) as string[]).size;

    const cross = filtered.filter((e) => isCross(e.evaluation_type)).length;
    const same = total - cross;

    return {
      total,
      completionRate,
      avgPerformance,
      avgTeamwork,
      avgWorkload,
      uniqueEvaluatees,
      uniqueEvaluators,
      cross,
      same,
    };
  }, [filtered]);

  const deptRankings = useMemo(() => {
    const byDept: Record<
      string,
      {
        deptId: string;
        nameEn: string;
        nameAr: string;
        count: number;
        completed: number;
        sumPerf: number;
        sumTeam: number;
        sumWork: number;
      }
    > = {};

    filtered.forEach((e) => {
      const deptId = profiles[e.evaluatee_id]?.department_id;
      if (!deptId) return;
      if (!byDept[deptId]) {
        byDept[deptId] = {
          deptId,
          nameEn: departments[deptId]?.name_en || deptId,
          nameAr: departments[deptId]?.name_ar || deptId,
          count: 0,
          completed: 0,
          sumPerf: 0,
          sumTeam: 0,
          sumWork: 0,
        };
      }
      byDept[deptId].count += 1;
      if (e.status === 'completed') {
        byDept[deptId].completed += 1;
        byDept[deptId].sumPerf += e.performance_score;
        byDept[deptId].sumTeam += e.teamwork_score;
        byDept[deptId].sumWork += typeof e.workload_score === 'number' ? e.workload_score : 0;
      }
    });

    return Object.values(byDept)
      .map((d) => {
        const denom = d.completed || 1;
        return {
          deptId: d.deptId,
          nameEn: d.nameEn,
          nameAr: d.nameAr,
          evaluations: d.count,
          completionRate: d.count ? Math.round((d.completed / d.count) * 100) : 0,
          avgPerformance: Number((d.sumPerf / denom).toFixed(2)),
          avgTeamwork: Number((d.sumTeam / denom).toFixed(2)),
          avgWorkload: Number((d.sumWork / denom).toFixed(2)),
        };
      })
      .sort((a, b) => b.avgPerformance - a.avgPerformance);
  }, [filtered, profiles, departments]);

  const heatmapMonths = useMemo(() => lastNMonths(12), []);

  const deptMonthHeatmap = useMemo(() => {
    // Average performance by department x month (completed only)
    const byDept: Record<string, { deptId: string; nameEn: string; nameAr: string; buckets: Record<string, { sum: number; n: number }> }> = {};

    const ensure = (deptId: string) => {
      if (!byDept[deptId]) {
        byDept[deptId] = {
          deptId,
          nameEn: departments[deptId]?.name_en || deptId,
          nameAr: departments[deptId]?.name_ar || deptId,
          buckets: {},
        };
      }
      return byDept[deptId];
    };

    filtered
      .filter((e) => e.status === 'completed')
      .forEach((e) => {
        const deptId = profiles[e.evaluatee_id]?.department_id;
        if (!deptId) return;
        const d = ensure(deptId);
        const dt = new Date(e.created_at);
        const month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        if (!d.buckets[month]) d.buckets[month] = { sum: 0, n: 0 };
        d.buckets[month].sum += e.performance_score;
        d.buckets[month].n += 1;
      });

    const rows: DeptMonthHeatmapRow[] = Object.values(byDept)
      .map((d) => {
        const values: Record<string, number | null> = {};
        heatmapMonths.forEach((m) => {
          const b = d.buckets[m];
          values[m] = b && b.n ? Number((b.sum / b.n).toFixed(2)) : null;
        });
        return { deptId: d.deptId, nameEn: d.nameEn, nameAr: d.nameAr, values };
      })
      .sort((a, b) => (a.nameEn || '').localeCompare(b.nameEn || ''));

    return rows;
  }, [filtered, profiles, departments, heatmapMonths]);

  const evaluatorLeaderboard = useMemo(() => {
    const byEval: Record<string, { id: string; completed: number; total: number }> = {};
    filtered.forEach((e) => {
      if (!e.evaluator_id) return;
      if (!byEval[e.evaluator_id]) byEval[e.evaluator_id] = { id: e.evaluator_id, completed: 0, total: 0 };
      byEval[e.evaluator_id].total += 1;
      if (e.status === 'completed') byEval[e.evaluator_id].completed += 1;
    });
    return Object.values(byEval)
      .map((x) => {
        const p = profiles[x.id];
        return {
          id: x.id,
          name: (language === 'ar' ? p?.name_ar : p?.name_en) || p?.name_en || p?.name_ar || '—',
          department:
            p?.department_id
              ? language === 'ar'
                ? departments[p.department_id]?.name_ar
                : departments[p.department_id]?.name_en
              : '—',
          completionRate: x.total ? Math.round((x.completed / x.total) * 100) : 0,
          completed: x.completed,
          pending: x.total - x.completed,
          total: x.total,
        };
      })
      .sort((a, b) => b.completionRate - a.completionRate || b.total - a.total);
  }, [filtered, profiles, departments, language]);

  const followUps = useMemo(() => {
    const pending = filtered.filter((e) => e.status !== 'completed' && e.evaluator_id);
    const byEval: Record<
      string,
      {
        evaluatorId: string;
        count: number;
        items: Array<{ evaluatee: string; dept: string; period: string; created_at: string }>;
      }
    > = {};

    pending.forEach((e) => {
      const eid = e.evaluator_id as string;
      if (!byEval[eid]) byEval[eid] = { evaluatorId: eid, count: 0, items: [] };
      byEval[eid].count += 1;
      const evalP = profiles[e.evaluatee_id];
      const deptId = evalP?.department_id;
      byEval[eid].items.push({
        evaluatee: (language === 'ar' ? evalP?.name_ar : evalP?.name_en) || evalP?.name_en || evalP?.name_ar || '—',
        dept: deptId ? (language === 'ar' ? departments[deptId]?.name_ar : departments[deptId]?.name_en) : '—',
        period: e.period,
        created_at: e.created_at,
      });
    });

    return Object.values(byEval)
      .map((x) => {
        const p = profiles[x.evaluatorId];
        return {
          evaluatorId: x.evaluatorId,
          name: (language === 'ar' ? p?.name_ar : p?.name_en) || p?.name_en || p?.name_ar || '—',
          department:
            p?.department_id
              ? language === 'ar'
                ? departments[p.department_id]?.name_ar
                : departments[p.department_id]?.name_en
              : '—',
          pendingCount: x.count,
          items: x.items.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10),
        };
      })
      .sort((a, b) => b.pendingCount - a.pendingCount);
  }, [filtered, profiles, departments, language]);

  const lowScoreAlerts = useMemo(() => {
    const completed = filtered.filter((e) => e.status === 'completed');
    const byEmp: Record<string, { id: string; count: number; sum: number; deptId: string | null }> = {};
    completed.forEach((e) => {
      const id = e.evaluatee_id;
      if (!byEmp[id]) byEmp[id] = { id, count: 0, sum: 0, deptId: profiles[id]?.department_id || null };
      byEmp[id].count += 1;
      byEmp[id].sum += e.performance_score;
    });
    const threshold = 2.5;
    return Object.values(byEmp)
      .map((x) => {
        const p = profiles[x.id];
        const avg = x.sum / (x.count || 1);
        const deptId = x.deptId;
        return {
          id: x.id,
          name: (language === 'ar' ? p?.name_ar : p?.name_en) || p?.name_en || p?.name_ar || '—',
          department: deptId ? (language === 'ar' ? departments[deptId]?.name_ar : departments[deptId]?.name_en) : '—',
          avgPerformance: Number(avg.toFixed(2)),
          responses: x.count,
        };
      })
      .filter((x) => x.responses >= 2 && x.avgPerformance < threshold)
      .sort((a, b) => a.avgPerformance - b.avgPerformance);
  }, [filtered, profiles, departments, language]);

  const myDeptSnapshot = useMemo(() => {
    if (!myUserId || !myProfile?.department_id) return null;
    const deptId = myProfile.department_id;
    const scope = evaluations.filter((e) => {
      const evalDept = profiles[e.evaluatee_id]?.department_id || null;
      return evalDept === deptId;
    });
    const total = scope.length;
    const completed = scope.filter((e) => e.status === 'completed').length;
    const completionRate = total ? Math.round((completed / total) * 100) : 0;
    const avgPerf = completed
      ? Number(
          (scope
            .filter((e) => e.status === 'completed')
            .reduce((s, e) => s + e.performance_score, 0) /
            completed)
            .toFixed(2),
        )
      : 0;
    return {
      deptId,
      name: language === 'ar' ? departments[deptId]?.name_ar : departments[deptId]?.name_en,
      total,
      completionRate,
      avgPerf,
    };
  }, [myUserId, myProfile, evaluations, profiles, departments, language]);

  const myTeamCompletion = useMemo(() => {
    if (!myProfile?.department_id) return null;
    const deptId = myProfile.department_id;
    const team = evaluatorLeaderboard.filter((r) => profiles[r.id]?.department_id === deptId);
    const pending = followUps.filter((f) => profiles[f.evaluatorId]?.department_id === deptId);
    return {
      deptId,
      teamTop: team.slice(0, 10),
      teamNeeds: pending.slice(0, 10),
      teamSize: team.length,
    };
  }, [myProfile, evaluatorLeaderboard, followUps, profiles]);

  const deptDrilldown = useMemo(() => {
    if (!selectedDeptId) return null;
    const deptName = selectedDeptId
      ? language === 'ar'
        ? departments[selectedDeptId]?.name_ar
        : departments[selectedDeptId]?.name_en
      : '';

    const scope = filtered.filter((e) => profiles[e.evaluatee_id]?.department_id === selectedDeptId);
    const completed = scope.filter((e) => e.status === 'completed');
    const completionRate = scope.length ? Math.round((completed.length / scope.length) * 100) : 0;
    const avg = (key: 'performance_score' | 'teamwork_score' | 'workload_score') => {
      const vals = completed
        .map((e) => (e as any)[key])
        .filter((v) => typeof v === 'number') as number[];
      return vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0;
    };

    // Top/bottom performers within the selected department
    const byEmp: Record<string, { id: string; n: number; sum: number }> = {};
    completed.forEach((e) => {
      if (!byEmp[e.evaluatee_id]) byEmp[e.evaluatee_id] = { id: e.evaluatee_id, n: 0, sum: 0 };
      byEmp[e.evaluatee_id].n += 1;
      byEmp[e.evaluatee_id].sum += e.performance_score;
    });
    const empRows = Object.values(byEmp)
      .map((x) => {
        const p = profiles[x.id];
        return {
          id: x.id,
          name: (language === 'ar' ? p?.name_ar : p?.name_en) || p?.name_en || p?.name_ar || '—',
          avgPerformance: Number((x.sum / (x.n || 1)).toFixed(2)),
          responses: x.n,
        };
      })
      .sort((a, b) => b.avgPerformance - a.avgPerformance);

    const commentsLocal = scope
      .filter((e) => !!(e.comment && e.comment.trim()))
      .slice(0, 20)
      .map((e) => ({
        date: new Date(e.created_at).toLocaleDateString(),
        type: normalizeTypeLabel(e.evaluation_type),
        comment: e.comment as string,
      }));

    return {
      deptId: selectedDeptId,
      deptName: deptName || selectedDeptId,
      total: scope.length,
      completed: completed.length,
      completionRate,
      avgPerformance: avg('performance_score'),
      avgTeamwork: avg('teamwork_score'),
      avgWorkload: avg('workload_score'),
      topPerformers: empRows.slice(0, 8),
      needsSupport: empRows.slice(-8).reverse(),
      comments: commentsLocal,
    };
  }, [selectedDeptId, filtered, profiles, departments, language]);

  const insights = useMemo(() => {
    const topDept = deptRankings[0];
    const worstDept = deptRankings.length ? deptRankings[deptRankings.length - 1] : null;
    const mostPending = followUps[0];
    const low = lowScoreAlerts[0];

    const lines: string[] = [];
    if (topDept) {
      lines.push(
        `${language === 'ar' ? 'أفضل قسم حسب متوسط الأداء:' : 'Top department by performance:'} ` +
          `${language === 'ar' ? topDept.nameAr : topDept.nameEn} (${topDept.avgPerformance})`,
      );
    }
    if (worstDept && deptRankings.length > 3) {
      lines.push(
        `${language === 'ar' ? 'قسم يحتاج متابعة:' : 'Department needing attention:'} ` +
          `${language === 'ar' ? worstDept.nameAr : worstDept.nameEn} (${worstDept.avgPerformance})`,
      );
    }
    if (mostPending) {
      lines.push(
        `${language === 'ar' ? 'أكثر مُقيّم لديه مهام معلقة:' : 'Most pending evaluator:'} ` +
          `${mostPending.name} (${mostPending.pendingCount})`,
      );
    }
    if (low) {
      lines.push(
        `${language === 'ar' ? 'تنبيه أداء منخفض:' : 'Low performance alert:'} ` +
          `${low.name} (${low.avgPerformance}, ${language === 'ar' ? 'ردود' : 'responses'}: ${low.responses})`,
      );
    }
    if (!lines.length) {
      lines.push(language === 'ar' ? 'لا توجد رؤى كافية ضمن المرشحات الحالية.' : 'Not enough data for insights under current filters.');
    }
    return lines;
  }, [deptRankings, followUps, lowScoreAlerts, language]);

  const trend = useMemo(() => {
    const buckets: Record<
      string,
      { month: string; count: number; performance: number; teamwork: number; workload: number }
    > = {};
    filtered.forEach((e) => {
      const d = new Date(e.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!buckets[key]) buckets[key] = { month: key, count: 0, performance: 0, teamwork: 0, workload: 0 };
      buckets[key].count += 1;
      buckets[key].performance += e.performance_score;
      buckets[key].teamwork += e.teamwork_score;
      buckets[key].workload += typeof e.workload_score === 'number' ? e.workload_score : 0;
    });
    return Object.values(buckets)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((b) => ({
        month: b.month,
        performance: b.count ? Number((b.performance / b.count).toFixed(2)) : 0,
        teamwork: b.count ? Number((b.teamwork / b.count).toFixed(2)) : 0,
        workload: b.count ? Number((b.workload / b.count).toFixed(2)) : 0,
      }));
  }, [filtered]);

  const deptBench = useMemo(() => {
    const byDept: Record<string, { id: string; sameSum: number; crossSum: number; sameCount: number; crossCount: number }> = {};
    filtered.forEach((e) => {
      const dept = profiles[e.evaluatee_id]?.department_id;
      if (!dept) return;
      if (!byDept[dept]) byDept[dept] = { id: dept, sameSum: 0, crossSum: 0, sameCount: 0, crossCount: 0 };
      if (isCross(e.evaluation_type)) {
        byDept[dept].crossSum += e.performance_score;
        byDept[dept].crossCount += 1;
      } else {
        byDept[dept].sameSum += e.performance_score;
        byDept[dept].sameCount += 1;
      }
    });
    return Object.values(byDept)
      .map((d) => ({
        id: d.id,
        nameEn: departments[d.id]?.name_en || '—',
        nameAr: departments[d.id]?.name_ar || '—',
        avgSameDept: d.sameCount ? Number((d.sameSum / d.sameCount).toFixed(2)) : 0,
        avgCrossDept: d.crossCount ? Number((d.crossSum / d.crossCount).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.avgSameDept - a.avgSameDept)
      .slice(0, 10);
  }, [filtered, profiles, departments]);

  const openDept = (deptId: string) => {
    setSelectedDeptId(deptId);
    setDeptDialogOpen(true);
  };

  const scoreCategories = useMemo(
    () => [
      { category: t('category.performance'), value: metrics.avgPerformance },
      { category: t('category.teamwork'), value: metrics.avgTeamwork },
      { category: t('category.workload'), value: metrics.avgWorkload },
    ],
    [metrics, t],
  );

  const comments = useMemo(() => {
    return filtered
      .filter((e) => !!(e.comment && e.comment.trim()))
      .map((e) => {
        const deptId = profiles[e.evaluatee_id]?.department_id;
        const dept = deptId ? (language === 'ar' ? departments[deptId]?.name_ar : departments[deptId]?.name_en) : '—';
        return {
          id: e.id,
          date: new Date(e.created_at).toLocaleDateString(),
          department: dept || '—',
          type: normalizeTypeLabel(e.evaluation_type),
          comment: e.comment || '',
        };
      });
  }, [filtered, profiles, departments, language]);

  const exportReport = async (_tab: 'overview' | 'history' | 'comments', format: 'pdf' | 'excel') => {
    setExporting(true);
    try {
      await exportReportServer({
        report: 'reports_overview',
        format: format === 'excel' ? 'xlsx' : 'pdf',
        language: language as 'en' | 'ar',
        params: { period, departmentId, type, status, q },
      });

      // Server already writes the canonical audit log. We keep this client log as a lightweight UI breadcrumb (best-effort).
      await logAudit(format === 'pdf' ? 'EXPORT_PDF' : 'EXPORT_EXCEL', {
        entityType: 'reports',
        metadata: { scope: reportScope, tab: _tab, filters: { period, departmentId, type, status, q } },
      });
    } finally {
      setExporting(false);
    }
  };

  const typeLabel = (k: string) => {
    if (k === 'same_dept') return language === 'ar' ? 'تقييم داخلي قديم' : 'Legacy Self Dept';
    if (k === 'self_station') return language === 'ar' ? 'تقييم داخلي للوحدة / المحطة' : 'Self Station / Unit';
    if (k === 'cross_station') return language === 'ar' ? 'تقييم بين الوحدات / المحطات' : 'Cross Station';
    if (k === 'cross_department') return language === 'ar' ? 'تقييم بين الأقسام' : 'Cross Department';
    if (k === 'manager_to_team') return language === 'ar' ? 'تقييم المدير للفريق' : 'Manager → Team';
    if (k === 'team_to_manager') return language === 'ar' ? 'تقييم الفريق للمدير' : 'Team → Manager';
    if (k === 'cross_other') return t('reports.type.crossOther');
    return k;
  };

  const statusLabel = (s: string) => {
    if (s === 'completed') return t('status.completed');
    if (s === 'pending') return t('status.pending');
    return s;
  };

  return (
    <div className="min-h-screen bg-background">
      <Header title={t('reports.title')} subtitle={t('reports.subtitle')} />

      <main className="container mx-auto px-4 pb-8">
        {/* Filters */}
        <Card className="mb-6 animate-fade-in">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              {t('reports.filters')}
            </CardTitle>
            <ExportButtons busy={exporting} onPDF={() => exportReport('overview', 'pdf')} onExcel={() => exportReport('overview', 'excel')} />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <label className="text-sm text-muted-foreground">{t('reports.filter.period')}</label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={t('reports.filter.period')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('reports.filter.allPeriods')}</SelectItem>
                    {periods.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-muted-foreground">{t('reports.filter.department')}</label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={t('reports.filter.department')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('reports.filter.allDepartments')}</SelectItem>
                    {departmentOptions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {language === 'ar' ? d.name_ar : d.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-muted-foreground">{t('reports.filter.type')}</label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={t('reports.filter.type')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('reports.filter.allTypes')}</SelectItem>
                    <SelectItem value="self_station">{language === 'ar' ? 'تقييم داخلي للوحدة / المحطة' : 'Self Station / Unit'}</SelectItem>
                    <SelectItem value="cross_station">{language === 'ar' ? 'تقييم بين الوحدات / المحطات' : 'Cross Station'}</SelectItem>
                    <SelectItem value="cross_department">{language === 'ar' ? 'تقييم بين الأقسام' : 'Cross Department'}</SelectItem>
                    <SelectItem value="manager_to_team">{language === 'ar' ? 'تقييم المدير للفريق' : 'Manager → Team'}</SelectItem>
                    <SelectItem value="team_to_manager">{language === 'ar' ? 'تقييم الفريق للمدير' : 'Team → Manager'}</SelectItem>
                    <SelectItem value="same_dept">{language === 'ar' ? 'تقييمات قديمة' : 'Legacy Self Dept'}</SelectItem>
                    <SelectItem value="cross_other">{t('reports.type.crossOther')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-muted-foreground">{t('reports.filter.status')}</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={t('reports.filter.status')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('reports.filter.allStatuses')}</SelectItem>
                    <SelectItem value="completed">{t('status.completed')}</SelectItem>
                    <SelectItem value="pending">{t('status.pending')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm text-muted-foreground">{t('reports.filter.search')}</label>
                <Input
                  className="mt-1"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t('reports.filter.searchPlaceholder')}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="overview" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              {t('reports.tab.overview')}
            </TabsTrigger>
            <TabsTrigger value="details" className="gap-2">
              <Users className="h-4 w-4" />
              {t('reports.tab.details')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <span>{t('loading')}</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <KPICard title={t('reports.kpi.totalEvaluations')} value={metrics.total} icon={ClipboardList} />
                  <KPICard title={t('reports.kpi.completionRate')} value={`${metrics.completionRate}%`} icon={CheckCircle2} />
                  <KPICard title={t('reports.kpi.uniqueEvaluatees')} value={metrics.uniqueEvaluatees} icon={Users} />
                  <KPICard title={t('reports.kpi.uniqueEvaluators')} value={metrics.uniqueEvaluators} icon={Users} />
                </div>

                {/* Personal / manager snapshot (helps non-admin users get value without seeing everything) */}
                {myDeptSnapshot && (role === 'user' || isManager) && (
                  <Card className="mb-6">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        {t('reports.myDeptSnapshot')} • {myDeptSnapshot.name || myDeptSnapshot.deptId}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="rounded-xl border border-border bg-muted/20 p-4">
                          <div className="text-sm text-muted-foreground">{t('reports.kpi.totalEvaluations')}</div>
                          <div className="text-2xl font-semibold mt-1">{myDeptSnapshot.total}</div>
                        </div>
                        <div className="rounded-xl border border-border bg-muted/20 p-4">
                          <div className="text-sm text-muted-foreground">{t('reports.kpi.completionRate')}</div>
                          <div className="text-2xl font-semibold mt-1">{myDeptSnapshot.completionRate}%</div>
                        </div>
                        <div className="rounded-xl border border-border bg-muted/20 p-4">
                          <div className="text-sm text-muted-foreground">{t('reports.avgPerformance')}</div>
                          <div className="text-2xl font-semibold mt-1">{myDeptSnapshot.avgPerf}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  <TrendLineChart data={trend} title={t('reports.chart.trend')} />
                  <CategoryBarChart data={scoreCategories} title={t('reports.chart.scoreBreakdown')} />
                </div>

                <div className="grid grid-cols-1 gap-6">
                  <DepartmentBenchmarkChart
                    data={deptBench}
                    title={t('reports.chart.departmentBenchmark')}
                    subtitle={t('reports.chart.departmentBenchmarkSubtitle')}
                  />
                </div>

                <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <DepartmentMonthHeatmap
                      months={heatmapMonths}
                      rows={deptMonthHeatmap}
                      title={t('reports.heatmap.title') || (language === 'ar' ? 'خريطة حرارية: أداء الأقسام عبر الأشهر' : 'Heatmap: Department performance by month')}
                      onDepartmentClick={openDept}
                    />
                  </div>
                  <Card className="h-fit">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        {t('reports.insightsTitle') || (language === 'ar' ? 'أهم الرؤى' : 'Key insights')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {insights.map((line, i) => (
                          <div key={i} className="flex gap-2 text-sm">
                            <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
                            <div className="text-muted-foreground">{line}</div>
                          </div>
                        ))}
                        <Separator />
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <TrendingUp className="h-4 w-4" />
                          {language === 'ar'
                            ? 'اضغط على أي قسم لعرض تفاصيل وتحليلات أعمق.'
                            : 'Click any department to open a deeper drill‑down.'}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {isManager && myTeamCompletion && (
                  <Card className="mt-6">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {language === 'ar' ? 'لوحة المدير: إكمال الفريق' : 'Manager dashboard: team completion'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="rounded-xl border border-border p-4">
                          <div className="text-sm font-medium mb-3">{language === 'ar' ? 'أفضل المُقيّمين (إكمال)' : 'Top evaluators (completion)'}</div>
                          <div className="space-y-2">
                            {myTeamCompletion.teamTop.length ? (
                              myTeamCompletion.teamTop.map((r: any) => (
                                <div key={r.id} className="flex items-center justify-between text-sm">
                                  <div className="font-medium">{r.name}</div>
                                  <Badge variant="secondary">{r.completionRate}%</Badge>
                                </div>
                              ))
                            ) : (
                              <div className="text-sm text-muted-foreground py-6 text-center">{t('reports.noResults')}</div>
                            )}
                          </div>
                        </div>
                        <div className="rounded-xl border border-border p-4">
                          <div className="text-sm font-medium mb-3">{language === 'ar' ? 'يحتاج متابعة (معلّق)' : 'Needs follow‑up (pending)'} </div>
                          <div className="space-y-3">
                            {myTeamCompletion.teamNeeds.length ? (
                              myTeamCompletion.teamNeeds.map((f: any) => (
                                <div key={f.evaluatorId} className="rounded-lg bg-muted/30 p-3">
                                  <div className="flex items-center justify-between">
                                    <div className="font-medium text-sm">{f.name}</div>
                                    <Badge variant="outline">{f.pendingCount} {t('reports.pending')}</Badge>
                                  </div>
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    {(f.items || []).slice(0, 2).map((it: any, idx: number) => (
                                      <div key={idx}>• {it.evaluatee} — {it.dept} ({it.period})</div>
                                    ))}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-sm text-muted-foreground py-6 text-center">{t('reports.noFollowUps')}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Executive-style action center */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        {t('reports.departmentRanking')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-xl border border-border overflow-hidden">
                        <ScrollArea className="h-[320px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>{t('reports.department')}</TableHead>
                                <TableHead className="text-right">{t('reports.avgPerformance')}</TableHead>
                                <TableHead className="text-right">{t('reports.kpi.completionRate')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {deptRankings.slice(0, 20).map((d, idx) => (
                                <TableRow key={d.deptId}>
                                  <TableCell className="font-medium">{idx + 1}</TableCell>
                                  <TableCell>
                                    <button
                                      type="button"
                                      onClick={() => openDept(d.deptId)}
                                      className="inline-flex items-center gap-2 hover:underline"
                                    >
                                      <Building2 className="h-4 w-4 text-muted-foreground" />
                                      {language === 'ar' ? d.nameAr : d.nameEn}
                                    </button>
                                  </TableCell>
                                  <TableCell className="text-right">{d.avgPerformance}</TableCell>
                                  <TableCell className="text-right">{d.completionRate}%</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {t('reports.completionLeaderboard')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-xl border border-border overflow-hidden">
                        <ScrollArea className="h-[320px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t('reports.evaluator')}</TableHead>
                                <TableHead>{t('reports.department')}</TableHead>
                                <TableHead className="text-right">{t('reports.kpi.completionRate')}</TableHead>
                                <TableHead className="text-right">{t('reports.pending')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {evaluatorLeaderboard.slice(0, 25).map((r) => (
                                <TableRow key={r.id}>
                                  <TableCell className="font-medium">{r.name}</TableCell>
                                  <TableCell>{r.department}</TableCell>
                                  <TableCell className="text-right">{r.completionRate}%</TableCell>
                                  <TableCell className="text-right">{r.pending}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        {t('reports.followUps')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-xl border border-border overflow-hidden">
                        <ScrollArea className="h-[320px]">
                          <div className="p-3 space-y-3">
                            {followUps.length ? (
                              followUps.slice(0, 25).map((f) => (
                                <div key={f.evaluatorId} className="rounded-xl border border-border bg-card p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="font-medium">{f.name}</div>
                                      <div className="text-sm text-muted-foreground">{f.department}</div>
                                    </div>
                                    <Badge variant="outline">
                                      {f.pendingCount} {t('reports.pending')}
                                    </Badge>
                                  </div>
                                  <div className="mt-2 text-sm text-muted-foreground">
                                    {f.items.slice(0, 3).map((it, idx) => (
                                      <div key={idx}>
                                        • {it.evaluatee} — {it.dept} ({it.period})
                                      </div>
                                    ))}
                                    {f.items.length > 3 && <div>…</div>}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-muted-foreground text-sm py-10 text-center">{t('reports.noFollowUps')}</div>
                            )}
                          </div>
                        </ScrollArea>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MessageSquareText className="h-4 w-4" />
                        {t('reports.lowScoreAlerts')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-xl border border-border overflow-hidden">
                        <ScrollArea className="h-[320px]">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t('reports.employee')}</TableHead>
                                <TableHead>{t('reports.department')}</TableHead>
                                <TableHead className="text-right">{t('reports.avgPerformance')}</TableHead>
                                <TableHead className="text-right">{t('reports.responses')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {lowScoreAlerts.length ? (
                                lowScoreAlerts.slice(0, 25).map((p) => (
                                  <TableRow key={p.id}>
                                    <TableCell className="font-medium">{p.name}</TableCell>
                                    <TableCell>{p.department}</TableCell>
                                    <TableCell className="text-right">{p.avgPerformance}</TableCell>
                                    <TableCell className="text-right">{p.responses}</TableCell>
                                  </TableRow>
                                ))
                              ) : (
                                <TableRow>
                                  <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                                    {t('reports.noAlerts')}
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="details">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-3">
              <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1">
                <button
                  onClick={() => setDetailsView('evaluations')}
                  className={`px-3 py-1.5 text-sm rounded-md transition ${
                    detailsView === 'evaluations' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('reports.view.evaluations')}
                </button>
                <button
                  onClick={() => setDetailsView('comments')}
                  className={`px-3 py-1.5 text-sm rounded-md transition ${
                    detailsView === 'comments' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t('reports.view.comments')}
                </button>
              </div>

              <ExportButtons
                busy={exporting}
                onPDF={() => exportReport(detailsView === 'evaluations' ? 'history' : 'comments', 'pdf')}
                onExcel={() => exportReport(detailsView === 'evaluations' ? 'history' : 'comments', 'excel')}
              />
            </div>

            {detailsView === 'evaluations' ? (
              <Card className="animate-fade-in">
                <CardHeader>
                  <CardTitle className="text-base">{t('reports.historyTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[520px] pr-2">
                    <div className="space-y-3">
                      {filtered.map((e) => {
                        const evalName = profiles[e.evaluatee_id]
                          ? language === 'ar'
                            ? profiles[e.evaluatee_id].name_ar
                            : profiles[e.evaluatee_id].name_en
                          : '—';
                        const evaluatorName =
                          e.evaluator_id && profiles[e.evaluator_id]
                            ? language === 'ar'
                              ? profiles[e.evaluator_id].name_ar
                              : profiles[e.evaluator_id].name_en
                            : t('reports.system');
                        const deptId = profiles[e.evaluatee_id]?.department_id;
                        const deptName = deptId
                          ? language === 'ar'
                            ? departments[deptId]?.name_ar
                            : departments[deptId]?.name_en
                          : '—';

                        return (
                          <div
                            key={e.id}
                            className="rounded-xl border border-border bg-card p-4 hover:shadow-sm transition-shadow"
                          >
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                              <div className="space-y-1">
                                <div className="font-medium text-foreground">{evalName}</div>
                                <div className="text-sm text-muted-foreground">
                                  {t('reports.by')} <span className="text-foreground">{evaluatorName}</span> • {deptName} •{' '}
                                  {new Date(e.created_at).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">{typeLabel(normalizeTypeLabel(e.evaluation_type))}</Badge>
                                <Badge variant={e.status === 'completed' ? 'default' : 'outline'}>{statusLabel(e.status)}</Badge>
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                              <div className="rounded-lg bg-muted/40 p-2">
                                <div className="text-muted-foreground">{t('category.performance')}</div>
                                <div className="font-semibold">{e.performance_score}</div>
                              </div>
                              <div className="rounded-lg bg-muted/40 p-2">
                                <div className="text-muted-foreground">{t('category.teamwork')}</div>
                                <div className="font-semibold">{e.teamwork_score}</div>
                              </div>
                              <div className="rounded-lg bg-muted/40 p-2">
                                <div className="text-muted-foreground">{t('category.workload')}</div>
                                <div className="font-semibold">{typeof e.workload_score === 'number' ? e.workload_score : '—'}</div>
                              </div>
                            </div>

                            {e.comment && e.comment.trim() && (
                              <div className="mt-3 text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">{t('reports.commentLabel')}:</span> {e.comment}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {!filtered.length && (
                        <div className="text-center py-16 text-muted-foreground">{t('reports.noResults')}</div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            ) : (
              <Card className="animate-fade-in">
                <CardHeader>
                  <CardTitle className="text-base">{t('reports.commentsTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[520px] pr-2">
                    <div className="space-y-3">
                      {comments.map((c) => (
                        <div key={c.id} className="rounded-xl border border-border bg-card p-4">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                            <div className="text-sm text-muted-foreground">{c.department}</div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">{typeLabel(c.type)}</Badge>
                              <Badge variant="outline">{c.date}</Badge>
                            </div>
                          </div>
                          <div className="mt-2 text-sm text-foreground">{c.comment}</div>
                        </div>
                      ))}

                      {!comments.length && (
                        <div className="text-center py-16 text-muted-foreground">{t('reports.noComments')}</div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Department drill-down dialog */}
        <Dialog open={deptDialogOpen} onOpenChange={(open) => setDeptDialogOpen(open)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                {deptDrilldown?.deptName || (language === 'ar' ? 'تفاصيل القسم' : 'Department details')}
              </DialogTitle>
            </DialogHeader>

            {!deptDrilldown ? (
              <div className="py-10 text-center text-muted-foreground">{t('reports.noResults')}</div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <KPICard title={t('reports.kpi.totalEvaluations')} value={deptDrilldown.total} icon={ClipboardList} />
                  <KPICard title={t('reports.kpi.completionRate')} value={`${deptDrilldown.completionRate}%`} icon={CheckCircle2} />
                  <KPICard title={t('reports.avgPerformance')} value={deptDrilldown.avgPerformance} icon={TrendingUp} />
                  <KPICard title={t('category.teamwork')} value={deptDrilldown.avgTeamwork} icon={Users} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        {language === 'ar' ? 'أفضل الأداء' : 'Top performers'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('reports.employee')}</TableHead>
                            <TableHead className="text-right">{t('reports.avgPerformance')}</TableHead>
                            <TableHead className="text-right">{t('reports.responses')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deptDrilldown.topPerformers.length ? (
                            deptDrilldown.topPerformers.map((r: any) => (
                              <TableRow key={r.id}>
                                <TableCell className="font-medium">{r.name}</TableCell>
                                <TableCell className="text-right">{r.avgPerformance}</TableCell>
                                <TableCell className="text-right">{r.responses}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                                {t('reports.noResults')}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        {language === 'ar' ? 'بحاجة لدعم' : 'Needs support'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('reports.employee')}</TableHead>
                            <TableHead className="text-right">{t('reports.avgPerformance')}</TableHead>
                            <TableHead className="text-right">{t('reports.responses')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deptDrilldown.needsSupport.length ? (
                            deptDrilldown.needsSupport.map((r: any) => (
                              <TableRow key={r.id}>
                                <TableCell className="font-medium">{r.name}</TableCell>
                                <TableCell className="text-right">{r.avgPerformance}</TableCell>
                                <TableCell className="text-right">{r.responses}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                                {t('reports.noResults')}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <MessageSquareText className="h-4 w-4" />
                      {language === 'ar' ? 'تعليقات (مجهولة)' : 'Anonymized comments'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[220px] pr-2">
                      <div className="space-y-3">
                        {deptDrilldown.comments.length ? (
                          deptDrilldown.comments.map((c: any) => (
                            <div key={c.id} className="rounded-xl border border-border bg-card p-3">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{c.date}</span>
                                <Badge variant="secondary">{typeLabel(c.type)}</Badge>
                              </div>
                              <div className="mt-2 text-sm">{c.comment}</div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-10 text-muted-foreground">{t('reports.noComments')}</div>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default ReportsPage;
