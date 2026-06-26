import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/components/layout/Header';
import KPICard from '@/components/ui/KPICard';
import CountUpNumber from '@/components/ui/CountUpNumber';
import TrendLineChart from '@/components/charts/TrendLineChart';
import DepartmentBenchmarkChart from '@/components/charts/DepartmentBenchmarkChart';
import EmptyState from '@/components/common/EmptyState';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';
import DashboardLastUpdated from '@/components/dashboard/DashboardLastUpdated';
import EvaluationCampaignBreakdown, { CampaignBreakdownItem } from '@/components/dashboard/EvaluationCampaignBreakdown';
import UnitRollupTable, { UnitRollupRow } from '@/components/dashboard/UnitRollupTable';
import ExportButtons from '@/components/ui/ExportButtons';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { exportReportServer } from '@/utils/exportServer';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { buildTrendFromEvaluations, calcPctTrend } from '@/utils/trends';
import {
  CAMPAIGN_TYPE_ORDER,
  averageEvaluationScore,
  evaluationScore,
  formatScore,
  isCrossCampaign,
  normalizeCampaignType,
  type CampaignTypeKey,
} from '@/utils/evaluationCampaigns';
import { Activity, GitBranch, TrendingUp, Users } from 'lucide-react';

interface DepartmentBenchmark {
  id: string;
  nameEn: string;
  nameAr: string;
  avgSameDept: number;
  avgCrossDept: number;
  employeeCount: number;
  participation: number;
  alertCount: number;
}

interface CompanyMetrics {
  totalEmployees: number;
  totalEvaluations: number;
  avgSameDept: number | null;
  avgCrossDept: number | null;
  participation: number;
  volatility: number;
}

interface ProfileRow {
  id: string;
  department_id: string | null;
  unit_id?: string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
}

