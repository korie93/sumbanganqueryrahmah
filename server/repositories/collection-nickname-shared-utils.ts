import type { CollectionRepositoryQueryResult } from "./collection-nickname-types";

function normalizeCollectionDate(value: unknown, fallback = Date.now()): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }
  return new Date(fallback);
}

function normalizeNullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function normalizeNullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Boolean(value);
}

function readRows<TRow>(result: CollectionRepositoryQueryResult): TRow[] {
  return Array.isArray(result.rows) ? (result.rows as TRow[]) : [];
}

export {
  normalizeCollectionDate,
  normalizeNullableBoolean,
  normalizeNullableText,
  readRows,
};

export function normalizeCollectionNicknameRoleScope(
  value: unknown,
): "admin" | "user" | "both" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "user" || normalized === "both") {
    return normalized;
  }
  return "both";
}
