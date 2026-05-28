import { inspect } from "node:util";

type FatalErrorLike = Error & {
  code?: unknown;
};

const MAX_FATAL_DETAIL_DEPTH = 4;

function isSensitiveFieldName(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    normalized === "authorization"
    || normalized === "cookie"
    || normalized === "key"
    || normalized === "pwd"
    || normalized.includes("apikey")
    || normalized.includes("accesstoken")
    || normalized.includes("authtoken")
    || normalized.includes("connectionstring")
    || normalized.includes("connectionurl")
    || normalized.includes("databaseurl")
    || normalized.includes("password")
    || normalized.includes("refreshtoken")
    || normalized.includes("secret")
    || normalized.includes("sessioncookie")
    || normalized.includes("sessiontoken")
  );
}

export function sanitizeFatalString(value: string): string {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^:@/\s]+):([^@/\s]+)@/gi, "$1[REDACTED]:[REDACTED]@")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(
      /\b(password|passwd|pwd|token|secret|api[_-]?key|authorization|cookie|session|database[_-]?url|connection[_-]?string)(\s*[:=]\s*)(["']?)[^"',\s;]+/gi,
      "$1$2$3[REDACTED]",
    );
}

function sanitizeFatalValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (typeof value === "string") {
    return sanitizeFatalString(value);
  }
  if (
    value === null
    || value === undefined
    || typeof value === "boolean"
    || typeof value === "number"
    || typeof value === "bigint"
  ) {
    return value;
  }
  if (typeof value === "symbol") {
    return value.toString();
  }
  if (typeof value === "function") {
    return `[Function: ${value.name || "anonymous"}]`;
  }
  if (value instanceof Error) {
    const errorLike = value as FatalErrorLike;
    return {
      name: value.name || "Error",
      message: sanitizeFatalString(value.message),
      ...(typeof errorLike.code === "string" ? { code: sanitizeFatalString(errorLike.code) } : {}),
    };
  }
  if (typeof value !== "object") {
    return String(value);
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  if (depth >= MAX_FATAL_DETAIL_DEPTH) {
    return "[Truncated]";
  }

  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeFatalValue(item, seen, depth + 1));
  }

  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isSensitiveFieldName(key)
      ? "[REDACTED]"
      : sanitizeFatalValue(raw, seen, depth + 1);
  }
  return output;
}

export function formatProcessFatalDetails(value: unknown) {
  if (value instanceof Error) {
    const errorLike = value as FatalErrorLike;
    const details = sanitizeFatalString(value.stack ?? value.message);
    const metadataError: Record<string, unknown> = {
      name: value.name || "Error",
      message: sanitizeFatalString(value.message),
    };
    if (typeof errorLike.code === "string") {
      metadataError.code = sanitizeFatalString(errorLike.code);
    }
    return {
      details,
      metadata: { error: metadataError },
    };
  }

  const sanitizedReason = sanitizeFatalValue(value, new WeakSet<object>(), 0);
  return {
    details: inspect(sanitizedReason, {
      breakLength: Infinity,
      depth: MAX_FATAL_DETAIL_DEPTH,
    }),
    metadata: { reason: sanitizedReason },
  };
}
