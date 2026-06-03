const SENSITIVE_DETAIL_KEY_PATTERN =
  /(?:password|passwd|pwd|secret|token|cookie|authorization|api[_-]?key|private[_-]?key|connection[_-]?string|database[_-]?url|pg[_-]?password|smtp[_-]?password|backup[_-]?encryption[_-]?key|stack|trace|filepath|file[_-]?path)/i;

const SENSITIVE_DETAIL_VALUE_PATTERN =
  /(?:postgres(?:ql)?:\/\/|PGPASSWORD=|PG_PASSWORD=|SESSION_SECRET=|BACKUP_ENCRYPTION_KEY=|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----)/i;

const MAX_ERROR_DETAIL_DEPTH = 4;
const MAX_ERROR_DETAIL_ARRAY_LENGTH = 20;
const MAX_ERROR_DETAIL_OBJECT_KEYS = 40;
const MAX_ERROR_DETAIL_STRING_LENGTH = 500;
const REDACTED_ERROR_DETAIL = "[redacted]";
const MAX_ERROR_DETAIL_DECODE_PASSES = 3;

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|colon|sol|bsol|period|commat|num|percnt);/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined) => {
      if (decimal) {
        const codePoint = Number.parseInt(decimal, 10);
        return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      if (hexadecimal) {
        const codePoint = Number.parseInt(hexadecimal, 16);
        return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity;
      }

      switch (String(entity).toLowerCase()) {
        case "&colon;":
          return ":";
        case "&sol;":
          return "/";
        case "&bsol;":
          return "\\";
        case "&period;":
          return ".";
        case "&commat;":
          return "@";
        case "&num;":
          return "#";
        case "&percnt;":
          return "%";
        default:
          return entity;
      }
    },
  );
}

function createInspectableStringVariants(value: string): string[] {
  const variants = new Set([value]);
  let current = value;

  for (let pass = 0; pass < MAX_ERROR_DETAIL_DECODE_PASSES; pass += 1) {
    const htmlDecoded = decodeHtmlEntities(current);
    if (htmlDecoded !== current) {
      variants.add(htmlDecoded);
      current = htmlDecoded;
      continue;
    }

    try {
      const urlDecoded = decodeURIComponent(current.replace(/\+/g, "%20"));
      if (urlDecoded === current) {
        break;
      }
      variants.add(urlDecoded);
      current = urlDecoded;
    } catch {
      break;
    }
  }

  return [...variants];
}

function sanitizeErrorDetailString(value: string): string {
  if (createInspectableStringVariants(value).some((variant) => SENSITIVE_DETAIL_VALUE_PATTERN.test(variant))) {
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
