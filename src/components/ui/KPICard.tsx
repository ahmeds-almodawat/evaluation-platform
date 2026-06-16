import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';
import CircleGauge from './CircleGauge';
import CountUpNumber from './CountUpNumber';
import Sparkline from './Sparkline';

interface KPICardProps {
  title: string;
  value: number | string | null;
  maxValue?: number;
  trend?: number;
  trendLabel?: string;
  variant?: 'blue' | 'green' | 'yellow' | 'red';
  showGauge?: boolean;
  showPercentage?: boolean;
  subtitle?: string;
  icon?: React.ReactNode | LucideIcon;
  /** Optional mini trend line shown at the bottom of the card */
  sparklineData?: number[];
  linkTo?: string;
  onClick?: () => void;
}

const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  maxValue = 3,
  trend,
  trendLabel,
  variant = 'blue',
  showGauge = true,
  showPercentage = false,
  subtitle,
  icon,
  sparklineData,
  linkTo,
  onClick,
}) => {
  const navigate = useNavigate();
  
  const variantClasses = {
    blue: 'kpi-card-blue',
    green: 'kpi-card-green',
    yellow: 'kpi-card-yellow',
    red: 'kpi-card-red',
  };

  const getTrendIcon = () => {
    if (trend === undefined || trend === 0) {
      return <Minus className="w-4 h-4" />;
    }
    return trend > 0 ? (
      <TrendingUp className="w-4 h-4" />
    ) : (
      <TrendingDown className="w-4 h-4" />
    );
  };

  const getTrendClass = () => {
    if (trend === undefined || trend === 0) return 'text-muted-foreground';
    return trend > 0 ? 'trend-up' : 'trend-down';
  };

  const gaugeColor = () => {
    if (variant === 'green') return 'success';
    if (variant === 'yellow') return 'warning';
    if (variant === 'red') return 'danger';
    return 'primary';
  };

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (linkTo) {
      navigate(linkTo);
    }
  };

  const isClickable = !!linkTo || !!onClick;
  const numericValue = typeof value === 'number' ? value : Number(value);
  const hasNumericValue = value !== null && Number.isFinite(numericValue);
  const renderedIcon = icon
    ? React.isValidElement(icon)
      ? icon
      : React.createElement(icon as LucideIcon, { className: 'w-4 h-4 text-muted-foreground' })
    : null;

  return (
    <div 
      className={`kpi-card ${variantClasses[variant]} animate-fade-in-up ${isClickable ? 'cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200' : ''}`}
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && handleClick() : undefined}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
          {subtitle && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">{subtitle}</p>
          )}
        </div>
        {renderedIcon && (
          <div className="rounded-full bg-background/70 p-2 shadow-sm">{renderedIcon}</div>
        )}
        {trend !== undefined && (
          <div className={`${getTrendClass()} flex items-center gap-1 text-sm font-medium`}>
            {getTrendIcon()}
            <span>{Math.abs(trend).toFixed(1)}%</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center py-4">
        {showGauge && hasNumericValue ? (
          <CircleGauge
            value={numericValue}
            label={value === null ? '—' : undefined}
            maxValue={maxValue}
            showPercentage={showPercentage}
            color={gaugeColor()}
          />
        ) : (
          <div className="text-center">
            {(() => {
              const n = hasNumericValue ? numericValue : null;
              if (n === null) {
                return <span className="text-xl font-bold text-foreground leading-snug">{value ?? '—'}</span>;
              }
              if (showPercentage) {
                return <CountUpNumber className="text-4xl font-bold text-foreground" value={n} decimals={0} suffix="%" />;
              }
              return <CountUpNumber className="text-4xl font-bold text-foreground" value={n} decimals={1} />;
            })()}
            {!showPercentage && hasNumericValue && (
              <span className="text-lg text-muted-foreground ml-1">/ {maxValue}</span>
            )}
          </div>
        )}
      </div>

      {trendLabel && (
        <p className="text-xs text-center text-muted-foreground mt-2">
          {trendLabel}
        </p>
      )}

      {sparklineData && sparklineData.length >= 2 ? (
        <div className="mt-3 flex justify-center text-muted-foreground/80">
          <Sparkline data={sparklineData} className="h-9 w-[120px]" />
        </div>
      ) : null}
    </div>
  );
};

export default KPICard;
