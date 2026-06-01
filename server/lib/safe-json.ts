import { internalMetrics, type InternalMetricsRecorder } from "../internal/metrics";
import { logger } from "./logger";

export type JsonParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export const JSON_PARSE_LIMITS = {
  maxDepth: 20,
  maxObjectKeys: 1_000,
  maxStringLength: 100_000,
  maxArrayLength: 10_000,
  maxRawBytes: 10 * 1024 * 1024,
  maxTotalBytes: 5 * 1024 * 1024,
} as const;

type SafeJsonParseOptions = {
  metrics?: InternalMetricsRecorder;
  maxArrayLength?: number | undefined;
  maxDepth?: number | undefined;
  maxObjectKeys?: number | undefined;
  maxRawBytes?: number | undefined;
  maxStringLength?: number | undefined;
  maxTotalBytes?: number | undefined;
};

type JsonParseLimits = {
  maxArrayLength: number;
  maxDepth: number;
  maxObjectKeys: number;
  maxRawBytes: number;
  maxStringLength: number;
  maxTotalBytes: number;
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
  if (errorType === "JsonMemoryLimitExceeded") {
    metrics.increment("jsonParseMemoryLimitExceededTotal");
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? Math.floor(value)
    : fallback;
}

function resolveJsonParseLimits(options: SafeJsonParseOptions): JsonParseLimits {
  return {
    maxArrayLength: normalizePositiveInteger(options.maxArrayLength, JSON_PARSE_LIMITS.maxArrayLength),
    maxDepth: normalizePositiveInteger(options.maxDepth, JSON_PARSE_LIMITS.maxDepth),
    maxObjectKeys: normalizePositiveInteger(options.maxObjectKeys, JSON_PARSE_LIMITS.maxObjectKeys),
    maxRawBytes: normalizePositiveInteger(options.maxRawBytes, JSON_PARSE_LIMITS.maxRawBytes),
    maxStringLength: normalizePositiveInteger(options.maxStringLength, JSON_PARSE_LIMITS.maxStringLength),
    maxTotalBytes: normalizePositiveInteger(options.maxTotalBytes, JSON_PARSE_LIMITS.maxTotalBytes),
  };
}

function validateJsonValueLimits(value: unknown, limits: JsonParseLimits): string | null {
  const stack: Array<{ depth: number; value: unknown }> = [{ depth: 0, value }];
  let totalBytes = 0;

  const addTotalBytes = (bytes: number): string | null => {
    totalBytes += bytes;
    return totalBytes > limits.maxTotalBytes
      ? `JSON cumulative byte size exceeds limit ${limits.maxTotalBytes}`
      : null;
  };

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (current.depth > limits.maxDepth) {
      return `JSON depth exceeds limit ${limits.maxDepth}`;
    }

    if (typeof current.value === "string") {
      if (current.value.length > limits.maxStringLength) {
        return `JSON string length exceeds limit ${limits.maxStringLength}`;
      }
      const totalByteError = addTotalBytes(Buffer.byteLength(current.value, "utf8"));
      if (totalByteError) {
        return totalByteError;
      }
      continue;
    }

    if (typeof current.value !== "object" || current.value === null) {
      continue;
    }

    if (Array.isArray(current.value)) {
      if (current.value.length > limits.maxArrayLength) {
        return `JSON array length exceeds limit ${limits.maxArrayLength}`;
      }

      for (const item of current.value) {
        stack.push({ depth: current.depth + 1, value: item });
      }
      continue;
    }

    const entries = Object.entries(current.value as Record<string, unknown>);
    if (entries.length > limits.maxObjectKeys) {
      return `JSON object key count exceeds limit ${limits.maxObjectKeys}`;
    }

    for (const [key, nestedValue] of entries) {
      const totalByteError = addTotalBytes(Buffer.byteLength(key, "utf8"));
      if (totalByteError) {
        return totalByteError;
      }
      stack.push({ depth: current.depth + 1, value: nestedValue });
    }
  }

  return null;
}

export function safeJsonParse<T>(
  raw: unknown,
  context: string,
  options: SafeJsonParseOptions = {},
): JsonParseResult<T> {
  const metrics = options.metrics ?? internalMetrics;
  const limits = resolveJsonParseLimits(options);

  if (typeof raw !== "string") {
    recordJsonParseFailure(context, "InvalidInput", metrics);
    return {
      success: false,
      error: "Expected JSON string",
    };
  }

  if (Buffer.byteLength(raw, "utf8") > limits.maxRawBytes) {
    recordJsonParseFailure(context, "JsonRawSizeLimitExceeded", metrics);
    return {
      success: false,
      error: `JSON string size exceeds limit ${limits.maxRawBytes}`,
    };
  }

  try {
    const data = JSON.parse(raw) as T;
    const limitError = validateJsonValueLimits(data, limits);
    if (limitError) {
      recordJsonParseFailure(
        context,
        limitError.includes("cumulative byte size")
          ? "JsonMemoryLimitExceeded"
          : "JsonLimitExceeded",
        metrics,
      );
      return {
        success: false,
        error: limitError,
      };
    }

    return {
      success: true,
      data,
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
