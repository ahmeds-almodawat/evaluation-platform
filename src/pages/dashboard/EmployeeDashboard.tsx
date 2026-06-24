import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/components/layout/Header';
import EmptyState from '@/components/common/EmptyState';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';
import DashboardLastUpdated from '@/components/dashboard/DashboardLastUpdated';
import KPICard from '@/components/ui/KPICard';
import TrendLineChart from '@/components/charts/TrendLineChart';
import CategoryBarChart from '@/components/charts/CategoryBarChart';
import CommentsSection, { AnonymizedCommentItem } from '@/components/comments/CommentsSection';
import EvaluationCampaignBreakdown, { CampaignBreakdownItem } from '@/components/dashboard/EvaluationCampaignBreakdown';
import ExportButtons from '@/components/ui/ExportButtons';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import { exportReportServer } from '@/utils/exportServer';
import {
  CAMPAIGN_TYPE_ORDER,
  averageEvaluationScore,
  campaignShortLabel,
  isCrossCampaign,
  normalizeCampaignType,
  type CampaignTypeKey,
} from '@/utils/evaluationCampaigns';
import { User, Calendar, Briefcase, GitBranch } from 'lucide-react';

interface EmployeeScores {
  internalScore: number | null;
  crossScore: number | null;
  managerToTeam: number | null;
  teamToManager: number | null;
  evaluatorCount: number;
  totalEvaluations: number;
  month: string;
  year: number;
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
  comment?: string | null;
}

interface ProfileDetails {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  department_id: string | null;
  unit_id?: string | null;
}

interface UnitDetails {
  id: string;
  name_en: string;
  name_ar: string;
}

const db = supabase as any;

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

