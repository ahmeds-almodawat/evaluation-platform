import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useLanguage } from '@/contexts/LanguageContext';

interface CategoryBarChartProps {
  data:
    | { performance: number; teamwork: number; workload?: number }
    | Array<{ category: string; value: number }>;
  title?: string;
  horizontal?: boolean;
}

const CategoryBarChart: React.FC<CategoryBarChartProps> = ({
  data,
  title,
  horizontal = true,
}) => {
  const { t, direction } = useLanguage();

  const chartData = Array.isArray(data)
    ? data.map((item) => ({ ...item, fill: 'hsl(var(--primary))' }))
    : [
        { category: t('category.performance'), value: data.performance, fill: 'hsl(var(--primary))' },
        { category: t('category.teamwork'), value: data.teamwork, fill: 'hsl(var(--success))' },
        ...(data.workload !== undefined
          ? [{ category: t('category.workload'), value: data.workload, fill: 'hsl(var(--warning))' }]
          : []),
      ];

  const getBarColor = (value: number) => {
    if (value >= 2.5) return 'hsl(var(--success))';
    if (value >= 1.8) return 'hsl(var(--warning))';
    return 'hsl(var(--danger))';
  };

  return (
    <div className="chart-container animate-fade-in-up">
      {title && (
        <h3 className="text-lg font-semibold text-foreground mb-4">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={horizontal ? 200 : 300}>
        <BarChart
          data={chartData}
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 10, right: 30, left: 40, bottom: 10 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            opacity={0.5}
          />
          {horizontal ? (
            <>
              <XAxis
                type="number"
                domain={[0, 3]}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="category"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={100}
                orientation={direction === 'rtl' ? 'right' : 'left'}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey="category"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 3]}
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                orientation={direction === 'rtl' ? 'right' : 'left'}
              />
            </>
          )}
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
              return [Number.isFinite(n) ? n.toFixed(2) : '—', t('label.score')];
            }}
          />
          <Bar
            dataKey="value"
            radius={[4, 4, 4, 4]}
            barSize={horizontal ? 24 : 40}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.value)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CategoryBarChart;
