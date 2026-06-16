import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useLanguage } from '@/contexts/LanguageContext';

export interface DepartmentData {
  id: string;
  nameEn: string;
  nameAr: string;
  employeeCount?: number;
  avgSameDept: number;
  avgCrossDept: number;
  participation?: number;
  alertCount?: number;
}

interface DepartmentBenchmarkChartProps {
  data: DepartmentData[];
  title?: string;
  subtitle?: string;
}

const DepartmentBenchmarkChart: React.FC<DepartmentBenchmarkChartProps> = ({
  data,
  title,
  subtitle,
}) => {
  const { t, language, direction } = useLanguage();

  const chartData = data.map((dept) => ({
    name: language === 'ar' ? dept.nameAr : dept.nameEn,
    sameDept: dept.avgSameDept,
    crossDept: dept.avgCrossDept,
  }));

  return (
    <div className="chart-container animate-fade-in-up">
      {title && (
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {subtitle ? <p className="text-sm text-muted-foreground mt-1">{subtitle}</p> : null}
        </div>
      )}
      <ResponsiveContainer width="100%" height={350}>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 0, bottom: 40 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            opacity={0.5}
          />
          <XAxis
            dataKey="name"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            angle={-35}
            textAnchor="end"
            height={80}
            interval={0}
          />
          <YAxis
            domain={[0, 3]}
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            orientation={direction === 'rtl' ? 'right' : 'left'}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-md)',
            }}
            labelStyle={{ color: 'hsl(var(--foreground))' }}
            formatter={(value: any) => {
              const n = typeof value === 'number' ? value : Number(value);
              return [Number.isFinite(n) ? n.toFixed(2) : '—', ''];
            }}
          />
          <Legend
            wrapperStyle={{
              paddingTop: '10px',
            }}
          />
          <Bar
            dataKey="sameDept"
            name={t('kpi.sameDept')}
            fill="hsl(var(--primary))"
            radius={[4, 4, 0, 0]}
            barSize={20}
          />
          <Bar
            dataKey="crossDept"
            name={t('kpi.crossDept')}
            fill="hsl(var(--success))"
            radius={[4, 4, 0, 0]}
            barSize={20}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DepartmentBenchmarkChart;
