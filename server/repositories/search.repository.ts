import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { DataRow } from "../../shared/schema-postgres";
import { db } from "../db-postgres";

const MAX_SEARCH_LIMIT = 200;
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

  switch (operator) {
    case "contains":
      return sql`${column} ILIKE ${`%${value}%`}`;
    case "equals":
      return sql`${column} = ${value}`;
    case "notEquals":
      return sql`${column} <> ${value}`;
    case "startsWith":
      return sql`${column} ILIKE ${`${value}%`}`;
    case "endsWith":
      return sql`${column} ILIKE ${`%${value}`}`;
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
  }): Promise<{ rows: any[]; total: number }> {
    const { search, limit, offset } = params;

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
        AND dr.json_data::text ILIKE ${`%${search}%`}
      ORDER BY dr.id
      LIMIT ${Math.max(1, Math.min(limit, MAX_SEARCH_LIMIT))}
      OFFSET ${Math.max(0, offset)}
    `);

    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND dr.json_data::text ILIKE ${`%${search}%`}
    `);

    const rows = (rowsResult.rows || []).map((row: any) => ({
      id: row.id,
      importId: row.import_id,
      importName: row.import_name,
      importFilename: row.import_filename,
      jsonDataJsonb: normalizeJsonPayload(row.json_data_jsonb),
    }));

    const total = totalResult.rows?.[0] ? Number((totalResult.rows[0] as any).total) : 0;
    return { rows, total };
  }

  async searchSimpleDataRows(search: string) {
    return db.execute(sql`
      SELECT
        dr.import_id as "importId",
        i.name as "importName",
        dr.json_data as "jsonDataJsonb"
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND dr.json_data::text ILIKE ${`%${search}%`}
      LIMIT ${MAX_SEARCH_LIMIT}
    `);
  }

  async searchDataRows(params: {
    importId: string;
    search?: string | null;
    limit: number;
    offset: number;
    columnFilters?: Array<{ column: string; operator: string; value: string }>;
  }): Promise<{ rows: any[]; total: number }> {
    const { importId, search, limit, offset } = params;
    const trimmedSearch = search && search.trim() ? search.trim() : null;
    const safeLimit = Math.min(Math.max(1, limit), MAX_SEARCH_LIMIT);
    const safeOffset = Math.max(offset, 0);
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
      return { rows: [], total: 0 };
    }
    const conditions: SQL[] = [sql`dr.import_id = ${importId}`];

    if (trimmedSearch) {
      conditions.push(sql`dr.json_data::text ILIKE ${`%${trimmedSearch}%`}`);
    }

    for (const filter of safeColumnFilters) {
      conditions.push(buildFieldCondition(filter.column, filter.operator, filter.value));
    }

    const whereClause = conditions.length === 1
      ? conditions[0]
      : sql.join(conditions, sql` AND `);

    const rowsResult = await db.execute(sql`
      SELECT
        dr.id,
        dr.import_id as "importId",
        dr.json_data as "jsonDataJsonb"
      FROM public.data_rows dr
      WHERE ${whereClause}
      ORDER BY dr.id
      LIMIT ${safeLimit}
      OFFSET ${safeOffset}
    `);

    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM public.data_rows dr
      WHERE ${whereClause}
    `);

    return {
      rows: (rowsResult.rows || []).map((row: any) => ({
        id: row.id,
        importId: row.importId,
        jsonDataJsonb: normalizeJsonPayload(row.jsonDataJsonb),
      })),
      total: totalResult.rows?.[0] ? Number((totalResult.rows[0] as any).total) : 0,
    };
  }

  async advancedSearchDataRows(
    filters: Array<{ field: string; operator: string; value: string }>,
    logic: "AND" | "OR",
    limit: number,
    offset: number,
  ): Promise<{ rows: Array<DataRow & { importName?: string | null; importFilename?: string | null }>; total: number }> {
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
    const safeOffset = Math.max(offset, 0);

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

    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM public.data_rows dr
      JOIN public.imports i ON i.id = dr.import_id
      WHERE i.is_deleted = false
        AND (${conditionSql})
    `);

    return {
      rows: (rowsResult.rows || []).map((row: any) => ({
        id: row.id,
        importId: row.importId,
        jsonDataJsonb: normalizeJsonPayload(row.jsonDataJsonb),
        importName: row.importName,
        importFilename: row.importFilename,
      })) as Array<DataRow & { importName?: string | null; importFilename?: string | null }>,
      total: totalResult.rows?.[0] ? Number((totalResult.rows[0] as any).total) : 0,
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
      .map((row: any) => String(row.column_name || "").trim())
      .filter(Boolean);
  }
}
