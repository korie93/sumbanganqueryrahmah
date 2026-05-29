import { internalMetrics, type InternalMetricsRecorder } from "../internal/metrics";
import { logger } from "./logger";

export type JsonParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type SafeJsonParseOptions = {
  metrics?: InternalMetricsRecorder;
};

function recordJsonParseFailure(
  context: string,
  errorType: string,
  metrics: InternalMetricsRecorder,
): void {
  logger.warn("JSON parse failed", {
    event: "json_parse_failure",
    context,
    errorType,
  });
  metrics.increment("jsonParseFailuresTotal");
}

export function safeJsonParse<T>(
  raw: unknown,
  context: string,
  options: SafeJsonParseOptions = {},
): JsonParseResult<T> {
  const metrics = options.metrics ?? internalMetrics;

  if (typeof raw !== "string") {
    recordJsonParseFailure(context, "InvalidInput", metrics);
    return {
      success: false,
      error: "Expected JSON string",
    };
  }

  try {
    return {
      success: true,
      data: JSON.parse(raw) as T,
    };
  } catch (error) {
    recordJsonParseFailure(
      context,
      error instanceof Error ? error.name : "UnknownError",
      metrics,
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Parse failed",
    };
  }
}
