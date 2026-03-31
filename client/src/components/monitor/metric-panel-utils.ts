import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

export type MetricTrend = "up" | "down" | "neutral";
export type MetricStatus = "good" | "warning" | "critical";

export const metricStatusClasses: Record<MetricStatus, string> = {
  good: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};

export const metricTrendConfig: Record<
  MetricTrend,
  { icon: typeof ArrowRight; className: string; label: string }
> = {
  up: {
    icon: ArrowUpRight,
    className: "text-emerald-500",
    label: "Rising",
  },
  down: {
    icon: ArrowDownRight,
    className: "text-red-500",
    label: "Falling",
  },
  neutral: {
    icon: ArrowRight,
    className: "text-muted-foreground",
    label: "Flat",
  },
};

export function buildSparklinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `M 0 ${height / 2} L ${width} ${height / 2}`;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / Math.max(values.length - 1, 1);

  return values
    .map((value, index) => {
      const x = index * stepX;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function formatMetricValue(value: number, decimals: number): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : "0";
}
