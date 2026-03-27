export type LikePatternMode = "contains" | "startsWith" | "endsWith";

export function escapeLikePattern(value: string): string {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

export function buildLikePattern(value: string, mode: LikePatternMode): string {
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
