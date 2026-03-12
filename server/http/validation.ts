export function ensureObject(value: unknown): Record<string, any> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  return null;
}

export function readNonEmptyString(value: unknown): string {
  return String(value ?? "").trim();
}

export function readOptionalString(value: unknown): string | undefined {
  const normalized = readNonEmptyString(value);
  return normalized || undefined;
}

export function readInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

export function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function readBooleanFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = readNonEmptyString(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => readNonEmptyString(item))
      .filter(Boolean);
  }

  const normalized = readNonEmptyString(value);
  if (!normalized) return [];

  return normalized
    .split(",")
    .map((part) => readNonEmptyString(part))
    .filter(Boolean);
}