const EmployeeDashboard: React.FC = () => {
  const { t, language } = useLanguage();
  const { user, profile, department, role, hasPermission } = useSupabaseAuth();
  const [loading, setLoading] = useState(true);
  const [lastUpdatedIso, setLastUpdatedIso] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const canExport = hasPermission('reports.export') || role === 'admin' || role === 'super_user' || role === 'audit';
  const [scores, setScores] = useState<EmployeeScores>({
    internalScore: null,
    crossScore: null,
    managerToTeam: null,
    teamToManager: null,
    evaluatorCount: 0,
    totalEvaluations: 0,
    month: new Date().toLocaleString('default', { month: 'long' }),
    year: new Date().getFullYear(),
  });
  const [trendData, setTrendData] = useState<{ month: string; sameDept: number | null; crossDept: number | null }[]>([]);
  const [comments, setComments] = useState<AnonymizedCommentItem[]>([]);
  const [campaignBreakdown, setCampaignBreakdown] = useState<CampaignBreakdownItem[]>([]);
  const [profileDetails, setProfileDetails] = useState<ProfileDetails | null>(null);
  const [unitDetails, setUnitDetails] = useState<UnitDetails | null>(null);

  useEffect(() => {
    if (user?.id) {
      fetchEmployeeData();
    }
  }, [user?.id]);

  const fetchCompletedEvaluations = async (userId: string): Promise<EvaluationRow[]> => {
    const enhancedSelect = 'id,evaluatee_id,evaluator_id,evaluation_type,evaluation_scope,evaluator_unit_id,evaluatee_unit_id,performance_score,teamwork_score,period,created_at,comment';
    const fallbackSelect = 'id,evaluatee_id,evaluator_id,evaluation_type,performance_score,teamwork_score,period,created_at,comment';

    const { data, error } = await db
      .from('evaluations')
      .select(enhancedSelect)
      .eq('evaluatee_id', userId)
      .eq('status', 'completed');
    if (!error) return (data ?? []) as EvaluationRow[];

    const { data: fallbackData, error: fallbackError } = await db
      .from('evaluations')
      .select(fallbackSelect)
      .eq('evaluatee_id', userId)
      .eq('status', 'completed');
    if (fallbackError) throw fallbackError;
    return (fallbackData ?? []) as EvaluationRow[];
  };

  const fetchEmployeeData = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const [evaluations, { data: freshProfile }] = await Promise.all([
        fetchCompletedEvaluations(user.id),
        db.from('profiles').select('id,name_en,name_ar,department_id,unit_id').eq('id', user.id).maybeSingle(),
      ]);

      const profileRow = (freshProfile ?? null) as ProfileDetails | null;
      setProfileDetails(profileRow);

      if (profileRow?.unit_id) {
        const { data: unitData, error: unitError } = await db
          .from('org_units')
          .select('id,name_en,name_ar')
          .eq('id', profileRow.unit_id)
          .maybeSingle();
        if (!unitError) setUnitDetails((unitData ?? null) as UnitDetails | null);
      } else {
        setUnitDetails(null);
      }

      if (evaluations.length > 0) {
        const internalEvals = evaluations.filter((evaluation) => !isCrossCampaign(evaluation.evaluation_type));
        const crossEvals = evaluations.filter((evaluation) => isCrossCampaign(evaluation.evaluation_type));
        const campaignItems = buildCampaignBreakdown(evaluations);
        const uniqueEvaluators = new Set(evaluations.map((evaluation) => evaluation.evaluator_id).filter(Boolean));

        setScores({
          internalScore: averageEvaluationScore(internalEvals),
          crossScore: averageEvaluationScore(crossEvals),
          managerToTeam: campaignItems.find((item) => item.key === 'manager_to_team')?.average ?? null,
          teamToManager: campaignItems.find((item) => item.key === 'team_to_manager')?.average ?? null,
          evaluatorCount: uniqueEvaluators.size,
          totalEvaluations: evaluations.length,
          month: new Date().toLocaleString('default', { month: 'long' }),
          year: new Date().getFullYear(),
        });
        setCampaignBreakdown(campaignItems);

        const periods = Array.from(new Set(evaluations.map((evaluation) => evaluation.period).filter(Boolean) as string[])).sort();
        setTrendData(
          periods.slice(-12).map((period) => {
            const periodRows = evaluations.filter((evaluation) => evaluation.period === period);
            const same = periodRows.filter((evaluation) => !isCrossCampaign(evaluation.evaluation_type));
            const cross = periodRows.filter((evaluation) => isCrossCampaign(evaluation.evaluation_type));
            return {
              month: period,
              sameDept: averageEvaluationScore(same),
              crossDept: averageEvaluationScore(cross),
            };
          }),
        );

        const latestComments = evaluations
          .filter((evaluation) => typeof evaluation.comment === 'string' && evaluation.comment.trim())
          .map((evaluation) => ({
            id: evaluation.id,
            created_at: evaluation.created_at,
            comment: evaluation.comment ?? '',
          }));

        setComments(latestComments as AnonymizedCommentItem[]);
      } else {
        setScores({
          internalScore: null,
          crossScore: null,
          managerToTeam: null,
          teamToManager: null,
          evaluatorCount: 0,
          totalEvaluations: 0,
          month: new Date().toLocaleString('default', { month: 'long' }),
          year: new Date().getFullYear(),
        });
        setTrendData([]);
        setComments([]);
        setCampaignBreakdown(buildCampaignBreakdown([]));
      }
    } catch (error) {
      console.error('Error fetching employee data:', error);
      setTrendData([]);
      setComments([]);
    } finally {
      setLoading(false);
      setLastUpdatedIso(new Date().toISOString());
    }
  };

  const employee = {
    nameEn: profileDetails?.name_en || profile?.name_en || user?.email || 'Employee',
    nameAr: profileDetails?.name_ar || profile?.name_ar || user?.email || 'موظف',
    departmentNameEn: department?.name_en || 'Department',
    departmentNameAr: department?.name_ar || 'القسم',
    unitNameEn: unitDetails?.name_en || 'Department level',
    unitNameAr: unitDetails?.name_ar || 'على مستوى القسم',
  };

  const handleExportPDF = async () => {
    if (!canExport || !user?.id) return;
    setExporting(true);
    try {
      await exportReportServer({
        report: 'employee',
        format: 'pdf',
        language: language as 'en' | 'ar',
        params: { userId: user.id },
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!canExport || !user?.id) return;
    setExporting(true);
    try {
      await exportReportServer({
        report: 'employee',
        format: 'excel',
        language: language as 'en' | 'ar',
        params: { userId: user.id },
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

  const categoryData = useMemo(
    () => campaignBreakdown
      .filter((item) => item.count > 0 && typeof item.average === 'number')
      .map((item) => ({ category: campaignShortLabel(item.key, language), value: item.average ?? 0 })),
    [campaignBreakdown, language],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={t('dashboard.employee')} />
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header title={t('dashboard.employee')} />

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-end">
          <DashboardLastUpdated value={lastUpdatedIso} label={language === 'ar' ? 'آخر تحديث' : 'Last updated'} />
        </div>

        {scores.totalEvaluations === 0 ? (
          <EmptyState
            icon={User}
            title={language === 'ar' ? 'لا توجد تقييمات لك بعد' : 'No personal evaluations yet'}
            description={language === 'ar' ? 'عند اكتمال أول تقييم ستظهر النتائج هنا.' : 'Once your first evaluation is completed, your insights will appear here.'}
          />
        ) : null}

        <div className="bg-card rounded-xl p-6 shadow-md animate-fade-in-up">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">{language === 'ar' ? employee.nameAr : employee.nameEn}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary" className="gap-1">
                    <Briefcase className="w-4 h-4" />
                    {language === 'ar' ? employee.departmentNameAr : employee.departmentNameEn}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <GitBranch className="w-4 h-4" />
                    {language === 'ar' ? employee.unitNameAr : employee.unitNameEn}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <Calendar className="w-4 h-4" />
                    {t('time.lastUpdated')}: {scores.month} {scores.year}
                  </Badge>
                </div>
              </div>
            </div>
            {canExport ? <ExportButtons busy={exporting} onExportPDF={handleExportPDF} onExportExcel={handleExportExcel} /> : null}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
          <KPICard
            title={language === 'ar' ? 'داخلي / وحدة' : 'Internal / Unit'}
            value={scores.internalScore}
            maxValue={3}
            variant="blue"
            sparklineData={sameSparkline.length >= 2 ? sameSparkline : undefined}
            showGauge={true}
            linkTo="/reports/employee"
          />
          <KPICard
            title={language === 'ar' ? 'خارجي / تنسيقي' : 'Cross / Coordination'}
            value={scores.crossScore}
            maxValue={3}
            variant="green"
            sparklineData={crossSparkline.length >= 2 ? crossSparkline : undefined}
            showGauge={true}
            linkTo="/reports/employee"
          />
          <KPICard
            title={language === 'ar' ? 'المدير → أنت' : 'Manager → You'}
            value={scores.managerToTeam}
            maxValue={3}
            variant="yellow"
            showGauge={true}
            subtitle={language === 'ar' ? 'تقييم المدير لأدائك' : 'Manager feedback received'}
            linkTo="/reports/employee"
          />
          <KPICard
            title={language === 'ar' ? 'الفريق → المدير' : 'Team → Manager'}
            value={scores.teamToManager}
            maxValue={3}
            variant="green"
            showGauge={true}
            subtitle={language === 'ar' ? 'ينطبق إذا كنت مديرًا' : 'Applies if you are a manager'}
            linkTo="/reports/employee"
          />
          <KPICard
            title={language === 'ar' ? 'عدد المقيّمين' : 'Evaluator Count'}
            value={scores.evaluatorCount}
            maxValue={Math.max(scores.evaluatorCount, 1)}
            variant="yellow"
            showGauge={false}
            subtitle={`${scores.totalEvaluations} ${language === 'ar' ? 'تقييم مكتمل' : 'completed evaluations'}`}
            linkTo="/evaluations"
          />
        </div>

        <EvaluationCampaignBreakdown
          title={language === 'ar' ? 'تفصيل تقييماتك حسب النوع' : 'Your Evaluation Breakdown by Type'}
          subtitle={language === 'ar' ? 'يعرض تقييمات الزملاء، المدير، الفريق للمدير، وبين الأقسام بشكل منفصل.' : 'Separates peer, manager, upward-manager, and cross-coordination feedback.'}
          items={campaignBreakdown}
          language={language}
        />

        <TrendLineChart data={trendData} title={t('chart.trend')} />

        {categoryData.length > 0 ? (
          <CategoryBarChart data={categoryData} title={language === 'ar' ? 'تفصيل الدرجات حسب نوع التقييم' : 'Score Breakdown by Evaluation Type'} horizontal={true} />
        ) : (
          <EmptyState
            icon={User}
            title={language === 'ar' ? 'لا توجد تقييمات حتى الآن' : 'No evaluations yet'}
            description={language === 'ar' ? 'ستظهر النتائج هنا بعد إكمال التقييمات.' : 'Results will appear here once evaluations are completed.'}
          />
        )}

        <CommentsSection comments={comments} />
      </div>
    </div>
  );
};

export default EmployeeDashboard;
