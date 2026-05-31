import type { InternalMetricsRecorder } from "../internal/metrics";
import { safeJsonParse } from "../lib/safe-json";

export type AiSearchJsonRecord = Record<string, unknown>;

export type AiSearchRowLike = {
  rowId?: string;
  jsonDataJsonb?: unknown;
  [key: string]: unknown;
};

export function toObjectJson(
  value: unknown,
  options: { metrics?: InternalMetricsRecorder } = {},
): AiSearchJsonRecord | null {
  if (!value) return null;
  if (typeof value === "object") return value as AiSearchJsonRecord;
  if (typeof value === "string") {
    const parsed = safeJsonParse<unknown>(
      value,
      "ai_search_query_json",
      options.metrics ? { metrics: options.metrics } : {},
    );
    return parsed.success && parsed.data && typeof parsed.data === "object"
      ? (parsed.data as AiSearchJsonRecord)
      : null;
  }
  return null;
}
