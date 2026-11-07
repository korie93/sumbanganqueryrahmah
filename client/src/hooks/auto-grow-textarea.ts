export type AutoGrowTextareaOptions = {
  minRows?: number;
  maxRows?: number;
};

type TextareaMetrics = {
  scrollHeight: number;
  lineHeight: number;
  padding: number;
  border: number;
  boxSizing: "border-box" | "content-box";
  minHeight?: number;
  maxHeight?: number;
};

const nonNegative = (value: number | undefined, fallback = 0) => (
  value !== undefined && Number.isFinite(value) ? Math.max(0, value) : fallback
);
const rowCount = (value: number | undefined, fallback: number) => (
  Math.max(1, Math.floor(nonNegative(value, fallback)))
);

/** Convert the browser's padding-box measurement into a bounded CSS height. */
export function getAutoGrowTextareaSize(metrics: TextareaMetrics, options: AutoGrowTextareaOptions = {}) {
  const minRows = rowCount(options.minRows, 2);
  const maxRows = Math.max(minRows, rowCount(options.maxRows, 5));
  const lineHeight = metrics.lineHeight > 0 && Number.isFinite(metrics.lineHeight) ? metrics.lineHeight : 24;
  const padding = nonNegative(metrics.padding);
  const border = nonNegative(metrics.border);
  const decoration = padding + border;
  const cssDecoration = metrics.boxSizing === "content-box" ? decoration : 0;
  const cssMinimum = nonNegative(metrics.minHeight) + cssDecoration;
  const cssMaximum = nonNegative(metrics.maxHeight, Infinity) + cssDecoration;
  // CSS min-height wins over a conflicting max-height; a viewport cap can still
  // take precedence over our preferred minimum number of rows.
  const maximum = Math.max(cssMinimum, Math.min(maxRows * lineHeight + decoration, cssMaximum));
  const minimum = Math.min(maximum, Math.max(cssMinimum, minRows * lineHeight + decoration));
  const contentHeight = nonNegative(metrics.scrollHeight) + border;
  const borderBoxHeight = Math.max(minimum, Math.min(maximum, contentHeight));
  return {
    height: Math.max(0, Math.ceil(borderBoxHeight - cssDecoration)),
    overflowY: contentHeight > borderBoxHeight + 1 ? "auto" as const : "hidden" as const,
  };
}
