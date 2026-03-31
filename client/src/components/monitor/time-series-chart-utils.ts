export type TimeSeriesPoint = {
  ts: number;
  value: number;
};

export const timeSeriesTooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "10px",
  color: "hsl(var(--foreground))",
};

export function buildTimeSeriesChartData(data: TimeSeriesPoint[]) {
  return data.map((point) => ({
    t: point.ts,
    v: Number.isFinite(point.value) ? point.value : 0,
  }));
}

export function formatTimeSeriesTickLabel(value: number | string) {
  return new Date(Number(value)).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTimeSeriesTooltipLabel(value: number | string) {
  return new Date(Number(value)).toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatTimeSeriesTooltipValue(value: number, unit: string, title: string) {
  return [`${Number(value).toFixed(2)} ${unit}`.trim(), title] as const;
}
