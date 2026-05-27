export type LikePatternMode = "contains" | "startsWith" | "endsWith";

export const MAX_LIKE_PATTERN_INPUT_LENGTH = 200;

export function normalizeLikePatternInput(value: unknown): string {
  const normalized = String(value ?? "").normalize("NFKC").trim();
  if (normalized.includes("\0")) {
    throw new Error("LIKE search terms must not contain null bytes.");
  }

  return Array.from(normalized).slice(0, MAX_LIKE_PATTERN_INPUT_LENGTH).join("");
}

export function escapeLikePattern(value: unknown): string {
  return normalizeLikePatternInput(value).replace(/[\\%_]/g, "\\$&");
}

export function buildLikePattern(value: unknown, mode: LikePatternMode): string {
  const escapedValue = escapeLikePattern(value);

  switch (mode) {
    case "startsWith":
      return `${escapedValue}%`;
    case "endsWith":
      return `%${escapedValue}`;
    case "contains":
    default:
      return `%${escapedValue}%`;
  }
}
