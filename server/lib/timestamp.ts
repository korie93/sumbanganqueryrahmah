const ISO_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME_WITHOUT_TIMEZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/;

function normalizeTimestampInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (ISO_DATE_ONLY_PATTERN.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }

  if (ISO_DATE_TIME_WITHOUT_TIMEZONE_PATTERN.test(trimmed)) {
    return `${trimmed.replace(" ", "T")}Z`;
  }

  return trimmed;
}

export function parseTimestampValue(
  value: Date | string | number | null | undefined,
): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = typeof value === "string"
    ? new Date(normalizeTimestampInput(value))
    : new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolveTimestampMs(
  value: Date | string | number | null | undefined,
): number {
  return parseTimestampValue(value)?.getTime() ?? Number.NaN;
}

export function serializeTimestamp(
  value: Date | string | number | null | undefined,
): string | null {
  return parseTimestampValue(value)?.toISOString() ?? null;
}
