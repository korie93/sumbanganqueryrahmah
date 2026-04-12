import { formatOperationalDateTime } from "@/lib/date-format";
import { SETTINGS_FIRST_PAGE } from "@/pages/settings/settings-request-utils";

export const ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE = SETTINGS_FIRST_PAGE;

export function formatDateTime(value: string | null) {
  if (!value) return "-";
  return formatOperationalDateTime(value, { fallback: value });
}

export function getStatusVariant(status: string, isBanned: boolean | null) {
  if (isBanned) return "destructive" as const;
  if (status === "active") return "default" as const;
  return "secondary" as const;
}

export function normalizeSearchValue(value: string) {
  return String(value || "").trim().toLowerCase();
}

export function hasNormalizedSearchChanged(localValue: string, queryValue: string) {
  return normalizeSearchValue(localValue) !== normalizeSearchValue(queryValue);
}

export function shouldSyncNormalizedSearch(normalizedValue: string, queryValue: string) {
  return normalizedValue !== normalizeSearchValue(queryValue);
}
