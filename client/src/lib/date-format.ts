const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateTimeWithSecondsFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function parseDateValue(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
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
