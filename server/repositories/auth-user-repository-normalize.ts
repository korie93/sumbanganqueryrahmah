export function normalizeAuthUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeOptionalAuthFullName(value: unknown): string | null {
  return String(value || "").trim() || null;
}

export function normalizeOptionalAuthEmail(value: unknown): string | null {
  return String(value || "").trim().toLowerCase() || null;
}
