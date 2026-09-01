import type {
  CollectionSourceConfig,
  CollectionSourceConfigInput,
  CollectionSourceConfigStatus,
} from "@/lib/api/collection-source-configs";
import { getApiErrorMessage } from "@/lib/api-errors";
import { sanitizeUntrustedErrorMessage } from "@/lib/safe-error-message";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const savedSourceStatusPresentation: Record<
  CollectionSourceConfigStatus,
  { label: string; toneClassName: string }
> = {
  active: {
    label: "Active",
    toneClassName: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  },
  upcoming: {
    label: "Upcoming",
    toneClassName: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  },
  expired: {
    label: "Expired",
    toneClassName: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  },
  disabled: {
    label: "Disabled",
    toneClassName: "border-border bg-muted/45 text-foreground",
  },
  incompatible: {
    label: "Needs review",
    toneClassName: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
  },
};

export function isValidSavedSourceDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function validateSavedSourceConfigInput(input: CollectionSourceConfigInput): string | null {
  if (!isValidSavedSourceDate(input.validFrom) || !isValidSavedSourceDate(input.validTo)) {
    return "Enter valid start and end dates.";
  }
  if (input.validFrom > input.validTo) {
    return "Valid to cannot be earlier than valid from.";
  }
  return null;
}

export function getSavedSourceCompatibilityMessage(config: CollectionSourceConfig | null): string {
  if (!config) {
    return "Set an active period to validate and index this source.";
  }
  return config.compatibilityStatus === "compatible"
    ? "Required Collection fields were indexed successfully."
    : "This file needs required Collection fields before it can be enabled.";
}

export function getSavedSourceErrorMessage(error: unknown, fallback: string): string {
  return sanitizeUntrustedErrorMessage(getApiErrorMessage(error, fallback), fallback, {
    maxLength: 240,
  });
}

export function isSavedSourceAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
