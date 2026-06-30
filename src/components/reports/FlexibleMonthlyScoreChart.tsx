import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type EvaluationRow = {
  id: string;
  created_at: string;
  period: string;
  status: string;
  performance_score: number;
  teamwork_score: number;
  workload_score: number | null;
};

type PeriodRange = '3' | '6' | '12' | '24' | 'all';

const colors = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea'];
const scoreOf = (row: EvaluationRow) => {
  const values = [row.performance_score, row.teamwork_score];
  if (typeof row.workload_score === 'number') values.push(row.workload_score);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const periodOf = (row: EvaluationRow) => row.period || row.created_at.slice(0, 7);
const lastMonths = (count: number) => {
  const output: string[] = [];
  const now = new Date();
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    output.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }
  return output;
};
const labelOf = (period: string, language: string) => {
  const [year, month] = period.split('-').map((item) => parseInt(item, 10));
  if (!year || !month) return period;
  return new Date(year, month - 1, 1).toLocaleString(language === 'ar' ? 'ar' : 'en', { month: 'short', year: '2-digit' });
};

const FlexibleMonthlyScoreChart: React.FC<{ evaluations: EvaluationRow[]; language: string }> = ({ evaluations, language }) => {
  const [periodRange, setPeriodRange] = useState<PeriodRange>('6');
  const chartData = useMemo(() => {
    const completed = evaluations.filter((row) => row.status === 'completed');
    const periods = periodRange === 'all' ? Array.from(new Set(completed.map(periodOf))).sort() : lastMonths(Number(periodRange));
    return periods.map((period, index) => {
      const rows = completed.filter((row) => periodOf(row) === period);
      const value = average(rows.map(scoreOf));
      return { period, month: labelOf(period, language), score: value === null ? null : Number(value.toFixed(2)), evaluations: rows.length, fill: colors[index % colors.length] };
    });
  }, [evaluations, language, periodRange]);

  return (
    <div className="bg-card border rounded-xl p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-4">
        <div>
          <div className="font-semibold">{language === 'ar' ? 'الرسم الشهري المرن للدرجات' : 'Flexible Monthly Score Chart'}</div>
          <p className="text-sm text-muted-foreground">{language === 'ar' ? 'متوسط الدرجات الشهرية من التقييمات المكتملة فقط.' : 'Monthly average score from completed evaluations only.'}</p>
        </div>
        <Select value={periodRange} onValueChange={(value) => setPeriodRange(value as PeriodRange)}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="3">{language === 'ar' ? 'آخر 3 أشهر' : 'Last 3 months'}</SelectItem>
            <SelectItem value="6">{language === 'ar' ? 'آخر 6 أشهر' : 'Last 6 months'}</SelectItem>
            <SelectItem value="12">{language === 'ar' ? 'آخر 12 شهر' : 'Last 12 months'}</SelectItem>
            <SelectItem value="24">{language === 'ar' ? 'آخر 24 شهر' : 'Last 24 months'}</SelectItem>
            <SelectItem value="all">{language === 'ar' ? 'كل الفترات' : 'All periods'}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis domain={[0, 5]} />
            <Tooltip />
            <Legend />
            <Bar dataKey="score" name={language === 'ar' ? 'الدرجة' : 'Score'} radius={[6, 6, 0, 0]}>
              {chartData.map((entry) => <Cell key={entry.period} fill={entry.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FlexibleMonthlyScoreChart;
