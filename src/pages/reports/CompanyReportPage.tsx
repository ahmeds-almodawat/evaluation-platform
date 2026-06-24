import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/components/ui/use-toast';
import ExportButtons from '@/components/ui/ExportButtons';
import EmptyState from '@/components/common/EmptyState';
import { exportReportServer } from '@/utils/exportServer';

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
};

type ProfileRow = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  department_id: string | null;
};

type DepartmentRow = { id: string; name_en: string | null; name_ar: string | null };

const scoreOf = (e: EvaluationRow) => {
  const vals: number[] = [e.performance_score, e.teamwork_score];
  if (typeof e.workload_score === 'number') vals.push(e.workload_score);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
};

const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);

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
    return new Date(y, m - 1, 1).toLocaleString(locale, { month: 'short' });
  } catch {
    return yyyymm;
  }
};

const CompanyReportPage: React.FC = () => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['company-report'],
    queryFn: async () => {
      const [{ data: evaluations, error: evalErr }, { data: profiles, error: profErr }, { data: departments, error: deptErr }] =
        await Promise.all([
          supabase
            .from('evaluations')
            .select('id,created_at,period,status,evaluation_type,evaluator_id,evaluatee_id,performance_score,teamwork_score,workload_score')
            .order('created_at', { ascending: false }),
          supabase.from('profiles').select('id,name_en,name_ar,department_id'),
          supabase.from('departments').select('id,name_en,name_ar'),
        ]);

      if (evalErr) throw evalErr;
      if (profErr) throw profErr;
      if (deptErr) throw deptErr;

      return {
        evaluations: (evaluations as any as EvaluationRow[]) ?? [],
        profiles: (profiles as any as ProfileRow[]) ?? [],
        departments: (departments as any as DepartmentRow[]) ?? [],
      };
    },
  });

  const computed = useMemo(() => {
    const evaluations = data?.evaluations ?? [];
    const profiles = data?.profiles ?? [];
    const departments = data?.departments ?? [];

    const deptByUser = new Map<string, string | null>();
    profiles.forEach((p) => deptByUser.set(p.id, p.department_id));

    const months = lastNMonths(6);
    const recent = evaluations.filter((e) => months.includes(monthKey(e.created_at)));

    const scoresAll = recent.map(scoreOf);
    const overallAvg = avg(scoresAll) ?? 0;
    const volatility = overallAvg > 0 ? Math.round((stddev(scoresAll) / overallAvg) * 100) : 0;

    const same: number[] = [];
    const cross: number[] = [];
    const evaluated = new Set<string>();

    recent.forEach((e) => {
      evaluated.add(e.evaluatee_id);
      const evaluatorDept = e.evaluator_id ? deptByUser.get(e.evaluator_id) : null;
      const evaluateeDept = deptByUser.get(e.evaluatee_id) ?? null;
      const isSame = evaluatorDept && evaluateeDept && evaluatorDept === evaluateeDept;
      (isSame ? same : cross).push(scoreOf(e));
    });

    const participation = profiles.length ? Math.round((evaluated.size / profiles.length) * 100) : 0;

    const trendData = months.map((m) => {
      const bucket = recent.filter((e) => monthKey(e.created_at) === m);
      const sameB: number[] = [];
      const crossB: number[] = [];
      bucket.forEach((e) => {
        const evaluatorDept = e.evaluator_id ? deptByUser.get(e.evaluator_id) : null;
        const evaluateeDept = deptByUser.get(e.evaluatee_id) ?? null;
        const isSame = evaluatorDept && evaluateeDept && evaluatorDept === evaluateeDept;
        (isSame ? sameB : crossB).push(scoreOf(e));
      });
      return {
        month: monthLabel(m, language === 'ar' ? 'ar' : 'en'),
        sameDept: avg(sameB) === null ? null : Number((avg(sameB) as number).toFixed(2)),
        crossDept: avg(crossB) === null ? null : Number((avg(crossB) as number).toFixed(2)),
      };
    });

    const departmentBenchmarks = departments
      .map((d) => {
        const usersInDept = profiles.filter((p) => p.department_id === d.id).map((p) => p.id);
        const set = new Set(usersInDept);
        const deptEvals = recent.filter((e) => set.has(e.evaluatee_id));

        const sameD: number[] = [];
        const crossD: number[] = [];
        const evald = new Set<string>();
        let alerts = 0;

        deptEvals.forEach((e) => {
          evald.add(e.evaluatee_id);
          const evaluatorDept = e.evaluator_id ? deptByUser.get(e.evaluator_id) : null;
          const evaluateeDept = deptByUser.get(e.evaluatee_id) ?? null;
          const isSame = evaluatorDept && evaluateeDept && evaluatorDept === evaluateeDept;
          const s = scoreOf(e);
          (isSame ? sameD : crossD).push(s);
          if (s < 2) alerts += 1;
        });

        return {
          deptId: d.id,
          nameEn: d.name_en ?? d.id,
          nameAr: d.name_ar ?? d.id,
          avgSameDept: avg(sameD) === null ? null : Number((avg(sameD) as number).toFixed(2)),
          avgCrossDept: avg(crossD) === null ? null : Number((avg(crossD) as number).toFixed(2)),
          participation: usersInDept.length ? Math.round((evald.size / usersInDept.length) * 100) : 0,
          employeeCount: usersInDept.length,
          alertCount: alerts,
        };
      })
      .sort((a, b) => (b.avgSameDept ?? 0) - (a.avgSameDept ?? 0));

    const metrics = {
      totalEmployees: profiles.length,
      totalEvaluations: recent.length,
      avgSameDept: avg(same) === null ? null : Number((avg(same) as number).toFixed(2)),
      avgCrossDept: avg(cross) === null ? null : Number((avg(cross) as number).toFixed(2)),
      participation,
      volatility,
    };

    return { metrics, departmentBenchmarks, trendData };
  }, [data, language]);

  const handleExport = async (format: 'pdf' | 'excel') => {
    setExporting(true);
    try {
      await exportReportServer({
        report: 'company',
        format,
        language: language as 'en' | 'ar',
      });
      toast({
        title: language === 'ar' ? 'تم التصدير' : 'Export started',
        description: language === 'ar' ? 'يتم تنزيل الملف الآن.' : 'Your file is downloading now.',
      });
    } catch (e: any) {
      toast({
        title: language === 'ar' ? 'فشل التصدير' : 'Export failed',
        description: e?.message ?? (language === 'ar' ? 'حدث خطأ غير متوقع.' : 'An unexpected error occurred.'),
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 animate-fade-in">
        <div className="h-8 w-56 bg-muted rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="h-28 bg-muted rounded-xl" />
          <div className="h-28 bg-muted rounded-xl" />
          <div className="h-28 bg-muted rounded-xl" />
        </div>
        <div className="h-72 bg-muted rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <EmptyState
          title={language === 'ar' ? 'تعذر تحميل التقرير' : 'Could not load report'}
          description={language === 'ar' ? 'تحقق من الاتصال ثم حاول مرة أخرى.' : 'Check your connection and try again.'}
          actionLabel={language === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          onAction={() => refetch()}
        />
      </div>
    );
  }

  const { metrics, departmentBenchmarks, trendData } = computed;

  if (!metrics || (!departmentBenchmarks.length && !trendData.length)) {
    return (
      <div className="p-6">
        <EmptyState
          title={language === 'ar' ? 'لا توجد بيانات' : 'No data yet'}
          description={language === 'ar' ? 'أضف تقييمات لعرض تقرير الشركة.' : 'Add evaluations to see the company report.'}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('report.company')}</h1>
          <p className="text-muted-foreground">{language === 'ar' ? 'آخر 6 أشهر (حقيقي بدون بيانات وهمية)' : 'Last 6 months (real data — no mock)'}</p>
        </div>
        <ExportButtons busy={exporting} onPDF={() => handleExport('pdf')} onExcel={() => handleExport('excel')} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-card border rounded-xl p-5">
          <div className="text-sm text-muted-foreground">{t('kpi.totalEmployees')}</div>
          <div className="text-3xl font-bold">{metrics.totalEmployees}</div>
        </div>
        <div className="bg-card border rounded-xl p-5">
          <div className="text-sm text-muted-foreground">{t('kpi.totalEvaluations')}</div>
          <div className="text-3xl font-bold">{metrics.totalEvaluations}</div>
        </div>
        <div className="bg-card border rounded-xl p-5">
          <div className="text-sm text-muted-foreground">{t('kpi.participation')}</div>
          <div className="text-3xl font-bold">{metrics.participation}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="font-semibold">{language === 'ar' ? 'مقارنة الأقسام' : 'Department comparison'}</div>
              <div className="text-sm text-muted-foreground">{language === 'ar' ? 'نفس القسم مقابل عبر الأقسام' : 'Same department vs cross department'}</div>
            </div>
            <div className="text-sm text-muted-foreground">{language === 'ar' ? 'تقلب' : 'Volatility'}: <span className="font-medium text-foreground">{metrics.volatility}%</span></div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">{language === 'ar' ? 'نفس القسم' : 'Same department avg'}</div>
              <div className="text-xl font-bold">{metrics.avgSameDept ?? '—'}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">{language === 'ar' ? 'عبر الأقسام' : 'Cross department avg'}</div>
              <div className="text-xl font-bold">{metrics.avgCrossDept ?? '—'}</div>
            </div>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-5">
          <div className="font-semibold mb-4">{language === 'ar' ? 'الاتجاه الشهري' : 'Monthly trend'}</div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis domain={[0, 5]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="sameDept" name={language === 'ar' ? 'نفس القسم' : 'Same Dept'} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="crossDept" name={language === 'ar' ? 'عبر الأقسام' : 'Cross Dept'} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold">{language === 'ar' ? 'أداء الأقسام' : 'Department performance'}</div>
          <div className="text-sm text-muted-foreground">{language === 'ar' ? 'مرتّب حسب المتوسط' : 'Sorted by average'}</div>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2">{language === 'ar' ? 'القسم' : 'Department'}</th>
                <th className="text-left py-2 px-2">{language === 'ar' ? 'نفس القسم' : 'Same'}</th>
                <th className="text-left py-2 px-2">{language === 'ar' ? 'عبر الأقسام' : 'Cross'}</th>
                <th className="text-left py-2 px-2">{language === 'ar' ? 'المشاركة' : 'Participation'}</th>
                <th className="text-left py-2 px-2">{language === 'ar' ? 'الموظفون' : 'Employees'}</th>
                <th className="text-left py-2 px-2">{language === 'ar' ? 'تنبيهات' : 'Alerts'}</th>
              </tr>
            </thead>
            <tbody>
              {departmentBenchmarks.map((d) => (
                <tr key={d.deptId} className="border-b last:border-b-0">
                  <td className="py-2 px-2 font-medium">{language === 'ar' ? d.nameAr : d.nameEn}</td>
                  <td className="py-2 px-2">{d.avgSameDept ?? '—'}</td>
                  <td className="py-2 px-2">{d.avgCrossDept ?? '—'}</td>
                  <td className="py-2 px-2">{d.participation}%</td>
                  <td className="py-2 px-2">{d.employeeCount}</td>
                  <td className="py-2 px-2">{d.alertCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CompanyReportPage;
