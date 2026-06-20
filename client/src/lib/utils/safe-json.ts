import { logClientWarning, type ClientLoggerEnvironment } from "@/lib/client-logger";

export type JsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export const CLIENT_JSON_PARSE_LIMITS = {
  maxDepth: 40,
  maxNodes: 10_000,
  maxRawLength: 200_000,
  maxStringLength: 100_000,
} as const;

export type SafeJsonParseOptions = {
  maxDepth?: number | undefined;
  maxNodes?: number | undefined;
  maxRawLength?: number | undefined;
  maxStringLength?: number | undefined;
};

type ClientJsonParseLimits = {
  maxDepth: number;
  maxNodes: number;
  maxRawLength: number;
  maxStringLength: number;
};

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? Math.floor(value)
    : fallback;
}

function resolveClientJsonParseLimits(options: SafeJsonParseOptions = {}): ClientJsonParseLimits {
  return {
    maxDepth: normalizePositiveInteger(options.maxDepth, CLIENT_JSON_PARSE_LIMITS.maxDepth),
    maxNodes: normalizePositiveInteger(options.maxNodes, CLIENT_JSON_PARSE_LIMITS.maxNodes),
    maxRawLength: normalizePositiveInteger(options.maxRawLength, CLIENT_JSON_PARSE_LIMITS.maxRawLength),
    maxStringLength: normalizePositiveInteger(
      options.maxStringLength,
      CLIENT_JSON_PARSE_LIMITS.maxStringLength,
    ),
  };
}

function validateClientJsonValueLimits(
  value: unknown,
  limits: ClientJsonParseLimits,
): string | null {
  const stack: Array<{ depth: number; value: unknown }> = [{ depth: 0, value }];
  let visitedNodes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    visitedNodes += 1;
    if (visitedNodes > limits.maxNodes) {
      return `JSON node count exceeds limit ${limits.maxNodes}`;
    }

    if (current.depth > limits.maxDepth) {
      return `JSON depth exceeds limit ${limits.maxDepth}`;
    }

    if (typeof current.value === "string") {
      if (current.value.length > limits.maxStringLength) {
        return `JSON string length exceeds limit ${limits.maxStringLength}`;
      }
      continue;
    }

    if (typeof current.value !== "object" || current.value === null) {
      continue;
    }

    if (Array.isArray(current.value)) {
      for (const item of current.value) {
        stack.push({ depth: current.depth + 1, value: item });
      }
      continue;
    }

    for (const nestedValue of Object.values(current.value as Record<string, unknown>)) {
      stack.push({ depth: current.depth + 1, value: nestedValue });
    }
  }

  return null;
}

function parseJsonWithLimits<T>(
  raw: string,
  options?: SafeJsonParseOptions,
): JsonResult<T> {
  const limits = resolveClientJsonParseLimits(options);
  if (raw.length > limits.maxRawLength) {
    return {
      ok: false,
      error: `JSON string size exceeds limit ${limits.maxRawLength}`,
    };
  }

  try {
    const data = JSON.parse(raw) as T;
    const limitError = validateClientJsonValueLimits(data, limits);
    if (limitError) {
      return {
        ok: false,
        error: limitError,
      };
    }

    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Parse failed",
    };
  }
}

export function safeJsonParse<T>(
  raw: string | null | undefined,
  fallback: T,
  debugContext?: string,
  env: ClientLoggerEnvironment = import.meta.env,
  options?: SafeJsonParseOptions,
): T {
  if (raw === null || raw === undefined || raw === "") {
    return fallback;
  }

  const parsed = parseJsonWithLimits<T>(raw, options);
  if (!parsed.ok) {
    logClientWarning(
      "[safeJsonParse] Failed to parse JSON",
      undefined,
      debugContext ? { context: debugContext } : undefined,
      env,
    );
    return fallback;
  }

  return parsed.data;
}

export function safeJsonParseResult<T>(
  raw: string | null | undefined,
  options?: SafeJsonParseOptions,
): JsonResult<T> {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: false, error: "Empty input" };
  }

  return parseJsonWithLimits<T>(raw, options);
}
