export function normalizeCredentialUsername(raw: unknown): string {
  return String(raw ?? "").normalize("NFKC").trim().toLowerCase();
}
