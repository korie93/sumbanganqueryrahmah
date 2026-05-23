const SENSITIVE_DETAIL_KEY_PATTERN =
  /(?:password|passwd|pwd|secret|token|cookie|authorization|api[_-]?key|private[_-]?key|connection[_-]?string|database[_-]?url|pg[_-]?password|smtp[_-]?password|backup[_-]?encryption[_-]?key|stack|trace|filepath|file[_-]?path)/i;

const SENSITIVE_DETAIL_VALUE_PATTERN =
  /(?:postgres(?:ql)?:\/\/|PGPASSWORD=|PG_PASSWORD=|SESSION_SECRET=|BACKUP_ENCRYPTION_KEY=|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----)/i;

const MAX_ERROR_DETAIL_DEPTH = 4;
const MAX_ERROR_DETAIL_ARRAY_LENGTH = 20;
const MAX_ERROR_DETAIL_OBJECT_KEYS = 40;
const MAX_ERROR_DETAIL_STRING_LENGTH = 500;
const REDACTED_ERROR_DETAIL = "[redacted]";

function sanitizeErrorDetailString(value: string): string {
  if (SENSITIVE_DETAIL_VALUE_PATTERN.test(value)) {
    return REDACTED_ERROR_DETAIL;
  }

  return value.length > MAX_ERROR_DETAIL_STRING_LENGTH
    ? `${value.slice(0, MAX_ERROR_DETAIL_STRING_LENGTH)}...`
    : value;
}

function sanitizeErrorDetailValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeErrorDetailString(value);
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (depth >= MAX_ERROR_DETAIL_DEPTH) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ERROR_DETAIL_ARRAY_LENGTH)
      .map((item) => sanitizeErrorDetailValue(item, depth + 1));
  }

  if (typeof value !== "object") {
    return String(value);
  }

  const output: Record<string, unknown> = {};
  let copied = 0;
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (copied >= MAX_ERROR_DETAIL_OBJECT_KEYS) {
      output.truncated = true;
      break;
    }

    const normalizedKey = String(key);
    output[normalizedKey] = SENSITIVE_DETAIL_KEY_PATTERN.test(normalizedKey)
      ? REDACTED_ERROR_DETAIL
      : sanitizeErrorDetailValue(nestedValue, depth + 1);
    copied += 1;
  }

  return output;
}

export function sanitizeHttpErrorDetails(details: unknown): unknown {
  return sanitizeErrorDetailValue(details, 0);
}
