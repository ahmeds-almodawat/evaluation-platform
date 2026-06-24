import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '@/components/layout/Header';
import KPICard from '@/components/ui/KPICard';
import TrendLineChart from '@/components/charts/TrendLineChart';
import CategoryBarChart from '@/components/charts/CategoryBarChart';
import ExportButtons from '@/components/ui/ExportButtons';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import { exportReportServer } from '@/utils/exportServer';
import { ArrowLeft, ArrowRight, Briefcase, Calendar, Mail, User } from 'lucide-react';

type TrendPoint = { month: string; sameDept: number | null; crossDept: number | null };

type EvalRow = {
  id: string;
  period: string;
  evaluation_type: string | null;
  performance_score: number;
  teamwork_score: number;
  workload_score: number | null;
  created_at: string;
};

const isCross = (t?: string | null) => {
  const v = (t || '').toLowerCase();
  return v === 'cross' || v === 'cross_individuals' || v === 'cross_managers' || v === 'cross_department' || v === 'cross_station';
};
const isSame = (t?: string | null) => {
  const v = (t || '').toLowerCase();
  return v === 'same' || v === 'self_station' || v === 'manager_to_team' || v === 'team_to_manager';
};

const avg = (vals: Array<number | null | undefined>) => {
  const v = vals.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  if (!v.length) return null;
  return Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(2));
};

