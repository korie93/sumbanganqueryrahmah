import { normalizeCredentialUsername } from "../auth/username-normalization";

export function normalizeAuthUsername(value: string): string {
  return normalizeCredentialUsername(value);
}

export function normalizeOptionalAuthFullName(value: unknown): string | null {
  return String(value || "").trim() || null;
}

export function normalizeOptionalAuthEmail(value: unknown): string | null {
  return String(value || "").trim().toLowerCase() || null;
}
