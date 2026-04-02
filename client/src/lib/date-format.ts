const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";

function createDateFormatter(
  options: Intl.DateTimeFormatOptions,
  timeZone?: string,
) {
  return new Intl.DateTimeFormat("en-GB", timeZone ? { ...options, timeZone } : options);
}

const dateFormatter = createDateFormatter({
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = createDateFormatter({
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateTimeWithSecondsFormatter = createDateFormatter({
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const malaysiaDateFormatter = createDateFormatter(
  {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  },
  MALAYSIA_TIME_ZONE,
);

const malaysiaDateTimeFormatter = createDateFormatter(
  {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  },
  MALAYSIA_TIME_ZONE,
);

const malaysiaDateTimeWithSecondsFormatter = createDateFormatter(
  {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  },
  MALAYSIA_TIME_ZONE,
);

const malaysiaDateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MALAYSIA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const ISO_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME_WITHOUT_TIMEZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;

function normalizeDateInputString(value: string) {
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

export function parseDateValue(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = typeof value === "string"
    ? new Date(normalizeDateInputString(value))
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateDDMMYYYY(value: string | number | Date | null | undefined, fallback = "-") {
  const parsed = parseDateValue(value);
  if (!parsed) return fallback;
  return dateFormatter.format(parsed);
}

export function formatDateTimeDDMMYYYY(
  value: string | number | Date | null | undefined,
  options?: { includeSeconds?: boolean; fallback?: string },
) {
  const parsed = parseDateValue(value);
  if (!parsed) return options?.fallback ?? "-";
  return options?.includeSeconds
    ? dateTimeWithSecondsFormatter.format(parsed)
    : dateTimeFormatter.format(parsed);
}

export function formatIsoDateToDDMMYYYY(value: string | null | undefined, fallback = "-") {
  const raw = String(value || "").trim();
  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) {
    return fallback;
  }
  return `${matched[3]}/${matched[2]}/${matched[1]}`;
}

export function formatDateDDMMYYYYMalaysia(value: string | number | Date | null | undefined, fallback = "-") {
  const parsed = parseDateValue(value);
  if (!parsed) return fallback;
  return malaysiaDateFormatter.format(parsed);
}

export function formatDateTimeMalaysia(
  value: string | number | Date | null | undefined,
  options?: { includeSeconds?: boolean; fallback?: string },
) {
  const parsed = parseDateValue(value);
  if (!parsed) return options?.fallback ?? "-";
  const formatter = options?.includeSeconds
    ? malaysiaDateTimeWithSecondsFormatter
    : malaysiaDateTimeFormatter;
  return formatter.format(parsed).replace(/\bam\b/gi, "AM").replace(/\bpm\b/gi, "PM");
}

export function formatOperationalDateTime(
  value: string | number | Date | null | undefined,
  options?: { fallback?: string },
) {
  return formatDateTimeMalaysia(value, { fallback: options?.fallback });
}

export function formatIsoDateRangeDDMMYYYY(
  from: string | null | undefined,
  to: string | null | undefined,
  fallback = "?",
) {
  return `${formatIsoDateToDDMMYYYY(from, fallback)} - ${formatIsoDateToDDMMYYYY(to, fallback)}`;
}

export function formatDateKeyInMalaysia(value: string | number | Date | null | undefined, fallback = "") {
  const parsed = parseDateValue(value);
  if (!parsed) return fallback;
  return malaysiaDateKeyFormatter.format(parsed);
}
