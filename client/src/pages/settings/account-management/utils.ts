import { formatOperationalDateTime } from "@/lib/date-format";

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
