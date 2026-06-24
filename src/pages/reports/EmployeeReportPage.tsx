import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ExportButtons from '@/components/ui/ExportButtons';
import EmptyState from '@/components/common/EmptyState';
import { exportReportServer } from '@/utils/exportServer';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import PeriodScoreDrilldown from '@/components/evaluations/PeriodScoreDrilldown';

type EvaluationRow = {
  id: string;
  created_at: string;
  period: string;
  status: string;
  performance_score: number;
  teamwork_score: number;
  workload_score: number | null;
};

type ProfileRow = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  email: string | null;
  position: string | null;
  department_id: string | null;
};

const scoreOf = (e: EvaluationRow) => {
  const vals: number[] = [e.performance_score, e.teamwork_score];
  if (typeof e.workload_score === 'number') vals.push(e.workload_score);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
};

const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);

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

const EmployeeReportPage: React.FC = () => {
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId?: string }>();
  const { user } = useSupabaseAuth();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(userId ?? null);
  const [exporting, setExporting] = useState(false);

  // Keep URL param in sync
  useEffect(() => {
    setSelectedUserId(userId ?? null);
  }, [userId]);

  // If no userId, default to current user (for convenience in admin workflows)
  useEffect(() => {
    if (!userId && user?.id) {
      // We don't auto-navigate if admin wants to pick; we show the picker first.
      // If you prefer auto-open self report, change this to navigate(`/reports/employee/${user.id}`).
    }
  }, [userId, user?.id, navigate]);

  const employeesQuery = useQuery({
    queryKey: ['employee-report-employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,name_en,name_ar,email,position,department_id')
        .order('name_en', { ascending: true });
      if (error) throw error;
      return (data as any as ProfileRow[]) ?? [];
    },
  });

  const reportQuery = useQuery({
    queryKey: ['employee-report', selectedUserId],
    enabled: Boolean(selectedUserId),
    queryFn: async () => {
      const uid = selectedUserId as string;

      const [{ data: profile, error: pErr }, { data: evaluations, error: eErr }] = await Promise.all([
        supabase.from('profiles').select('id,name_en,name_ar,email,position,department_id').eq('id', uid).single(),
        supabase
          .from('evaluations')
          .select('id,created_at,period,status,performance_score,teamwork_score,workload_score')
          .eq('evaluatee_id', uid)
          .order('created_at', { ascending: false }),
      ]);

      if (pErr) throw pErr;
      if (eErr) throw eErr;

      return { profile: profile as any as ProfileRow, evaluations: (evaluations as any as EvaluationRow[]) ?? [] };
    },
  });

  const computed = useMemo(() => {
    const profile = reportQuery.data?.profile;
    const evaluations = reportQuery.data?.evaluations ?? [];

    const total = evaluations.length;
    const completed = evaluations.filter((e) => e.status === 'completed').length;
    const completionRate = total ? Math.round((completed / total) * 100) : 0;

    const scores = evaluations.map(scoreOf);
    const avgScore = avg(scores);

    const months = lastNMonths(6);
    const trend = months.map((m) => {
      const bucket = evaluations.filter((e) => monthKey(e.created_at) === m);
      const bucketScores = bucket.map(scoreOf);
      return {
        month: monthLabel(m, language === 'ar' ? 'ar' : 'en'),
        score: avg(bucketScores) === null ? null : Number((avg(bucketScores) as number).toFixed(2)),
      };
    });

    const metrics = {
      total,
      completed,
      completionRate,
      avgScore: avgScore === null ? null : Number((avgScore as number).toFixed(2)),
      avgPerformance: avg(evaluations.map((e) => e.performance_score)) === null ? null : Number((avg(evaluations.map((e) => e.performance_score)) as number).toFixed(2)),
      avgTeamwork: avg(evaluations.map((e) => e.teamwork_score)) === null ? null : Number((avg(evaluations.map((e) => e.teamwork_score)) as number).toFixed(2)),
      avgWorkload: (() => {
        const wl = evaluations.map((e) => (typeof e.workload_score === 'number' ? e.workload_score : null)).filter((x): x is number => typeof x === 'number');
        const a = avg(wl);
        return a === null ? null : Number(a.toFixed(2));
      })(),
    };

    return { profile, evaluations, metrics, trend };
  }, [reportQuery.data, language]);

  const employeeLabel = (p: ProfileRow) => {
    const name = language === 'ar' ? p.name_ar : p.name_en;
    return name || p.email || p.id;
  };

  const onPickEmployee = (id: string) => {
    setSelectedUserId(id);
    navigate(`/reports/employee/${id}`);
  };

  const handleExport = async (format: 'pdf' | 'excel') => {
    if (!selectedUserId) return;

    setExporting(true);
    try {
      await exportReportServer({
        report: 'employee',
        format,
        language: language as 'en' | 'ar',
        params: { userId: selectedUserId },
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('report.employee')}</h1>
          <p className="text-muted-foreground">{language === 'ar' ? 'تقرير تفصيلي للموظف' : 'Detailed employee report'}</p>
        </div>
        <ExportButtons busy={exporting} onPDF={() => handleExport('pdf')} onExcel={() => handleExport('excel')} />
      </div>

      <div className="bg-card border rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-center">
          <div>
            <div className="text-sm text-muted-foreground">{language === 'ar' ? 'اختر موظفًا' : 'Select employee'}</div>
            <Select value={selectedUserId ?? ''} onValueChange={onPickEmployee}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={language === 'ar' ? 'اختر...' : 'Choose...'} />
              </SelectTrigger>
              <SelectContent>
                {employeesQuery.data?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {employeeLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {computed.profile ? (
            <>
              <div className="sm:col-span-1 lg:col-span-1">
                <div className="text-sm text-muted-foreground">{language === 'ar' ? 'المنصب' : 'Position'}</div>
                <div className="font-medium">{computed.profile.position || '—'}</div>
              </div>
              <div className="sm:col-span-1 lg:col-span-1">
                <div className="text-sm text-muted-foreground">{language === 'ar' ? 'البريد' : 'Email'}</div>
                <div className="font-medium">{computed.profile.email || '—'}</div>
              </div>
            </>
          ) : (
            <div className="sm:col-span-2 lg:col-span-2" />
          )}
        </div>
      </div>

      {reportQuery.isLoading ? (
        <div className="space-y-4">
          <div className="h-28 bg-muted rounded-xl" />
          <div className="h-72 bg-muted rounded-xl" />
        </div>
      ) : reportQuery.isError ? (
        <EmptyState
          title={language === 'ar' ? 'تعذر تحميل التقرير' : 'Could not load report'}
          description={language === 'ar' ? 'تحقق من الاتصال ثم حاول مرة أخرى.' : 'Check your connection and try again.'}
          actionLabel={language === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          onAction={() => reportQuery.refetch()}
        />
      ) : !computed.profile ? (
        <EmptyState
          title={language === 'ar' ? 'اختر موظفًا' : 'Pick an employee'}
          description={language === 'ar' ? 'ابدأ بتحديد موظف لعرض التقرير.' : 'Select an employee to view the report.'}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border rounded-xl p-5">
              <div className="text-sm text-muted-foreground">{language === 'ar' ? 'التقييمات' : 'Evaluations'}</div>
              <div className="text-3xl font-bold">{computed.metrics.total}</div>
            </div>
            <div className="bg-card border rounded-xl p-5">
              <div className="text-sm text-muted-foreground">{language === 'ar' ? 'نسبة الإكمال' : 'Completion rate'}</div>
              <div className="text-3xl font-bold">{computed.metrics.completionRate}%</div>
            </div>
            <div className="bg-card border rounded-xl p-5">
              <div className="text-sm text-muted-foreground">{language === 'ar' ? 'متوسط الدرجة' : 'Avg score'}</div>
              <div className="text-3xl font-bold">{computed.metrics.avgScore ?? '—'}</div>
            </div>
            <div className="bg-card border rounded-xl p-5">
              <div className="text-sm text-muted-foreground">{language === 'ar' ? 'آخر تحديث' : 'Last updated'}</div>
              <div className="text-lg font-semibold">
                {computed.evaluations[0]?.created_at ? new Date(computed.evaluations[0].created_at).toLocaleDateString(language === 'ar' ? 'ar' : 'en') : '—'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border rounded-xl p-5">
              <div className="font-semibold mb-4">{language === 'ar' ? 'الاتجاه (آخر 6 أشهر)' : 'Trend (last 6 months)'}</div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={computed.trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis domain={[0, 5]} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="score" name={language === 'ar' ? 'الدرجة' : 'Score'} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-card border rounded-xl p-5">
              <div className="font-semibold mb-4">{language === 'ar' ? 'متوسطات المجالات' : 'Category averages'}</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">{language === 'ar' ? 'الأداء' : 'Performance'}</div>
                  <div className="text-xl font-bold">{computed.metrics.avgPerformance ?? '—'}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">{language === 'ar' ? 'العمل الجماعي' : 'Teamwork'}</div>
                  <div className="text-xl font-bold">{computed.metrics.avgTeamwork ?? '—'}</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">{language === 'ar' ? 'عبء العمل' : 'Workload'}</div>
                  <div className="text-xl font-bold">{computed.metrics.avgWorkload ?? '—'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card border rounded-xl p-5">
            <div className="bg-card border rounded-xl p-5">
            <div className="font-semibold mb-4">{language === 'ar' ? 'تفصيل الدرجة حسب الفترة' : 'Score breakdown by period'}</div>
            {selectedUserId && computed.profile ? (
              <PeriodScoreDrilldown
                targetUserId={selectedUserId}
                targetName={employeeLabel(computed.profile)}
                language={language === 'ar' ? 'ar' : 'en'}
              />
            ) : (
              <div className="text-sm text-muted-foreground">
                {language === 'ar' ? 'اختر موظفًا لعرض التفاصيل.' : 'Select an employee to view details.'}
              </div>
            )}
          </div>

          <div className="font-semibold mb-4">{language === 'ar' ? 'آخر التقييمات' : 'Recent evaluations'}</div>
            <div className="w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">{language === 'ar' ? 'التاريخ' : 'Date'}</th>
                    <th className="text-left py-2 px-2">{language === 'ar' ? 'الفترة' : 'Period'}</th>
                    <th className="text-left py-2 px-2">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                    <th className="text-left py-2 px-2">{language === 'ar' ? 'الدرجة' : 'Score'}</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.evaluations.slice(0, 20).map((e) => (
                    <tr key={e.id} className="border-b last:border-b-0">
                      <td className="py-2 px-2">{new Date(e.created_at).toLocaleDateString(language === 'ar' ? 'ar' : 'en')}</td>
                      <td className="py-2 px-2">{e.period}</td>
                      <td className="py-2 px-2">{e.status}</td>
                      <td className="py-2 px-2">{scoreOf(e).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default EmployeeReportPage;
