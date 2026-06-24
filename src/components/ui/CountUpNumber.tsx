import React from "react";
import { useCountUp } from "@/hooks/useCountUp";

type Props = {
  value: number;
  /** Number of decimals to display (default 1). */
  decimals?: number;
  /** Optional suffix like "%". */
  suffix?: string;
  /** Duration in ms. */
  durationMs?: number;
  className?: string;
};

/**
 * Animated number for KPI cards (no external animation libs).
 */
const CountUpNumber: React.FC<Props> = ({
  value,
  decimals = 1,
  suffix = "",
  durationMs = 650,
  className,
}) => {
  const v = useCountUp(Number.isFinite(value) ? value : 0, { durationMs, fromZeroOnMount: true });

  const formatted = Number.isFinite(v) ? v.toFixed(decimals) : "—";
  return <span className={className}>{formatted}{suffix}</span>;
};

export default CountUpNumber;
