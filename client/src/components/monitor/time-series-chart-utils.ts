export type TimeSeriesPoint = {
  ts: number;
  value: number;
};

export type TimeSeriesChartAccessibilityRow = {
  timestampLabel: string;
  valueLabel: string;
};

export type TimeSeriesChartAccessibilityContent = {
  rows: TimeSeriesChartAccessibilityRow[];
  summary: string;
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

const timeSeriesAccessibilityNumberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

function formatTimeSeriesAccessibilityValue(value: number, unit: string) {
  return `${timeSeriesAccessibilityNumberFormatter.format(Number(value) || 0)} ${unit}`.trim();
}

export function formatTimeSeriesAccessibilityLabel(value: number | string) {
  return new Date(Number(value)).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function buildTimeSeriesChartAccessibilityContent(
  data: TimeSeriesPoint[],
  title: string,
  unit = "",
): TimeSeriesChartAccessibilityContent {
  const chartData = buildTimeSeriesChartData(data);

  if (chartData.length === 0) {
    return {
      rows: [],
      summary: `${title} chart. No data available.`,
    };
  }

  const firstPoint = chartData[0];
  const lastPoint = chartData[chartData.length - 1];
  const values = chartData.map((point) => point.v);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const latestValue = lastPoint.v;

  return {
    rows: chartData.map((point) => ({
      timestampLabel: formatTimeSeriesAccessibilityLabel(point.t),
      valueLabel: formatTimeSeriesAccessibilityValue(point.v, unit),
    })),
    summary: `${title} chart with ${chartData.length} data points from ${formatTimeSeriesAccessibilityLabel(firstPoint.t)} to ${formatTimeSeriesAccessibilityLabel(lastPoint.t)}. Latest ${formatTimeSeriesAccessibilityValue(latestValue, unit)}. Minimum ${formatTimeSeriesAccessibilityValue(minValue, unit)}. Maximum ${formatTimeSeriesAccessibilityValue(maxValue, unit)}.`,
  };
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
