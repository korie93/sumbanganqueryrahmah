export function normalizeAuthIdentifier(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function hasAuthIdentifier(value: string | null | undefined): boolean {
  return normalizeAuthIdentifier(value).length > 0;
}

export function normalizeTwoFactorCode(value: string): string {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}
