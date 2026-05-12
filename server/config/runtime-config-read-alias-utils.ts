import { readOptionalString } from "./runtime-config-read-utils";

export function readOptionalStringFrom(names: readonly string[]): string | null {
  for (const name of names) {
    const value = readOptionalString(name);
    if (value) {
      return value;
    }
  }

  return null;
}

export function readStringFrom(names: readonly string[], fallback: string): string {
  return readOptionalStringFrom(names) ?? fallback;
}

export function readIntFrom(
  names: readonly string[],
  fallback: number,
  options?: { min?: number; max?: number },
): number {
  const raw = readOptionalStringFrom(names);
  const parsed = raw == null ? fallback : Number(raw);
  const normalized = Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
  const min = options?.min ?? Number.NEGATIVE_INFINITY;
  const max = options?.max ?? Number.POSITIVE_INFINITY;
  return Math.max(min, Math.min(max, normalized));
}
