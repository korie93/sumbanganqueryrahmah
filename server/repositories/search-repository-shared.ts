import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { buildLikePattern } from "./sql-like-utils";
import type { SearchQueryRow } from "./search-repository-types";

export const MAX_SEARCH_LIMIT = 200;
// Bound deep OFFSET scans on JSON-heavy search queries while leaving cursor paging available for deeper traversal.
export const MAX_SEARCH_OFFSET = 50_000;
export const MAX_SEARCH_COLUMN_KEYS = 500;

export const SEARCH_ALLOWED_OPERATORS = new Set([
  "contains",
  "equals",
  "notEquals",
  "startsWith",
  "endsWith",
  "greaterThan",
  "lessThan",
  "greaterThanOrEqual",
  "lessThanOrEqual",
  "isEmpty",
  "isNotEmpty",
]);

export function getSearchTotalFromRows(rows: unknown[]): number {
  const firstRow = rows[0];
  if (!firstRow || typeof firstRow !== "object") {
    return 0;
  }

  return Number((firstRow as SearchQueryRow).total || 0);
}

function detectSearchValueType(value: string): "number" | "date" | "string" {
  if (!value) return "string";
  if (!Number.isNaN(Number(value))) return "number";

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return "date";

  return "string";
}

export function normalizeSearchJsonPayload(raw: unknown): unknown {
  let value = raw;

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return value;
    }
  }

  if (Array.isArray(value)) {
    const mapped: Record<string, unknown> = {};
    for (let index = 0; index < value.length; index += 1) {
      mapped[`col_${index + 1}`] = value[index];
    }
    return mapped;
  }

  return value;
}

export function buildSearchFieldCondition(field: string, operator: string, value: string): SQL {
  const column = sql`dr.json_data::jsonb ->> ${field}`;
  const valueType = detectSearchValueType(value);
  const containsPattern = buildLikePattern(value, "contains");
  const startsWithPattern = buildLikePattern(value, "startsWith");
  const endsWithPattern = buildLikePattern(value, "endsWith");

  switch (operator) {
    case "contains":
      return sql`${column} ILIKE ${containsPattern} ESCAPE '\'`;
    case "equals":
      return sql`${column} = ${value}`;
    case "notEquals":
      return sql`${column} <> ${value}`;
    case "startsWith":
      return sql`${column} ILIKE ${startsWithPattern} ESCAPE '\'`;
    case "endsWith":
      return sql`${column} ILIKE ${endsWithPattern} ESCAPE '\'`;
    case "greaterThan":
      if (valueType === "number") return sql`NULLIF(${column}, '')::numeric > ${Number(value)}`;
      if (valueType === "date") return sql`NULLIF(${column}, '')::date > ${value}`;
      return sql`false`;
    case "lessThan":
      if (valueType === "number") return sql`NULLIF(${column}, '')::numeric < ${Number(value)}`;
      if (valueType === "date") return sql`NULLIF(${column}, '')::date < ${value}`;
      return sql`false`;
    case "greaterThanOrEqual":
      if (valueType === "number") return sql`NULLIF(${column}, '')::numeric >= ${Number(value)}`;
      if (valueType === "date") return sql`NULLIF(${column}, '')::date >= ${value}`;
      return sql`false`;
    case "lessThanOrEqual":
      if (valueType === "number") return sql`NULLIF(${column}, '')::numeric <= ${Number(value)}`;
      if (valueType === "date") return sql`NULLIF(${column}, '')::date <= ${value}`;
      return sql`false`;
    case "isEmpty":
      return sql`COALESCE(${column}, '') = ''`;
    case "isNotEmpty":
      return sql`COALESCE(${column}, '') <> ''`;
    default:
      return sql`false`;
  }
}

export function buildJsonTextContainsCondition(search: string): SQL {
  const searchPattern = buildLikePattern(search.toLowerCase(), "contains");
  return sql`lower(dr.json_data::text) LIKE ${searchPattern} ESCAPE '\'`;
}

export function normalizeSearchOffset(offset: number): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }

  return Math.max(0, Math.floor(offset));
}

export function isSearchOffsetBeyondRuntimeWindow(offset: number): boolean {
  return normalizeSearchOffset(offset) > MAX_SEARCH_OFFSET;
}
