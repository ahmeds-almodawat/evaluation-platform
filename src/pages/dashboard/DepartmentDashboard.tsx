import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/components/layout/Header';
import EmptyState from '@/components/common/EmptyState';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';
import DashboardLastUpdated from '@/components/dashboard/DashboardLastUpdated';
import KPICard from '@/components/ui/KPICard';
import CountUpNumber from '@/components/ui/CountUpNumber';
import TrendLineChart from '@/components/charts/TrendLineChart';
import CategoryHeatmap from '@/components/charts/CategoryHeatmap';
import EvaluationCampaignBreakdown, { CampaignBreakdownItem } from '@/components/dashboard/EvaluationCampaignBreakdown';
import UnitRollupTable, { UnitRollupRow } from '@/components/dashboard/UnitRollupTable';
import ExportButtons from '@/components/ui/ExportButtons';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import { exportReportServer } from '@/utils/exportServer';
import {
  CAMPAIGN_TYPE_ORDER,
  averageEvaluationScore,
  evaluationScore,
  isCrossCampaign,
  normalizeCampaignType,
  type CampaignTypeKey,
} from '@/utils/evaluationCampaigns';
import { AlertTriangle, GitBranch } from 'lucide-react';

interface EmployeeHeatmapRow {
  id: string;
  nameEn: string;
  nameAr: string;
  performance: number;
  teamwork: number;
}

interface DepartmentStats {
  employeeCount: number;
  avgSameDept: number | null;
  avgCrossDept: number | null;
  managerToTeam: number | null;
  teamToManager: number | null;
  participation: number | null;
  alertCount: number;
}

interface ProfileRow {
  id: string;
  name_en: string;
  name_ar: string;
  unit_id?: string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
}

interface OrgUnitRow {
  id: string;
  department_id: string;
  name_en: string;
  name_ar: string;
  is_active?: boolean | null;
}

interface EvaluationRow {
  id: string;
  evaluatee_id: string;
  evaluator_id: string | null;
  evaluation_type: string | null;
  evaluation_scope?: string | null;
  evaluator_unit_id?: string | null;
  evaluatee_unit_id?: string | null;
  performance_score: number | null;
  teamwork_score: number | null;
  period?: string | null;
  created_at?: string | null;
}

const db = supabase as any;
const toNumber = (value: number | null | undefined): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const buildCampaignBreakdown = (evaluations: EvaluationRow[]): CampaignBreakdownItem[] => {
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
};

