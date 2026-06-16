import React from "react";

type SparklineProps = {
  /** A small series of numbers (e.g., last 6-12 months). */
  data: number[];
  className?: string;
};

/**
 * Tiny inline sparkline for KPI cards.
 * Pure SVG (no extra deps) and works in RTL/LTR.
 */
export default function Sparkline({ data, className }: SparklineProps) {
  const w = 120;
  const h = 36;
  const pad = 2;

  const values = (data ?? []).filter((n) => Number.isFinite(n));
  if (values.length < 2) return null;

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max === min) {
    max = min + 1;
  }

  const points = values
    .map((v, i) => {
      const x = pad + (i * (w - pad * 2)) / (values.length - 1);
      const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // Light fill under the line for a premium look
  const areaPoints = `${pad},${h - pad} ${points} ${w - pad},${h - pad}`;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={className ?? ""}
      aria-hidden="true"
    >
      <polyline
        points={areaPoints}
        fill="currentColor"
        opacity={0.10}
        stroke="none"
      />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.90}
      />
    </svg>
  );
}
