import React from 'react';
import { useCountUp } from '@/hooks/useCountUp';

interface CircleGaugeProps {
  value: number;
  maxValue: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  showPercentage?: boolean;
  color?: 'primary' | 'success' | 'warning' | 'danger';
}

const CircleGauge: React.FC<CircleGaugeProps> = ({
  value,
  maxValue,
  size = 120,
  strokeWidth = 10,
  label,
  showPercentage = false,
  color = 'primary',
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percentage = Math.min((value / maxValue) * 100, 100);
  const offset = circumference - (percentage / 100) * circumference;

  const animatedValue = useCountUp(Number.isFinite(value) ? value : 0, { durationMs: 650, fromZeroOnMount: true });
  const animatedPercentage = useCountUp(Number.isFinite(percentage) ? percentage : 0, { durationMs: 650, fromZeroOnMount: true });

  const colorClasses = {
    primary: 'stroke-primary',
    success: 'stroke-success',
    warning: 'stroke-warning',
    danger: 'stroke-danger',
  };

  const getScoreColor = () => {
    if (showPercentage) return colorClasses[color];
    // For 1-3 scale
    if (value >= 2.5) return 'stroke-success';
    if (value >= 1.8) return 'stroke-warning';
    return 'stroke-danger';
  };

  return (
    <div className="gauge-container" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-gauge-track"
        />
        {/* Filled arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${getScoreColor()} transition-all duration-1000 ease-out`}
          style={{
            animation: 'gauge-fill 1s ease-out forwards',
            ['--gauge-offset' as string]: offset,
          }}
        />
      </svg>
      <div className="gauge-value flex flex-col items-center">
        <span className="text-2xl font-bold text-foreground">
          {showPercentage
            ? `${Math.round(animatedPercentage)}%`
            : (typeof animatedValue === 'number' && Number.isFinite(animatedValue) ? animatedValue.toFixed(1) : '—')}
        </span>
        {label && (
          <span className="text-xs text-muted-foreground mt-1">{label}</span>
        )}
      </div>
    </div>
  );
};

export default CircleGauge;