const DepartmentDashboard: React.FC = () => {
  const { t, language } = useLanguage();
  const { profile, department, canViewAlerts, role, hasPermission } = useSupabaseAuth();
  const [loading, setLoading] = useState(true);
  const [lastUpdatedIso, setLastUpdatedIso] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const canExport = hasPermission('reports.export') || role === 'admin' || role === 'super_user' || role === 'audit';
  const [employees, setEmployees] = useState<EmployeeHeatmapRow[]>([]);
  const [trendData, setTrendData] = useState<Array<{ month: string; sameDept: number | null; crossDept: number | null }>>([]);
  const [campaignBreakdown, setCampaignBreakdown] = useState<CampaignBreakdownItem[]>([]);
  const [unitRollups, setUnitRollups] = useState<UnitRollupRow[]>([]);
  const [stats, setStats] = useState<DepartmentStats>({
    employeeCount: 0,
    avgSameDept: null,
    avgCrossDept: null,
    managerToTeam: null,
    teamToManager: null,
    participation: null,
    alertCount: 0,
  });

  useEffect(() => {
    if (profile?.department_id) {
      fetchDepartmentData();
    } else {
      setLoading(false);
      setLastUpdatedIso(new Date().toISOString());
    }
  }, [profile?.department_id]);

  const fetchCompletedEvaluations = async (employeeIds: string[]): Promise<EvaluationRow[]> => {
    if (!employeeIds.length) return [];
    const enhancedSelect = 'id,evaluatee_id,evaluator_id,evaluation_type,evaluation_scope,evaluator_unit_id,evaluatee_unit_id,performance_score,teamwork_score,period,created_at';
    const fallbackSelect = 'id,evaluatee_id,evaluator_id,evaluation_type,performance_score,teamwork_score,period,created_at';

    const { data, error } = await db
      .from('evaluations')
      .select(enhancedSelect)
      .in('evaluatee_id', employeeIds)
      .eq('status', 'completed');
    if (!error) return (data ?? []) as EvaluationRow[];

    const { data: fallbackData, error: fallbackError } = await db
      .from('evaluations')
      .select(fallbackSelect)
      .in('evaluatee_id', employeeIds)
      .eq('status', 'completed');
    if (fallbackError) throw fallbackError;
    return (fallbackData ?? []) as EvaluationRow[];
  };

  const fetchUnits = async (departmentId: string): Promise<OrgUnitRow[]> => {
    const { data, error } = await db
      .from('org_units')
      .select('id,department_id,name_en,name_ar,is_active')
      .eq('department_id', departmentId)
      .eq('is_active', true);
    if (error && error.code === '42P01') return [];
    if (error) throw error;
    return (data ?? []) as OrgUnitRow[];
  };

  const buildDepartmentUnitRollups = (
    evaluations: EvaluationRow[],
    profiles: ProfileRow[],
    units: OrgUnitRow[],
  ): UnitRollupRow[] => {
    const profileById = new Map(profiles.map((row) => [row.id, row]));
    const unitById = new Map(units.map((unit) => [unit.id, unit]));
    const employeeCounts = new Map<string, number>();

    profiles.forEach((employee) => {
      const unitKey = employee.unit_id ?? 'no-unit';
      employeeCounts.set(unitKey, (employeeCounts.get(unitKey) ?? 0) + 1);
    });

    const buckets = new Map<string, EvaluationRow[]>();
    evaluations.forEach((evaluation) => {
      const evaluatee = profileById.get(evaluation.evaluatee_id);
      const unitKey = evaluation.evaluatee_unit_id ?? evaluatee?.unit_id ?? 'no-unit';
      buckets.set(unitKey, [...(buckets.get(unitKey) ?? []), evaluation]);
    });

    const keys = new Set([...employeeCounts.keys(), ...buckets.keys()]);
    return Array.from(keys)
      .map((unitKey) => {
        const unit = unitKey === 'no-unit' ? null : unitById.get(unitKey);
        const rows = buckets.get(unitKey) ?? [];
        const byType = (type: CampaignTypeKey) => rows.filter((row) => normalizeCampaignType(row.evaluation_type) === type);
        return {
          id: `${profile?.department_id ?? 'department'}__${unitKey}`,
          departmentName: language === 'ar' ? (department?.name_ar ?? '—') : (department?.name_en ?? '—'),
          unitName: unit
            ? language === 'ar'
              ? unit.name_ar
              : unit.name_en
            : language === 'ar'
              ? 'بدون وحدة / على مستوى القسم'
              : 'No unit / Department level',
          employeeCount: employeeCounts.get(unitKey) ?? 0,
          evaluationCount: rows.length,
          average: averageEvaluationScore(rows),
          selfStationAverage: averageEvaluationScore(byType('self_station')),
          crossStationAverage: averageEvaluationScore(byType('cross_station')),
          managerToTeamAverage: averageEvaluationScore(byType('manager_to_team')),
          teamToManagerAverage: averageEvaluationScore(byType('team_to_manager')),
        };
      })
      .filter((row) => row.employeeCount > 0 || row.evaluationCount > 0)
      .sort((a, b) => (b.evaluationCount - a.evaluationCount) || toNumber(b.average) - toNumber(a.average));
  };

  const fetchDepartmentData = async () => {
    try {
      setLoading(true);
      const departmentId = profile?.department_id;
      if (!departmentId) return;

      const [{ data: profilesData, error: profilesError }, units] = await Promise.all([
        db
          .from('profiles')
          .select('id, name_en, name_ar, unit_id, is_active, deleted_at')
          .eq('department_id', departmentId)
          .eq('is_active', true)
          .is('deleted_at', null),
        fetchUnits(departmentId),
      ]);

      if (profilesError) throw profilesError;
      const profiles = (profilesData ?? []) as ProfileRow[];
      const employeeIds = profiles.map((row) => row.id);
      const evaluationsData = await fetchCompletedEvaluations(employeeIds);

      const employeeScores: Record<string, { internal: EvaluationRow[]; cross: EvaluationRow[]; all: EvaluationRow[] }> = {};
      evaluationsData.forEach((evaluation) => {
        if (!employeeScores[evaluation.evaluatee_id]) {
          employeeScores[evaluation.evaluatee_id] = { internal: [], cross: [], all: [] };
        }
        employeeScores[evaluation.evaluatee_id].all.push(evaluation);
        if (isCrossCampaign(evaluation.evaluation_type)) {
          employeeScores[evaluation.evaluatee_id].cross.push(evaluation);
        } else {
          employeeScores[evaluation.evaluatee_id].internal.push(evaluation);
        }
      });

      let alertCount = 0;
      const employeeHeatmapData = profiles.map((employee) => {
        const scores = employeeScores[employee.id];
        const internalAvg = averageEvaluationScore(scores?.internal ?? []) ?? 0;
        const crossAvg = averageEvaluationScore(scores?.cross ?? []) ?? 0;
        const allAvg = averageEvaluationScore(scores?.all ?? []);
        if (typeof allAvg === 'number' && allAvg > 0 && allAvg < 1.8) alertCount++;
        return {
          id: employee.id,
          nameEn: employee.name_en,
          nameAr: employee.name_ar,
          performance: internalAvg,
          teamwork: crossAvg,
        };
      });

      const internalEvaluations = evaluationsData.filter((row) => !isCrossCampaign(row.evaluation_type));
      const crossEvaluations = evaluationsData.filter((row) => isCrossCampaign(row.evaluation_type));
      const evaluatedEmployees = new Set(evaluationsData.map((row) => row.evaluatee_id));
      const campaignItems = buildCampaignBreakdown(evaluationsData);

      setEmployees(employeeHeatmapData);
      setStats({
        employeeCount: profiles.length,
        avgSameDept: averageEvaluationScore(internalEvaluations),
        avgCrossDept: averageEvaluationScore(crossEvaluations),
        managerToTeam: campaignItems.find((item) => item.key === 'manager_to_team')?.average ?? null,
        teamToManager: campaignItems.find((item) => item.key === 'team_to_manager')?.average ?? null,
        participation: profiles.length > 0 ? (evaluatedEmployees.size / profiles.length) * 100 : null,
        alertCount,
      });
      setCampaignBreakdown(campaignItems);
      setUnitRollups(buildDepartmentUnitRollups(evaluationsData, profiles, units));

      const periods = Array.from(new Set(evaluationsData.map((evaluation) => evaluation.period).filter(Boolean) as string[])).sort();
      const trend = periods.slice(-12).map((period) => {
        const periodRows = evaluationsData.filter((evaluation) => evaluation.period === period);
        const same = periodRows.filter((evaluation) => !isCrossCampaign(evaluation.evaluation_type));
        const cross = periodRows.filter((evaluation) => isCrossCampaign(evaluation.evaluation_type));
        return {
          month: period,
          sameDept: averageEvaluationScore(same),
          crossDept: averageEvaluationScore(cross),
        };
      });
      setTrendData(trend);
    } catch (error) {
      console.error('Error fetching department data:', error);
      setTrendData([]);
      setEmployees([]);
    } finally {
      setLoading(false);
      setLastUpdatedIso(new Date().toISOString());
    }
  };

  const handleExportPDF = async () => {
    if (!canExport || !profile?.department_id) return;
    setExporting(true);
    try {
      await exportReportServer({
        report: 'department',
        format: 'pdf',
        language: language as 'en' | 'ar',
        params: { departmentId: profile.department_id },
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!canExport || !profile?.department_id) return;
    setExporting(true);
    try {
      await exportReportServer({
        report: 'department',
        format: 'excel',
        language: language as 'en' | 'ar',
        params: { departmentId: profile.department_id },
      });
    } finally {
      setExporting(false);
    }
  };

  const sameSparkline = useMemo(
    () => trendData.map((p) => p.sameDept).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)),
    [trendData],
  );
  const crossSparkline = useMemo(
    () => trendData.map((p) => p.crossDept).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)),
    [trendData],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={t('dashboard.department')} />
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header title={t('dashboard.department')} />

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-end">
          <DashboardLastUpdated value={lastUpdatedIso} label={language === 'ar' ? 'آخر تحديث' : 'Last updated'} />
        </div>

        {(stats.participation ?? 0) === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title={language === 'ar' ? 'لا توجد تقييمات لهذا القسم بعد' : 'No department evaluations yet'}
            description={language === 'ar' ? 'أرسل تقييمات لهذا القسم ثم ارجع هنا لمشاهدة النتائج.' : 'Send evaluations for this department, then come back to see insights.'}
            actionLabel={language === 'ar' ? 'فتح التقييمات' : 'Go to Evaluations'}
            onAction={() => window.location.assign('/evaluations')}
          />
        ) : null}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in-up">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{language === 'ar' ? department?.name_ar : department?.name_en}</h2>
            <p className="text-muted-foreground mt-1">
              {stats.employeeCount} {language === 'ar' ? 'موظف' : 'employees'} · {unitRollups.length} {language === 'ar' ? 'وحدة / محطة' : 'units / stations'}
            </p>
          </div>
          {canExport ? <ExportButtons busy={exporting} onExportPDF={handleExportPDF} onExportExcel={handleExportExcel} /> : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
          <KPICard
            title={language === 'ar' ? 'داخلي / وحدة' : 'Internal / Unit'}
            value={stats.avgSameDept}
            maxValue={3}
            sparklineData={sameSparkline.length >= 2 ? sameSparkline : undefined}
            variant="blue"
            showGauge={true}
            subtitle={language === 'ar' ? 'داخلي + مدير/فريق' : 'Self + manager/team flows'}
            linkTo="/reports/department"
          />
          <KPICard
            title={language === 'ar' ? 'خارجي / تنسيقي' : 'Cross / Coordination'}
            value={stats.avgCrossDept}
            maxValue={3}
            sparklineData={crossSparkline.length >= 2 ? crossSparkline : undefined}
            variant="green"
            showGauge={true}
            subtitle={language === 'ar' ? 'بين الوحدات والأقسام' : 'Across units and departments'}
            linkTo="/reports/department"
          />
          <KPICard
            title={language === 'ar' ? 'المدير → الفريق' : 'Manager → Team'}
            value={stats.managerToTeam}
            maxValue={3}
            variant="yellow"
            showGauge={true}
            linkTo="/reports/department"
          />
          <KPICard
            title={language === 'ar' ? 'الفريق → المدير' : 'Team → Manager'}
            value={stats.teamToManager}
            maxValue={3}
            variant="green"
            showGauge={true}
            linkTo="/reports/department"
          />
          <KPICard
            title={t('kpi.participation')}
            value={stats.participation}
            maxValue={100}
            variant="yellow"
            showGauge={true}
            showPercentage={true}
            linkTo="/evaluations"
          />
        </div>

        {canViewAlerts ? (
          <div className="rounded-xl border border-danger/20 bg-danger/5 p-4 animate-fade-in-up">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-danger" />
              <div>
                <div className="font-semibold text-foreground">{language === 'ar' ? 'تنبيهات القسم' : 'Department Alerts'}</div>
                <div className="text-sm text-muted-foreground">
                  <CountUpNumber value={stats.alertCount} decimals={0} /> {language === 'ar' ? 'موظفين يحتاجون اهتمام بناءً على متوسط منخفض.' : 'employees need attention based on low average score.'}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <EvaluationCampaignBreakdown
          title={language === 'ar' ? 'تفصيل حملات القسم' : 'Department Campaign Breakdown'}
          subtitle={language === 'ar' ? 'يفصل تقييم الوحدة، بين الوحدات، بين الأقسام، المدير للفريق، والفريق للمدير.' : 'Separates self unit, cross unit, cross department, manager-to-team, and team-to-manager results.'}
          items={campaignBreakdown}
          language={language}
        />

        <UnitRollupTable
          title={language === 'ar' ? 'نتائج الوحدات / المحطات داخل القسم' : 'Department Unit / Station Scores'}
          subtitle={language === 'ar' ? 'مهم للأقسام الكبيرة مثل التمريض، ويظل اختياريًا للأقسام الصغيرة.' : 'Designed for large departments like Nursing while staying optional for small departments.'}
          rows={unitRollups}
          language={language}
        />

        {employees.length > 0 ? (
          <CategoryHeatmap data={employees} title={t('chart.heatmap')} />
        ) : (
          <div className="chart-container animate-fade-in-up">
            <h3 className="text-lg font-semibold text-foreground mb-4">{t('chart.heatmap')}</h3>
            <p className="text-muted-foreground text-center py-8">{language === 'ar' ? 'لا توجد بيانات للموظفين' : 'No employee data available'}</p>
          </div>
        )}

        <TrendLineChart data={trendData} title={t('chart.trend')} />

        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground animate-fade-in-up">
          <div className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            <GitBranch className="h-4 w-4" />
            {language === 'ar' ? 'ملاحظة هيكلية' : 'Structure note'}
          </div>
          {language === 'ar'
            ? 'إذا كان القسم يحتوي على وحدات/محطات، ستظهر النتائج حسب الوحدة. إذا لم تكن هناك وحدات، يعمل التقرير على مستوى القسم فقط.'
            : 'When a department has units/stations, results roll up by unit. When it has no units, the dashboard remains department-level only.'}
        </div>
      </div>
    </div>
  );
};

export default DepartmentDashboard;