const UserProfilePage: React.FC = () => {
  // App route uses "/profile/:userId" but older code used ":id".
  // Support both, and support /profile/me.
  const { userId, id } = useParams();
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const { user: supabaseUser, role, hasPermission } = useSupabaseAuth();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<null | {
    id: string;
    name_en: string;
    name_ar: string;
    email: string;
    department_id: string | null;
    updated_at: string;
  }>(null);
  const [department, setDepartment] = useState<null | { id: string; name_en: string; name_ar: string }>(null);
  const [evaluations, setEvaluations] = useState<EvalRow[]>([]);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [exporting, setExporting] = useState(false);

  const canExport = hasPermission('reports.export') || role === 'admin' || role === 'super_user' || role === 'audit';

  useEffect(() => {
    const run = async () => {
      const routeParam = (userId ?? id) as string | undefined;
      const resolvedId = routeParam === 'me' ? supabaseUser?.id : routeParam;
      if (!resolvedId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        // 1) Try by id
        let prof: any = null;
        const { data: profById, error: profErr } = await supabase
          .from('profiles')
          .select('id,name_en,name_ar,email,department_id,updated_at')
          .eq('id', resolvedId)
          .maybeSingle();

        if (!profErr && profById) {
          prof = profById;
        } else if (supabaseUser?.email) {
          // 2) Fallback: try by email (helps if auth UUID/profile UUID mismatch)
          const { data: profByEmail, error: profEmailErr } = await supabase
            .from('profiles')
            .select('id,name_en,name_ar,email,department_id,updated_at')
            .ilike('email', supabaseUser.email)
            .maybeSingle();
          if (!profEmailErr && profByEmail) prof = profByEmail;
        }

        if (!prof) {
          setProfile(null);
          setDepartment(null);
          setEvaluations([]);
          setTrendData([]);
          setLoading(false);
          return;
        }

        setProfile(prof);

        if (prof?.department_id) {
          const { data: dept, error: deptErr } = await supabase
            .from('departments')
            .select('id,name_en,name_ar')
            .eq('id', prof.department_id)
            .single();
          if (!deptErr) setDepartment(dept);
        } else {
          setDepartment(null);
        }

        const { data: evals, error: evalErr } = await supabase
          .from('evaluations')
          .select('id,period,evaluation_type,performance_score,teamwork_score,workload_score,created_at')
          .eq('evaluatee_id', prof.id)
          .order('period', { ascending: true });

        if (evalErr) throw evalErr;
        setEvaluations((evals || []) as any);

        // Build 12-month trend from real evaluations
        const periods = Array.from(new Set((evals || []).map(e => e.period))).sort();
        const lastPeriods = periods.slice(-12);

        const trend: TrendPoint[] = lastPeriods.map(period => {
          const pEvals = (evals || []).filter(e => e.period === period);
          const same = pEvals.filter(e => isSame(e.evaluation_type));
          const cross = pEvals.filter(e => isCross(e.evaluation_type));
          return {
            month: period,
            sameDept: avg(same.map(e => e.performance_score)),
            crossDept: avg(cross.map(e => e.teamwork_score)),
          };
        });
        setTrendData(trend);
      } catch (e) {
        console.error(e);
        setProfile(null);
        setDepartment(null);
        setEvaluations([]);
        setTrendData([]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [id, userId, supabaseUser?.id, supabaseUser?.email]);

  const kpis = useMemo(() => {
    if (!evaluations.length) {
      return {
        performance: null,
        teamwork: null,
        workload: null,
        perfTrend: null,
        teamTrend: null,
        workTrend: null,
      };
    }

    // Current period = latest period in data
    const periods = Array.from(new Set(evaluations.map(e => e.period))).sort();
    const current = periods[periods.length - 1];
    const prev = periods.length > 1 ? periods[periods.length - 2] : null;

    const currentE = evaluations.filter(e => e.period === current);
    const prevE = prev ? evaluations.filter(e => e.period === prev) : [];

    const perf = avg(currentE.map(e => e.performance_score));
    const team = avg(currentE.map(e => e.teamwork_score));
    const work = avg(currentE.map(e => e.workload_score ?? null));

    const pct = (cur: number | null, prv: number | null) => {
      if (cur === null || prv === null) return null;
      if (prv === 0) return null;
      return Number((((cur - prv) / prv) * 100).toFixed(1));
    };

    const perfPrev = avg(prevE.map(e => e.performance_score));
    const teamPrev = avg(prevE.map(e => e.teamwork_score));
    const workPrev = avg(prevE.map(e => e.workload_score ?? null));

    return {
      performance: perf,
      teamwork: team,
      workload: work,
      perfTrend: pct(perf, perfPrev),
      teamTrend: pct(team, teamPrev),
      workTrend: pct(work, workPrev),
    };
  }, [evaluations]);

  const categoryData = useMemo(() => {
    if (!evaluations.length) return [];
    // Use latest period
    const periods = Array.from(new Set(evaluations.map(e => e.period))).sort();
    const current = periods[periods.length - 1];
    const cur = evaluations.filter(e => e.period === current);

    const perf = avg(cur.map(e => e.performance_score));
    const team = avg(cur.map(e => e.teamwork_score));
    const work = avg(cur.map(e => e.workload_score ?? null));

    return [
      { category: t('kpi.performance'), value: perf ?? 0 },
      { category: t('kpi.teamwork'), value: team ?? 0 },
      { category: t('kpi.workload'), value: work ?? 0 },
    ];
  }, [evaluations, language]);

  const history = useMemo(() => {
    if (!evaluations.length) return [];
    const byKey = new Map<string, EvalRow[]>();
    for (const e of evaluations) {
      const key = `${e.period}__${isSame(e.evaluation_type) ? 'same' : (isCross(e.evaluation_type) ? 'cross' : 'other')}`;
      const list = byKey.get(key) || [];
      list.push(e);
      byKey.set(key, list);
    }

    const items = Array.from(byKey.entries()).map(([key, rows]) => {
      const [period, kind] = key.split('__');
      const perf = avg(rows.map(r => r.performance_score)) ?? null;
      const team = avg(rows.map(r => r.teamwork_score)) ?? null;
      const work = avg(rows.map(r => r.workload_score ?? null)) ?? null;
      const overall = avg([perf, team, work]);
      return {
        period,
        kind,
        overall,
        performance: perf,
        teamwork: team,
        workload: work,
      };
    });

    // Sort newest first
    return items.sort((a, b) => (a.period < b.period ? 1 : -1)).slice(0, 12);
  }, [evaluations]);

  const handleBack = () => navigate(-1);

  const handleExportPDF = async () => {
    if (!canExport || !profile?.id) return;
    setExporting(true);
    try {
      await exportReportServer({
        report: 'employee',
        format: 'pdf',
        language: language as 'en' | 'ar',
        params: { userId: profile.id },
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!canExport || !profile?.id) return;
    setExporting(true);
    try {
      await exportReportServer({
        report: 'employee',
        format: 'excel',
        language: language as 'en' | 'ar',
        params: { userId: profile.id },
      });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={language === 'ar' ? 'الملف الشخصي' : 'User Profile'} />
        <div className="container mx-auto px-4 py-12">
          <div className="text-center text-muted-foreground">{language === 'ar' ? 'جاري التحميل...' : 'Loading...'}</div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={language === 'ar' ? 'الملف الشخصي' : 'User Profile'} />
        <div className="container mx-auto px-4 py-12">
          <div className="text-center">
            <p className="text-lg font-semibold">{language === 'ar' ? 'لا يمكن العثور على الموظف' : 'Employee not found'}</p>
            <button className="mt-4 text-primary underline" onClick={() => navigate('/employees')}>
              {language === 'ar' ? 'العودة إلى الموظفين' : 'Back to Employees'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const displayName = language === 'ar' ? profile.name_ar : profile.name_en;

  return (
    <div className="min-h-screen bg-background">
      <Header title={language === 'ar' ? 'الملف الشخصي' : 'User Profile'} />

      <div className="container mx-auto px-4 py-6">
        <button onClick={handleBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          {language === 'ar' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          {t('common.back')}
        </button>

        {/* Header Card */}
        <div className="bg-card rounded-2xl p-6 shadow-md border border-border flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <User className="w-7 h-7 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{displayName}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  {department ? (language === 'ar' ? department.name_ar : department.name_en) : (language === 'ar' ? 'بدون قسم' : 'No department')}
                </span>
                <span className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  {profile.email}
                </span>
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {language === 'ar' ? 'آخر تحديث:' : 'Last Updated:'} {new Date(profile.updated_at).toLocaleString(language === 'ar' ? 'ar' : 'en', { month: 'long', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>

          {canExport && (
            <ExportButtons busy={exporting} onExportPDF={handleExportPDF} onExportExcel={handleExportExcel} />
          )}
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <KPICard title={t('kpi.performance')} value={kpis.performance} maxValue={3} trend={kpis.perfTrend ?? undefined} variant="blue" showGauge />
          <KPICard title={t('kpi.teamwork')} value={kpis.teamwork} maxValue={3} trend={kpis.teamTrend ?? undefined} variant="green" showGauge />
          <KPICard title={t('kpi.workload')} value={kpis.workload} maxValue={3} trend={kpis.workTrend ?? undefined} variant="yellow" showGauge />
        </div>

        {/* Charts */}
        {evaluations.length ? (
          <>
            <div className="bg-card rounded-2xl p-6 shadow-md border border-border mb-6">
              <h2 className="text-lg font-semibold mb-4">{t('chart.categoryBreakdown')}</h2>
              <CategoryBarChart data={categoryData as any} />
            </div>

            <TrendLineChart data={trendData} title={t('chart.trend')} />

            <div className="bg-card rounded-2xl p-6 shadow-md border border-border mt-6">
              <h2 className="text-lg font-semibold mb-4">{t('chart.history')}</h2>
              <div className="space-y-3">
                {history.map((h) => (
                  <div key={`${h.period}-${h.kind}`} className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-semibold">
                        {h.overall === null ? '—' : h.overall.toFixed(1)}
                      </div>
                      <div>
                        <div className="font-semibold">
                          {h.kind === 'same' ? (language === 'ar' ? 'داخل القسم' : 'Same Dept') : (language === 'ar' ? 'عبر الأقسام' : 'Cross Dept')}
                        </div>
                        <div className="text-xs text-muted-foreground">{h.period}</div>
                      </div>
                    </div>

                    <div className="text-sm text-muted-foreground flex gap-4">
                      <span>{t('kpi.performance')}: <span className="text-foreground">{h.performance === null ? '—' : h.performance.toFixed(1)}</span></span>
                      <span>{t('kpi.teamwork')}: <span className="text-foreground">{h.teamwork === null ? '—' : h.teamwork.toFixed(1)}</span></span>
                      <span>{t('kpi.workload')}: <span className="text-foreground">{h.workload === null ? '—' : h.workload.toFixed(1)}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-card rounded-2xl p-10 shadow-md border border-border text-center text-muted-foreground">
            {language === 'ar' ? 'لا توجد تقييمات حتى الآن لهذا الموظف.' : 'No evaluations yet for this employee.'}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserProfilePage;
