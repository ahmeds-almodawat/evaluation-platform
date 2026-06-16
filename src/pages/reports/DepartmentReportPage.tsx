import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/layout/Header';
import KPICard from '@/components/ui/KPICard';
import TrendLineChart from '@/components/charts/TrendLineChart';
import CategoryHeatmap from '@/components/charts/CategoryHeatmap';
import ExportButtons from '@/components/ui/ExportButtons';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import { exportReportServer } from '@/utils/exportServer';
import { useToast } from '@/components/ui/use-toast';
import { buildTrendFromEvaluations } from '@/utils/trends';
import { ArrowLeft, ArrowRight, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmployeeHeatmapRow {
  id: string;
  nameEn: string;
  nameAr: string;
  performance: number;
  teamwork: number;
  workload?: number;
}

interface DepartmentStats {
  employeeCount: number;
  avgSameDept: number | null;
  avgCrossDept: number | null;
  participation: number | null;
  alertCount: number;
}

type EvalRow = {
  evaluatee_id: string;
  evaluation_type: string | null;
  performance_score: number;
  teamwork_score: number;
  workload_score: number | null;
  created_at?: string | null;
};

const DepartmentReportPage: React.FC = () => {
  const { t, language, direction } = useLanguage();
  const { role, profile, department, canViewAlerts } = useSupabaseAuth();
  const navigate = useNavigate();

  const BackIcon = direction === 'rtl' ? ArrowRight : ArrowLeft;
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeHeatmapRow[]>([]);
  const [trendData, setTrendData] = useState<Array<{ month: string; sameDept: number | null; crossDept: number | null }>>([]);
  const [stats, setStats] = useState<DepartmentStats>({
    employeeCount: 0,
    avgSameDept: null,
    avgCrossDept: null,
    participation: null,
    alertCount: 0,
  });

  const deptId = profile?.department_id || null;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!deptId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        // Employees in this department
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, name_en, name_ar')
          .eq('department_id', deptId);

        if (profilesError) throw profilesError;

        const employeeIds = (profilesData || []).map((p: any) => p.id);
        const employeeCount = employeeIds.length;

        let employeeHeatmapData: EmployeeHeatmapRow[] = [];
        let nextTrend: Array<{ month: string; sameDept: number | null; crossDept: number | null }> = [];
        let nextStats: DepartmentStats = {
          employeeCount,
          avgSameDept: null,
          avgCrossDept: null,
          participation: null,
          alertCount: 0,
        };

        if (employeeIds.length > 0) {
          const { data: evaluationsData, error: evalError } = await supabase
            .from('evaluations')
            .select('evaluatee_id,evaluation_type,performance_score,teamwork_score,workload_score,created_at')
            .in('evaluatee_id', employeeIds);

          if (evalError) throw evalError;

          const evals = (evaluationsData || []) as any as EvalRow[];

          // Heatmap averages per employee
          const employeeScores: Record<string, { performance: number[]; teamwork: number[]; workload: number[] }> = {};
          for (const e of evals) {
            if (!employeeScores[e.evaluatee_id]) employeeScores[e.evaluatee_id] = { performance: [], teamwork: [], workload: [] };
            employeeScores[e.evaluatee_id].performance.push(e.performance_score);
            employeeScores[e.evaluatee_id].teamwork.push(e.teamwork_score);
            if (e.workload_score !== null && typeof e.workload_score === 'number') employeeScores[e.evaluatee_id].workload.push(e.workload_score);
          }

          let totalPerf = 0;
          let totalTeam = 0;
          let evaluatedEmployees = 0;
          let alertCount = 0;

          employeeHeatmapData = (profilesData || []).map((p: any) => {
            const scores = employeeScores[p.id];
            const avg = (arr?: number[]) => (arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
            const avgPerformance = avg(scores?.performance);
            const avgTeamwork = avg(scores?.teamwork);
            const avgWorkload = scores?.workload?.length ? avg(scores.workload) : undefined;

            if (scores) {
              totalPerf += avgPerformance;
              totalTeam += avgTeamwork;
              evaluatedEmployees++;
              if (avgPerformance < 1.8 || avgTeamwork < 1.8 || (avgWorkload !== undefined && avgWorkload < 1.8)) {
                alertCount++;
              }
            }

            return {
              id: p.id,
              nameEn: p.name_en,
              nameAr: p.name_ar,
              performance: avgPerformance,
              teamwork: avgTeamwork,
              workload: avgWorkload,
            };
          });

          nextStats = {
            employeeCount,
            avgSameDept: evaluatedEmployees > 0 ? totalPerf / evaluatedEmployees : null,
            avgCrossDept: evaluatedEmployees > 0 ? totalTeam / evaluatedEmployees : null,
            participation: evaluatedEmployees > 0 && employeeCount > 0 ? (evaluatedEmployees / employeeCount) * 100 : null,
            alertCount,
          };

          // 12-month trend from real data (no mock)
          nextTrend = buildTrendFromEvaluations(evals, language, 12).map((p) => ({
            month: p.month,
            sameDept: p.sameDept,
            crossDept: p.crossDept,
          }));
        }

        if (!cancelled) {
          setEmployees(employeeHeatmapData);
          setTrendData(nextTrend);
          setStats(nextStats);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setEmployees([]);
          setTrendData([]);
          setStats({ employeeCount: 0, avgSameDept: null, avgCrossDept: null, participation: null, alertCount: 0 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [deptId, language]);

  const deptDataForExport = useMemo(() => {
    return {
      id: deptId || '',
      nameEn: department?.name_en || '',
      nameAr: department?.name_ar || '',
      ...stats,
    };
  }, [deptId, department?.name_en, department?.name_ar, stats]);

  const handleExportPDF = () => {
    exportReportServer({
      report: 'department',
      format: 'pdf',
      language: language as 'en' | 'ar',
      params: { departmentId: deptDataForExport.id },
    }).catch(() => undefined);
  };

  const handleExportExcel = () => {
    exportReportServer({
      report: 'department',
      format: 'excel',
      language: language as 'en' | 'ar',
      params: { departmentId: deptDataForExport.id },
    }).catch(() => undefined);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!deptId) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={t('report.department')} />
        <div className="p-6 flex items-center justify-center">
          <p className="text-muted-foreground">{language === 'ar' ? 'لم يتم تعيين قسم' : 'No department assigned'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header title={t('report.department')} />

      <div className="p-6 space-y-6">
        {/* Back Button & Export */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fade-in-up">
          <Button variant="ghost" onClick={() => navigate('/reports')} className="gap-2 w-fit">
            <BackIcon className="w-4 h-4" />
            {language === 'ar' ? 'العودة للتقارير' : 'Back to Reports'}
          </Button>
          <ExportButtons onExportPDF={handleExportPDF} onExportExcel={handleExportExcel} disabled={employees.length === 0} />
        </div>

        {/* Report Header */}
        <div className="bg-card rounded-xl p-6 shadow-md animate-fade-in-up">
          <h2 className="text-2xl font-bold text-foreground">
            {language === 'ar' ? 'تقرير أداء القسم' : 'Department Performance Report'}
          </h2>
          <p className="text-muted-foreground mt-1">
            {(language === 'ar' ? department?.name_ar : department?.name_en) || ''} — {stats.employeeCount}{' '}
            {language === 'ar' ? 'موظف' : 'employees'}
          </p>
        </div>

        {/* KPI Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPICard title={t('kpi.sameDept')} value={stats.avgSameDept} maxValue={3} variant="blue" showGauge={true} />
          <KPICard title={t('kpi.crossDept')} value={stats.avgCrossDept} maxValue={3} variant="green" showGauge={true} />
          <KPICard title={t('kpi.participation')} value={stats.participation} maxValue={100} variant="yellow" showGauge={true} showPercentage={true} />

          {canViewAlerts && (
            <div className="kpi-card kpi-card-red animate-fade-in-up">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground">{t('kpi.alerts')}</h3>
                <AlertTriangle className="w-5 h-5 text-danger" />
              </div>
              <div className="flex items-center justify-center py-4">
                <div className="text-center">
                  <span className="text-4xl font-bold text-danger">{stats.alertCount}</span>
                  <p className="text-xs text-muted-foreground mt-2">
                    {language === 'ar' ? 'موظفين يحتاجون اهتمام' : 'employees need attention'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Category Heatmap */}
        <CategoryHeatmap data={employees as any} title={t('chart.heatmap')} />

        {/* Trend Line Chart */}
        <TrendLineChart data={trendData as any} title={t('chart.trend')} />
      </div>
    </div>
  );
};

export default DepartmentReportPage;
