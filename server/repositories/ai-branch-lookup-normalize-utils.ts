export function clampAiBranchLookupLimit(limit: number | undefined, fallback = 5): number {
  return Math.max(1, Math.min(5, limit ?? fallback));
}

export function normalizeAiBranchLookupQuery(query: string | null | undefined): string {
  return String(query || "").trim();
}

export function normalizeAiBranchLookupPostcode(postcode: string | null | undefined): string {
  const rawDigits = String(postcode || "").replace(/\D/g, "");
  return rawDigits.length === 4 ? `0${rawDigits}` : rawDigits.slice(0, 5);
}

export function extractAiBranchSeedPostcode(address: string | null | undefined): string | null {
  const raw = String(address || "");
  const match5 = raw.match(/\b\d{5}\b/);
  const match4 = raw.match(/\b\d{4}\b/);
  return match5 ? match5[0] : match4 ? `0${match4[0]}` : null;
}