interface DepartmentRow {
  id: string;
  name_en: string;
  name_ar: string;
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

const buildUnitRollups = (
  evaluations: EvaluationRow[],
  profiles: ProfileRow[],
  departments: DepartmentRow[],
  units: OrgUnitRow[],
  language: string,
): UnitRollupRow[] => {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const deptById = new Map(departments.map((dept) => [dept.id, dept]));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const employeeCounts = new Map<string, number>();

  profiles.forEach((profile) => {
    if (!profile.department_id) return;
    const unitKey = profile.unit_id ?? 'no-unit';
    const key = `${profile.department_id}__${unitKey}`;
    employeeCounts.set(key, (employeeCounts.get(key) ?? 0) + 1);
  });

  const buckets = new Map<string, EvaluationRow[]>();
  evaluations.forEach((evaluation) => {
    const evaluatee = profileById.get(evaluation.evaluatee_id);
    const departmentId = evaluatee?.department_id;
    if (!departmentId) return;
    const unitId = evaluation.evaluatee_unit_id ?? evaluatee?.unit_id ?? null;
    const key = `${departmentId}__${unitId ?? 'no-unit'}`;
    buckets.set(key, [...(buckets.get(key) ?? []), evaluation]);
  });

  const keys = new Set([...employeeCounts.keys(), ...buckets.keys()]);
  return Array.from(keys)
    .map((key) => {
      const [departmentId, rawUnitId] = key.split('__');
      const unitId = rawUnitId === 'no-unit' ? null : rawUnitId;
      const dept = deptById.get(departmentId);
      const unit = unitId ? unitById.get(unitId) : null;
      const rows = buckets.get(key) ?? [];
      const byType = (type: CampaignTypeKey) => rows.filter((row) => normalizeCampaignType(row.evaluation_type) === type);
      return {
        id: key,
        departmentName: language === 'ar' ? (dept?.name_ar ?? '—') : (dept?.name_en ?? '—'),
        unitName: unit
          ? language === 'ar'
            ? unit.name_ar
            : unit.name_en
          : language === 'ar'
            ? 'بدون وحدة / على مستوى القسم'
            : 'No unit / Department level',
        employeeCount: employeeCounts.get(key) ?? 0,
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

const CompanyDashboard: React.FC = () => {
  const { t, language } = useLanguage();
  const { role, hasPermission } = useSupabaseAuth();
  const canExport = hasPermission('reports.export') || role === 'admin' || role === 'super_user' || role === 'audit';
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<CompanyMetrics>({
    totalEmployees: 0,
    totalEvaluations: 0,
    avgSameDept: null,
    avgCrossDept: null,
    participation: 0,
    volatility: 0,
  });
  const [departmentBenchmarks, setDepartmentBenchmarks] = useState<DepartmentBenchmark[]>([]);
  const [trendData, setTrendData] = useState<{ month: string; sameDept: number | null; crossDept: number | null }[]>([]);
  const [campaignBreakdown, setCampaignBreakdown] = useState<CampaignBreakdownItem[]>([]);
  const [unitRollups, setUnitRollups] = useState<UnitRollupRow[]>([]);
  const [lastUpdatedIso, setLastUpdatedIso] = useState<string | null>(null);

  useEffect(() => {
    fetchCompanyData();
  }, []);

  const fetchCompletedEvaluations = async (): Promise<EvaluationRow[]> => {
    const enhancedSelect = 'id,evaluatee_id,evaluator_id,evaluation_type,evaluation_scope,evaluator_unit_id,evaluatee_unit_id,performance_score,teamwork_score,period,created_at';
    const fallbackSelect = 'id,evaluatee_id,evaluator_id,evaluation_type,performance_score,teamwork_score,period,created_at';

    const { data, error } = await db.from('evaluations').select(enhancedSelect).eq('status', 'completed');
    if (!error) return (data ?? []) as EvaluationRow[];

    const { data: fallbackData, error: fallbackError } = await db.from('evaluations').select(fallbackSelect).eq('status', 'completed');
    if (fallbackError) throw fallbackError;
    return (fallbackData ?? []) as EvaluationRow[];
  };

  const fetchOrgUnits = async (): Promise<OrgUnitRow[]> => {
    const { data, error } = await db.from('org_units').select('id,department_id,name_en,name_ar,is_active').eq('is_active', true);
    if (error && error.code === '42P01') return [];
    if (error) throw error;
    return (data ?? []) as OrgUnitRow[];
  };

  const fetchCompanyData = async () => {
    setLoading(true);
    try {
      const [{ data: profiles, error: profilesError }, { data: departments, error: deptError }, evaluations, units] = await Promise.all([
        db.from('profiles').select('id, department_id, unit_id, is_active, deleted_at'),
        db.from('departments').select('id,name_en,name_ar'),
        fetchCompletedEvaluations(),
        fetchOrgUnits(),
      ]);

      if (profilesError) throw profilesError;
      if (deptError) throw deptError;

      const profileRows = (profiles ?? []) as ProfileRow[];
      const activeProfileRows = profileRows.filter((profile) => profile.is_active !== false && profile.deleted_at == null);
      const activeProfileIds = new Set(activeProfileRows.map((profile) => profile.id));
      const departmentRows = (departments ?? []) as DepartmentRow[];
      const evaluationRows = evaluations ?? [];
      const totalEmployees = activeProfileRows.length;
      const totalEvaluations = evaluationRows.length;
      const sameEvals = evaluationRows.filter((row) => !isCrossCampaign(row.evaluation_type));
      const crossEvals = evaluationRows.filter((row) => isCrossCampaign(row.evaluation_type));
      const avgSameDept = averageEvaluationScore(sameEvals);
      const avgCrossDept = averageEvaluationScore(crossEvals);
      const evaluatedEmployees = new Set(evaluationRows.map((row) => row.evaluatee_id).filter((id) => activeProfileIds.has(id)));
      const participation = totalEmployees > 0 ? (evaluatedEmployees.size / totalEmployees) * 100 : 0;

      setMetrics({
        totalEmployees,
        totalEvaluations,
        avgSameDept,
        avgCrossDept,
        participation: Math.round(participation),
        volatility: 0,
      });

      const deptBenchmarks: DepartmentBenchmark[] = departmentRows.map((dept) => {
        const deptEmployees = activeProfileRows.filter((profile) => profile.department_id === dept.id);
        const deptEmployeeIds = new Set(deptEmployees.map((profile) => profile.id));
        const deptEvaluations = evaluationRows.filter((row) => deptEmployeeIds.has(row.evaluatee_id));
        const deptSame = deptEvaluations.filter((row) => !isCrossCampaign(row.evaluation_type));
        const deptCross = deptEvaluations.filter((row) => isCrossCampaign(row.evaluation_type));
        const evaluatedInDept = new Set(deptEvaluations.map((row) => row.evaluatee_id));
        const deptParticipation = deptEmployees.length > 0 ? (evaluatedInDept.size / deptEmployees.length) * 100 : 0;
        const avgSame = averageEvaluationScore(deptSame) ?? 0;
        const avgCross = averageEvaluationScore(deptCross) ?? 0;
        const alertCount = deptEmployees.filter((employee) => {
          const rows = deptEvaluations.filter((row) => row.evaluatee_id === employee.id);
          const avg = averageEvaluationScore(rows);
          return typeof avg === 'number' && avg > 0 && avg < 1.8;
        }).length;
        return {
          id: dept.id,
          nameEn: dept.name_en,
          nameAr: dept.name_ar,
          avgSameDept: avgSame,
          avgCrossDept: avgCross,
          employeeCount: deptEmployees.length,
          participation: Math.round(deptParticipation),
          alertCount,
        };
      });

      setDepartmentBenchmarks(deptBenchmarks);
      setTrendData(buildTrendFromEvaluations(evaluationRows, language, 12));
      setCampaignBreakdown(buildCampaignBreakdown(evaluationRows));
      setUnitRollups(buildUnitRollups(evaluationRows, activeProfileRows, departmentRows, units, language));
    } catch (error) {
      console.error('Error fetching company data:', error);
    } finally {
      setLoading(false);
      setLastUpdatedIso(new Date().toISOString());
    }
  };

  const handleExportPDF = async () => {
    if (!canExport) return;
    setExporting(true);
    try {
      await exportReportServer({ report: 'company', format: 'pdf', language: language as 'en' | 'ar' });
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!canExport) return;
    setExporting(true);
    try {
      await exportReportServer({ report: 'company', format: 'excel', language: language as 'en' | 'ar' });
    } finally {
      setExporting(false);
    }
  };

  const sortedDepts = useMemo(() => [...departmentBenchmarks].sort((a, b) => b.avgSameDept - a.avgSameDept), [departmentBenchmarks]);
  const topDept = sortedDepts[0];
  const bottomDept = sortedDepts[sortedDepts.length - 1];

  const lastSameIdx = [...trendData].reverse().findIndex((p) => typeof p.sameDept === 'number');
  const lastCrossIdx = [...trendData].reverse().findIndex((p) => typeof p.crossDept === 'number');
  const lastSame = lastSameIdx >= 0 ? trendData[trendData.length - 1 - lastSameIdx].sameDept : null;
  const prevSame = lastSameIdx >= 0
    ? (() => {
        for (let i = trendData.length - 2 - lastSameIdx; i >= 0; i--) {
          if (typeof trendData[i].sameDept === 'number') return trendData[i].sameDept;
        }
        return null;
      })()
    : null;
  const lastCross = lastCrossIdx >= 0 ? trendData[trendData.length - 1 - lastCrossIdx].crossDept : null;
  const prevCross = lastCrossIdx >= 0
    ? (() => {
        for (let i = trendData.length - 2 - lastCrossIdx; i >= 0; i--) {
          if (typeof trendData[i].crossDept === 'number') return trendData[i].crossDept;
        }
        return null;
      })()
    : null;

  const sameTrendPct = calcPctTrend(lastSame, prevSame);
  const crossTrendPct = calcPctTrend(lastCross, prevCross);
  const sameSparkline = trendData.map((p) => p.sameDept).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const crossSparkline = trendData.map((p) => p.crossDept).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

  const managerToTeamAvg = campaignBreakdown.find((item) => item.key === 'manager_to_team')?.average ?? null;
  const teamToManagerAvg = campaignBreakdown.find((item) => item.key === 'team_to_manager')?.average ?? null;

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={t('dashboard.company')} />
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header title={t('dashboard.company')} />

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-end">
          <DashboardLastUpdated value={lastUpdatedIso} label={language === 'ar' ? 'آخر تحديث' : 'Last updated'} />
        </div>

        {metrics.totalEvaluations === 0 ? (
          <EmptyState
            icon={Activity}
            title={language === 'ar' ? 'لا توجد تقييمات بعد' : 'No evaluations yet'}
            description={language === 'ar' ? 'ابدأ بإرسال أول تقييم لمجموعة صغيرة حتى تظهر النتائج في لوحة المعلومات.' : 'Start by sending your first evaluation to a small group to populate the dashboards.'}
            actionLabel={language === 'ar' ? 'فتح التقييمات' : 'Go to Evaluations'}
            onAction={() => window.location.assign('/evaluations')}
          />
        ) : null}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in-up">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="w-5 h-5" />
              <span className="text-lg">{metrics.totalEmployees} {language === 'ar' ? 'موظف' : 'employees'}</span>
            </div>
            <div className="w-px h-6 bg-border" />
            <div className="flex items-center gap-2 text-muted-foreground">
              <Activity className="w-5 h-5" />
              <span className="text-lg">{metrics.totalEvaluations} {language === 'ar' ? 'تقييم مكتمل' : 'completed evaluations'}</span>
            </div>
            <div className="w-px h-6 bg-border" />
            <div className="flex items-center gap-2 text-muted-foreground">
              <GitBranch className="w-5 h-5" />
              <span className="text-lg">{unitRollups.length} {language === 'ar' ? 'وحدة / محطة' : 'units / stations'}</span>
            </div>
          </div>
          {canExport ? <ExportButtons busy={exporting} onExportPDF={handleExportPDF} onExportExcel={handleExportExcel} /> : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
          <KPICard
            title={language === 'ar' ? 'داخلي / وحدات' : 'Internal / Unit Score'}
            value={metrics.avgSameDept}
            maxValue={3}
            trend={sameTrendPct ?? undefined}
            sparklineData={sameSparkline.length >= 2 ? sameSparkline : undefined}
            variant="blue"
            showGauge={true}
            subtitle={language === 'ar' ? 'داخلي، مدير→فريق، فريق→مدير' : 'Self, Manager→Team, Team→Manager'}
            linkTo="/reports/company"
          />
          <KPICard
            title={language === 'ar' ? 'خارجي / تنسيقي' : 'Cross / Coordination'}
            value={metrics.avgCrossDept}
            maxValue={3}
            trend={crossTrendPct ?? undefined}
            sparklineData={crossSparkline.length >= 2 ? crossSparkline : undefined}
            variant="green"
            showGauge={true}
            subtitle={language === 'ar' ? 'بين وحدات وبين أقسام' : 'Cross station and cross department'}
            linkTo="/reports/company"
          />
          <KPICard
            title={language === 'ar' ? 'المدير → الفريق' : 'Manager → Team'}
            value={managerToTeamAvg}
            maxValue={3}
            variant="yellow"
            showGauge={true}
            subtitle={language === 'ar' ? 'تقييم المدير لأعضاء الفريق' : 'Manager evaluation average'}
            linkTo="/reports/company"
          />
          <KPICard
            title={language === 'ar' ? 'الفريق → المدير' : 'Team → Manager'}
            value={teamToManagerAvg}
            maxValue={3}
            variant="green"
            showGauge={true}
            subtitle={language === 'ar' ? 'تقييم تصاعدي للمدراء' : 'Upward manager feedback'}
            linkTo="/reports/company"
          />
          <KPICard
            title={t('kpi.participation')}
            value={metrics.participation}
            maxValue={100}
            variant="yellow"
            showGauge={true}
            showPercentage={true}
            linkTo="/evaluations"
          />
        </div>

        <EvaluationCampaignBreakdown
          title={language === 'ar' ? 'تفصيل أنواع حملات التقييم' : 'Evaluation Campaign Breakdown'}
          subtitle={language === 'ar' ? 'يعرض الهيكل الجديد بوضوح مع إبقاء السجلات القديمة للتاريخ.' : 'Shows the new explicit structure while preserving legacy records for history.'}
          items={campaignBreakdown}
          language={language}
        />

        <UnitRollupTable
          title={language === 'ar' ? 'نتائج الوحدات / المحطات' : 'Unit / Station Rollup'}
          subtitle={language === 'ar' ? 'تجميع النتائج حسب القسم ثم الوحدة، مع تفصيل سريع لكل نوع تقييم.' : 'Aggregates scores by department and unit, with a quick split by campaign type.'}
          rows={unitRollups}
          language={language}
        />

        {departmentBenchmarks.length > 0 ? (
          <DepartmentBenchmarkChart data={departmentBenchmarks} title={t('chart.benchmark')} />
        ) : (
          <EmptyState
            title={language === 'ar' ? 'لا توجد بيانات أقسام' : 'No department data available'}
            description={language === 'ar' ? 'جرّب اختيار فترة مختلفة أو تأكد من وجود تقييمات مكتملة.' : 'Try a different period or make sure there are completed evaluations.'}
          />
        )}

        {trendData.length > 0 && metrics.totalEvaluations > 0 ? (
          <TrendLineChart data={trendData} title={t('chart.companyTrend')} />
        ) : (
          <EmptyState
            title={language === 'ar' ? 'لا توجد بيانات اتجاه' : 'No trend data available'}
            description={language === 'ar' ? 'لا توجد نقاط كافية لعرض الاتجاه. سيتم ظهور الرسم بعد اكتمال تقييمات أكثر.' : 'Not enough points to show a trend yet. This will appear once more evaluations are completed.'}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card rounded-lg p-5 shadow-md border-l-4 border-success animate-fade-in-up">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">{language === 'ar' ? 'أفضل قسم' : 'Top Department'}</h3>
            {topDept ? (
              <>
                <p className="text-xl font-bold text-foreground">{language === 'ar' ? topDept.nameAr : topDept.nameEn}</p>
                <p className="text-sm text-success mt-1">{t('label.score')}: {topDept.avgSameDept.toFixed(2)}</p>
              </>
            ) : (
              <p className="text-muted-foreground">{language === 'ar' ? 'لا توجد بيانات' : 'No data'}</p>
            )}
          </div>

          <div className="bg-card rounded-lg p-5 shadow-md border-l-4 border-warning animate-fade-in-up">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">{language === 'ar' ? 'يحتاج تحسين' : 'Needs Improvement'}</h3>
            {bottomDept && sortedDepts.length > 1 ? (
              <>
                <p className="text-xl font-bold text-foreground">{language === 'ar' ? bottomDept.nameAr : bottomDept.nameEn}</p>
                <p className="text-sm text-warning mt-1">{t('label.score')}: {bottomDept.avgSameDept.toFixed(2)}</p>
              </>
            ) : (
              <p className="text-muted-foreground">{language === 'ar' ? 'لا توجد بيانات' : 'No data'}</p>
            )}
          </div>

          <div className="bg-card rounded-lg p-5 shadow-md border-l-4 border-primary animate-fade-in-up">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">{language === 'ar' ? 'التقلب / الاستقرار' : 'Stability Indicator'}</h3>
            <p className="text-xl font-bold text-foreground">
              <CountUpNumber value={metrics.volatility} decimals={0} suffix="%" />
            </p>
            <p className="text-sm text-primary mt-1">
              {language === 'ar' ? `متوسط داخلي ${formatScore(metrics.avgSameDept)}` : `Internal average ${formatScore(metrics.avgSameDept)}`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyDashboard;
