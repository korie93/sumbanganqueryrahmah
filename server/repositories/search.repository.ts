import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { DataRow } from "../../shared/schema-postgres";
import { db } from "../db-postgres";
import { buildLikePattern } from "./sql-like-utils";

export const MAX_SEARCH_LIMIT = 200;
// Bound deep OFFSET scans on JSON-heavy search queries while leaving cursor paging available for deeper traversal.
export const MAX_SEARCH_OFFSET = 50_000;
const MAX_COLUMN_KEYS = 500;
const ALLOWED_OPERATORS = new Set([
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

type QueryRow = Record<string, unknown>;

export type SearchGlobalDataRow = {
  id: string;
  rowId?: string | null;
  importId: string;
  importName: string | null;
  importFilename: string | null;
  jsonDataJsonb: unknown;
};

export type SearchDataRow = {
  id: string;
  importId: string;
  jsonDataJsonb: unknown;
};

type AdvancedSearchDataRow = DataRow & {
  importName?: string | null;
  importFilename?: string | null;
};

function getTotalFromRows(rows: unknown[]): number {
  const firstRow = rows[0];
  if (!firstRow || typeof firstRow !== "object") {
    return 0;
  }

  return Number((firstRow as QueryRow).total || 0);
}

function detectValueType(value: string): "number" | "date" | "string" {
  if (!value) return "string";
  if (!Number.isNaN(Number(value))) return "number";

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return "date";

  return "string";
}

function normalizeJsonPayload(raw: unknown): unknown {
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

function buildFieldCondition(field: string, operator: string, value: string): SQL {
  const column = sql`dr.json_data::jsonb ->> ${field}`;
  const valueType = detectValueType(value);
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

export class SearchRepository {
  async searchGlobalDataRows(params: {
    search: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: SearchGlobalDataRow[]; total: number }> {
    const { search, limit, offset } = params;
    const searchPattern = buildLikePattern(search, "contains");
    const safeOffset = normalizeSearchOffset(offset);

    if (isSearchOffsetBeyondRuntimeWindow(safeOffset)) {
      const totalResult = await db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM public.data_rows dr
        JOIN public.imports i ON i.id = dr.import_id
        WHERE i.is_deleted = false
          AND dr.json_data::text ILIKE ${searchPattern} ESCAPE '\'
      `);

      return {
        rows: [],
        total: getTotalFromRows(totalResult.rows || []),
      };
    }

    const rowsResult = await db.execute(sql`
      SELECT
        dr.id,
        dr.import_id,
        dr.json_data as json_data_jsonb,
        i.name as import_name,
        i.filename as import_filename
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND dr.json_data::text ILIKE ${searchPattern} ESCAPE '\'
      ORDER BY dr.id
      LIMIT ${Math.max(1, Math.min(limit, MAX_SEARCH_LIMIT))}
      OFFSET ${safeOffset}
    `);

    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND dr.json_data::text ILIKE ${searchPattern} ESCAPE '\'
    `);

    const rows = (rowsResult.rows || []).map((row) => {
      const record = row as QueryRow;
      return {
        id: String(record.id || ""),
        importId: String(record.import_id || ""),
        importName: typeof record.import_name === "string" ? record.import_name : null,
        importFilename: typeof record.import_filename === "string" ? record.import_filename : null,
        jsonDataJsonb: normalizeJsonPayload(record.json_data_jsonb),
      };
    });

    const total = getTotalFromRows(totalResult.rows || []);
    return { rows, total };
  }

  async searchSimpleDataRows(search: string) {
    const searchPattern = buildLikePattern(search, "contains");
    return db.execute(sql`
      SELECT
        dr.import_id as "importId",
        i.name as "importName",
        dr.json_data as "jsonDataJsonb"
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND dr.json_data::text ILIKE ${searchPattern} ESCAPE '\'
      LIMIT ${MAX_SEARCH_LIMIT}
    `);
  }

  async searchDataRows(params: {
    importId: string;
    search?: string | null;
    limit: number;
    offset: number;
    columnFilters?: Array<{ column: string; operator: string; value: string }>;
    cursor?: string | null;
  }): Promise<{ rows: SearchDataRow[]; total: number; nextCursorRowId: string | null }> {
    const { importId, search, limit, offset } = params;
    const trimmedSearch = search && search.trim() ? search.trim() : null;
    const safeLimit = Math.min(Math.max(1, limit), MAX_SEARCH_LIMIT);
    const safeOffset = normalizeSearchOffset(offset);
    const cursor = String(params.cursor || "").trim() || null;
    const safeColumnFilters = Array.isArray(params.columnFilters)
      ? params.columnFilters
          .map((filter) => ({
            column: String(filter?.column ?? "").trim(),
            operator: String(filter?.operator ?? "").trim(),
            value: String(filter?.value ?? "").trim(),
          }))
          .filter((filter) =>
            filter.column !== ""
            && filter.value !== ""
            && ALLOWED_OPERATORS.has(filter.operator),
          )
      : [];

    if (trimmedSearch && trimmedSearch.length < 2) {
      return { rows: [], total: 0, nextCursorRowId: null };
    }
    const conditions: SQL[] = [sql`dr.import_id = ${importId}`];

    if (trimmedSearch) {
      conditions.push(sql`dr.json_data::text ILIKE ${buildLikePattern(trimmedSearch, "contains")} ESCAPE '\'`);
    }

    for (const filter of safeColumnFilters) {
      conditions.push(buildFieldCondition(filter.column, filter.operator, filter.value));
    }

    if (cursor) {
      conditions.push(sql`dr.id > ${cursor}`);
    }

    const whereClause = conditions.length === 1
      ? conditions[0]
      : sql.join(conditions, sql` AND `);

    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM public.data_rows dr
      WHERE ${whereClause}
    `);

    if (!cursor && isSearchOffsetBeyondRuntimeWindow(safeOffset)) {
      return {
        rows: [],
        total: getTotalFromRows(totalResult.rows || []),
        nextCursorRowId: null,
      };
    }

    const rowsResult = await db.execute(sql`
      SELECT
        dr.id,
        dr.import_id as "importId",
        dr.json_data as "jsonDataJsonb"
      FROM public.data_rows dr
      WHERE ${whereClause}
      ORDER BY dr.id
      LIMIT ${safeLimit + 1}
      ${cursor ? sql`` : sql`OFFSET ${safeOffset}`}
    `);

    const rawRows = (rowsResult.rows || []).map((row) => {
      const record = row as QueryRow;
      return {
        id: String(record.id || ""),
        importId: String(record.importId || ""),
        jsonDataJsonb: normalizeJsonPayload(record.jsonDataJsonb),
      };
    });
    const hasMore = rawRows.length > safeLimit;
    const items = hasMore ? rawRows.slice(0, safeLimit) : rawRows;

    return {
      rows: items,
      total: getTotalFromRows(totalResult.rows || []),
      nextCursorRowId: hasMore ? String(items[items.length - 1]?.id || "") || null : null,
    };
  }

  async advancedSearchDataRows(
    filters: Array<{ field: string; operator: string; value: string }>,
    logic: "AND" | "OR",
    limit: number,
    offset: number,
  ): Promise<{ rows: AdvancedSearchDataRow[]; total: number }> {
    const allowedColumns = new Set(await this.getAllColumnNames());

    const safeFilters = filters.filter((filter) =>
      allowedColumns.has(filter.field) && ALLOWED_OPERATORS.has(filter.operator),
    );

    if (safeFilters.length === 0) {
      return { rows: [], total: 0 };
    }

    const conditions = safeFilters.map((filter) =>
      buildFieldCondition(filter.field, filter.operator, String(filter.value ?? "")),
    );

    const conditionSql = conditions.length === 1
      ? conditions[0]
      : sql.join(conditions, logic === "AND" ? sql` AND ` : sql` OR `);

    const safeLimit = Math.min(Math.max(1, limit), MAX_SEARCH_LIMIT);
    const safeOffset = normalizeSearchOffset(offset);

    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND (${conditionSql})
    `);

    if (isSearchOffsetBeyondRuntimeWindow(safeOffset)) {
      return {
        rows: [],
        total: getTotalFromRows(totalResult.rows || []),
      };
    }

    const rowsResult = await db.execute(sql`
      SELECT
        dr.id,
        dr.import_id as "importId",
        dr.json_data as "jsonDataJsonb",
        i.name as "importName",
        i.filename as "importFilename"
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND (${conditionSql})
      ORDER BY dr.id
      LIMIT ${safeLimit}
      OFFSET ${safeOffset}
    `);

    return {
      rows: (rowsResult.rows || []).map((row) => {
        const record = row as QueryRow;
        return {
          id: String(record.id || ""),
          importId: String(record.importId || ""),
          jsonDataJsonb: normalizeJsonPayload(record.jsonDataJsonb),
          importName: typeof record.importName === "string" ? record.importName : null,
          importFilename: typeof record.importFilename === "string" ? record.importFilename : null,
        } as AdvancedSearchDataRow;
      }),
      total: getTotalFromRows(totalResult.rows || []),
    };
  }

  async getAllColumnNames(): Promise<string[]> {
    const result = await db.execute(sql`
      SELECT DISTINCT key AS column_name
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      CROSS JOIN LATERAL jsonb_object_keys(dr.json_data::jsonb) AS key
      WHERE i.is_deleted = false
        AND jsonb_typeof(dr.json_data::jsonb) = 'object'
      ORDER BY key
      LIMIT ${MAX_COLUMN_KEYS}
    `);

    return (result.rows || [])
      .map((row) => String((row as QueryRow).column_name || "").trim())
      .filter(Boolean);
  }
}

function normalizeSearchOffset(offset: number): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }

  return Math.max(0, Math.floor(offset));
}

function isSearchOffsetBeyondRuntimeWindow(offset: number): boolean {
  return normalizeSearchOffset(offset) > MAX_SEARCH_OFFSET;
}
