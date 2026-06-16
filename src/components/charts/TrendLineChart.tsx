import React from 'react';
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
import { useLanguage } from '@/contexts/LanguageContext';

interface TrendLineChartProps {
  data: Array<{
    month: string;
    sameDept?: number | null;
    crossDept?: number | null;
    performance?: number | null;
    teamwork?: number | null;
    workload?: number | null;
    [key: string]: string | number | null | undefined;
  }>;
  title?: string;
  showLegend?: boolean;
}

const TrendLineChart: React.FC<TrendLineChartProps> = ({
  data,
  title,
  showLegend = true,
}) => {
  const { t, direction } = useLanguage();
  const hasSameCross = data.some((d) => d.sameDept !== undefined || d.crossDept !== undefined);

  return (
    <div className="chart-container animate-fade-in-up">
      {title && (
        <h3 className="text-lg font-semibold text-foreground mb-4">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={data}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            opacity={0.5}
          />
          <XAxis
            dataKey="month"
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            reversed={direction === 'rtl'}
          />
          <YAxis
            domain={[1, 3]}
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
          />
          {showLegend && (
            <Legend
              wrapperStyle={{
                paddingTop: '20px',
              }}
            />
          )}
          {hasSameCross ? (
            <>
              <Line
                type="monotone"
                dataKey="sameDept"
                name={t('kpi.sameDept')}
                stroke="hsl(var(--primary))"
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="crossDept"
                name={t('kpi.crossDept')}
                stroke="hsl(var(--success))"
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--success))', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, strokeWidth: 2 }}
              />
            </>
          ) : (
            <>
              <Line type="monotone" dataKey="performance" name={t('category.performance')} stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="teamwork" name={t('category.teamwork')} stroke="hsl(var(--success))" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="workload" name={t('category.workload')} stroke="hsl(var(--warning))" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TrendLineChart;
