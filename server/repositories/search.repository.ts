import { sql, type SQL } from "drizzle-orm";
import { db } from "../db-postgres";
import { buildLikePattern } from "./sql-like-utils";
import {
  mapAdvancedSearchDataRow,
  mapSearchDataRow,
  mapSearchGlobalDataRow,
} from "./search-repository-mappers";
import {
  buildSearchFieldCondition,
  getSearchTotalFromRows,
  isSearchOffsetBeyondRuntimeWindow,
  MAX_SEARCH_COLUMN_KEYS,
  MAX_SEARCH_LIMIT,
  normalizeSearchOffset,
  SEARCH_ALLOWED_OPERATORS,
} from "./search-repository-shared";
import type {
  AdvancedSearchDataRow,
  SearchColumnFilter,
  SearchDataRow,
  SearchGlobalDataRow,
} from "./search-repository-types";

export { MAX_SEARCH_LIMIT, MAX_SEARCH_OFFSET } from "./search-repository-shared";
export type {
  SearchDataRow,
  SearchGlobalDataRow,
} from "./search-repository-types";

export class SearchRepository {
  private async getGlobalSearchTotal(searchPattern: string): Promise<number> {
    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND dr.json_data::text ILIKE ${searchPattern} ESCAPE '\'
    `);

    return getSearchTotalFromRows(totalResult.rows || []);
  }

  private async getImportSearchTotal(whereClause: SQL): Promise<number> {
    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM public.data_rows dr
      WHERE ${whereClause}
    `);

    return getSearchTotalFromRows(totalResult.rows || []);
  }

  private async getImportColumnNames(importId: string): Promise<Set<string>> {
    const result = await db.execute(sql`
      SELECT DISTINCT key AS column_name
      FROM public.data_rows dr
      CROSS JOIN LATERAL jsonb_object_keys(dr.json_data::jsonb) AS key
      WHERE dr.import_id = ${importId}
        AND jsonb_typeof(dr.json_data::jsonb) = 'object'
      ORDER BY key
      LIMIT ${MAX_SEARCH_COLUMN_KEYS}
    `);

    return new Set(
      (result.rows || [])
        .map((row) => String((row as Record<string, unknown>).column_name || "").trim())
        .filter(Boolean),
    );
  }

  async searchGlobalDataRows(params: {
    search: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: SearchGlobalDataRow[]; total: number }> {
    const { search, limit, offset } = params;
    const searchPattern = buildLikePattern(search, "contains");
    const safeLimit = Math.max(1, Math.min(limit, MAX_SEARCH_LIMIT));
    const safeOffset = normalizeSearchOffset(offset);

    if (isSearchOffsetBeyondRuntimeWindow(safeOffset)) {
      return {
        rows: [],
        total: await this.getGlobalSearchTotal(searchPattern),
      };
    }

    const rowsResult = await db.execute(sql`
      SELECT
        dr.id,
        dr.import_id,
        dr.json_data as json_data_jsonb,
        i.name as import_name,
        i.filename as import_filename,
        COUNT(*) OVER()::int AS total
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND dr.json_data::text ILIKE ${searchPattern} ESCAPE '\'
      ORDER BY dr.id
      LIMIT ${safeLimit}
      OFFSET ${safeOffset}
    `);

    const rows = (rowsResult.rows || []).map((row) => mapSearchGlobalDataRow(row as Record<string, unknown>));
    const total = rows.length > 0
      ? getSearchTotalFromRows(rowsResult.rows || [])
      : safeOffset > 0
        ? await this.getGlobalSearchTotal(searchPattern)
        : 0;

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
    columnFilters?: SearchColumnFilter[];
    cursor?: string | null;
  }): Promise<{ rows: SearchDataRow[]; total: number; nextCursorRowId: string | null }> {
    const { importId, search, limit, offset } = params;
    const trimmedSearch = search && search.trim() ? search.trim() : null;
    const safeLimit = Math.min(Math.max(1, limit), MAX_SEARCH_LIMIT);
    const safeOffset = normalizeSearchOffset(offset);
    const cursor = String(params.cursor || "").trim() || null;
    const requestedColumnFilters = Array.isArray(params.columnFilters)
      ? params.columnFilters
          .map((filter) => ({
            column: String(filter?.column ?? "").trim(),
            operator: String(filter?.operator ?? "").trim(),
            value: String(filter?.value ?? "").trim(),
          }))
          .filter((filter) =>
            filter.column !== ""
            && filter.value !== ""
            && SEARCH_ALLOWED_OPERATORS.has(filter.operator),
          )
      : [];
    const allowedColumns = requestedColumnFilters.length > 0
      ? await this.getImportColumnNames(importId)
      : null;
    const safeColumnFilters = allowedColumns
      ? requestedColumnFilters.filter((filter) => allowedColumns.has(filter.column))
      : [];

    if (trimmedSearch && trimmedSearch.length < 2) {
      return { rows: [], total: 0, nextCursorRowId: null };
    }
    const conditions: SQL[] = [sql`dr.import_id = ${importId}`];

    if (trimmedSearch) {
      conditions.push(sql`dr.json_data::text ILIKE ${buildLikePattern(trimmedSearch, "contains")} ESCAPE '\'`);
    }

    for (const filter of safeColumnFilters) {
      conditions.push(buildSearchFieldCondition(filter.column, filter.operator, filter.value));
    }

    if (cursor) {
      conditions.push(sql`dr.id > ${cursor}`);
    }

    const whereClause = conditions.length === 1
      ? conditions[0]
      : sql.join(conditions, sql` AND `);

    if (!cursor && isSearchOffsetBeyondRuntimeWindow(safeOffset)) {
      return {
        rows: [],
        total: await this.getImportSearchTotal(whereClause),
        nextCursorRowId: null,
      };
    }

    const rowsResult = await db.execute(sql`
      SELECT
        dr.id,
        dr.import_id as "importId",
        dr.json_data as "jsonDataJsonb",
        COUNT(*) OVER()::int AS total
      FROM public.data_rows dr
      WHERE ${whereClause}
      ORDER BY dr.id
      LIMIT ${safeLimit + 1}
      ${cursor ? sql`` : sql`OFFSET ${safeOffset}`}
    `);

    const rawRows = (rowsResult.rows || []).map((row) =>
      mapSearchDataRow(row as Record<string, unknown>),
    );
    const hasMore = rawRows.length > safeLimit;
    const items = hasMore ? rawRows.slice(0, safeLimit) : rawRows;
    const total = rawRows.length > 0
      ? getSearchTotalFromRows(rowsResult.rows || [])
      : !cursor && safeOffset > 0
        ? await this.getImportSearchTotal(whereClause)
        : 0;

    return {
      rows: items,
      total,
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
      allowedColumns.has(filter.field) && SEARCH_ALLOWED_OPERATORS.has(filter.operator),
    );

    if (safeFilters.length === 0) {
      return { rows: [], total: 0 };
    }

    const conditions = safeFilters.map((filter) =>
      buildSearchFieldCondition(filter.field, filter.operator, String(filter.value ?? "")),
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
        total: getSearchTotalFromRows(totalResult.rows || []),
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
      rows: (rowsResult.rows || []).map((row) =>
        mapAdvancedSearchDataRow(row as Record<string, unknown>),
      ),
      total: getSearchTotalFromRows(totalResult.rows || []),
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
      LIMIT ${MAX_SEARCH_COLUMN_KEYS}
    `);

    return (result.rows || [])
      .map((row) => String((row as Record<string, unknown>).column_name || "").trim())
      .filter(Boolean);
  }
}
