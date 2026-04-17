import crypto from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type {
  DataRow,
  Import,
  InsertDataRow,
  InsertImport,
} from "../../shared/schema-postgres";
import { dataRows, imports } from "../../shared/schema-postgres";
import { db } from "../db-postgres";
import { logger } from "../lib/logger";
import { buildLikePattern } from "./sql-like-utils";

const QUERY_PAGE_LIMIT = 1000;
const GET_IMPORTS_MAX_RESULTS = 10_000;
const IMPORT_LIST_PAGE_DEFAULT_LIMIT = 100;
const IMPORT_LIST_PAGE_MAX_LIMIT = 200;
const IMPORT_COLUMN_KEYS_MAX_LIMIT = 500;

export type ImportWithRowCount = Import & { rowCount: number };
export type ImportListPage = {
  items: ImportWithRowCount[];
  nextCursor: string | null;
  total: number;
  limit: number;
};

type ImportListPageParams = {
  cursor?: string | null | undefined;
  limit?: number | undefined;
  search?: string | null | undefined;
  createdOn?: string | null | undefined;
};

type ImportListCursor = {
  createdAt: string;
  id: string;
};

type ImportColumnNameRow = {
  column_name?: unknown;
};

type ImportRowCountByImportIdRow = {
  importId?: unknown;
  rowCount?: unknown;
};

function readImportRows<TRow>(rows: unknown[] | undefined): TRow[] {
  return Array.isArray(rows) ? (rows as TRow[]) : [];
}

function clampImportListLimit(limit: number | undefined): number {
  const safeLimit = Number.isFinite(limit) ? Math.trunc(Number(limit)) : IMPORT_LIST_PAGE_DEFAULT_LIMIT;
  return Math.max(1, Math.min(IMPORT_LIST_PAGE_MAX_LIMIT, safeLimit));
}

export function resolveRemainingImportsReadLimit(loadedCount: number): number {
  const safeLoadedCount = Math.max(0, Math.trunc(Number(loadedCount) || 0));
  return Math.max(0, Math.min(QUERY_PAGE_LIMIT, GET_IMPORTS_MAX_RESULTS - safeLoadedCount));
}

function encodeImportListCursor(cursor: ImportListCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function normalizeImportCursorCreatedAt(createdAt: Date | string | null | undefined): string {
  if (createdAt instanceof Date && !Number.isNaN(createdAt.getTime())) {
    return createdAt.toISOString();
  }

  if (typeof createdAt === "string" && createdAt.trim()) {
    const parsed = new Date(createdAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date(0).toISOString();
}

function parseImportListCursor(rawCursor: string | null | undefined): ImportListCursor | null {
  const normalized = String(rawCursor || "").trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(normalized, "base64url").toString("utf8")) as Partial<ImportListCursor>;
    const createdAt = String(parsed.createdAt || "").trim();
    const id = String(parsed.id || "").trim();
    if (!createdAt || !id || Number.isNaN(new Date(createdAt).getTime())) {
      return null;
    }

    return {
      createdAt,
      id,
    };
  } catch {
    return null;
  }
}

function buildImportListFilterSql(params: {
  alias: string;
  search?: string | null | undefined;
  createdOn?: string | null | undefined;
  cursor?: ImportListCursor | null | undefined;
  includeCursor: boolean;
}) {
  const alias = sql.raw(params.alias);
  const conditions = [sql`${alias}.is_deleted = false`];
  const search = String(params.search || "").trim();
  if (search) {
    const likeValue = buildLikePattern(search, "contains");
    conditions.push(
      sql`(${alias}.name ILIKE ${likeValue} ESCAPE '\' OR ${alias}.filename ILIKE ${likeValue} ESCAPE '\')`,
    );
  }

  const createdOn = String(params.createdOn || "").trim();
  if (createdOn) {
    const start = new Date(`${createdOn}T00:00:00.000Z`);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      conditions.push(sql`${alias}.created_at >= ${start} AND ${alias}.created_at < ${end}`);
    }
  }

  if (params.includeCursor && params.cursor) {
    const cursorCreatedAt = new Date(params.cursor.createdAt);
    conditions.push(
      sql`(
        ${alias}.created_at < ${cursorCreatedAt}
        OR (${alias}.created_at = ${cursorCreatedAt} AND ${alias}.id < ${params.cursor.id})
      )`,
    );
  }

  return sql.join(conditions, sql` AND `);
}

export class ImportsRepository {
  async createImport(data: InsertImport & { createdBy?: string }): Promise<Import> {
    const result = await db
      .insert(imports)
      .values({
        id: crypto.randomUUID(),
        name: data.name,
        filename: data.filename,
        createdBy: data.createdBy || null,
        createdAt: new Date(),
        isDeleted: false,
      })
      .returning();

    return result[0];
  }

  async getImports(): Promise<Import[]> {
    const results: Import[] = [];
    let offset = 0;
    let reachedSafetyCap = false;

    for (;;) {
      const limit = resolveRemainingImportsReadLimit(results.length);
      if (limit <= 0) {
        reachedSafetyCap = true;
        break;
      }

      const chunk = await db
        .select()
        .from(imports)
        .where(eq(imports.isDeleted, false))
        .orderBy(desc(imports.createdAt))
        .limit(limit)
        .offset(offset);

      if (!chunk.length) {
        break;
      }

      results.push(...chunk);
      offset += chunk.length;
      if (chunk.length < limit) {
        break;
      }
    }

    if (reachedSafetyCap) {
      const remainingProbe = await db
        .select({ id: imports.id })
        .from(imports)
        .where(eq(imports.isDeleted, false))
        .orderBy(desc(imports.createdAt))
        .limit(1)
        .offset(offset);

      if (remainingProbe.length > 0) {
        logger.warn("Imports repository reached the bounded getImports safety cap", {
          loadedImports: results.length,
          maxResults: GET_IMPORTS_MAX_RESULTS,
        });
      }
    }

    return results;
  }

  async getImportsWithRowCounts(): Promise<ImportWithRowCount[]> {
    const result = await db.execute(sql`
      SELECT
        i.id,
        i.name,
        i.filename,
        i.created_at as "createdAt",
        i.is_deleted as "isDeleted",
        i.created_by as "createdBy",
        COALESCE(COUNT(dr.id), 0)::int as "rowCount"
      FROM public.imports i
      LEFT JOIN public.data_rows dr ON dr.import_id = i.id
      WHERE i.is_deleted = false
      GROUP BY i.id, i.name, i.filename, i.created_at, i.is_deleted, i.created_by
      ORDER BY i.created_at DESC
    `);

    return (result.rows || []) as ImportWithRowCount[];
  }

  async listImportsWithRowCountsPage(params: ImportListPageParams = {}): Promise<ImportListPage> {
    const limit = clampImportListLimit(params.limit);
    const cursor = parseImportListCursor(params.cursor);
    if (params.cursor && !cursor) {
      throw new Error("Invalid imports cursor.");
    }

    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS "total"
      FROM public.imports i
      WHERE ${buildImportListFilterSql({
        alias: "i",
        search: params.search,
        createdOn: params.createdOn,
        includeCursor: false,
      })}
    `);

    const total = Number(totalResult.rows?.[0]?.total || 0);
    const pageResult = await db.execute(sql`
      SELECT
        i.id,
        i.name,
        i.filename,
        i.created_at as "createdAt",
        i.is_deleted as "isDeleted",
        i.created_by as "createdBy",
        COALESCE(COUNT(dr.id), 0)::int as "rowCount"
      FROM public.imports i
      LEFT JOIN public.data_rows dr ON dr.import_id = i.id
      WHERE ${buildImportListFilterSql({
        alias: "i",
        search: params.search,
        createdOn: params.createdOn,
        cursor,
        includeCursor: true,
      })}
      GROUP BY i.id, i.name, i.filename, i.created_at, i.is_deleted, i.created_by
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT ${limit + 1}
    `);

    const rows = ((pageResult.rows || []) as ImportWithRowCount[]);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0
      ? encodeImportListCursor({
          createdAt: normalizeImportCursorCreatedAt(items[items.length - 1].createdAt),
          id: items[items.length - 1].id,
        })
      : null;

    return {
      items,
      nextCursor,
      total,
      limit,
    };
  }

  async getImportById(id: string): Promise<Import | undefined> {
    const result = await db
      .select()
      .from(imports)
      .where(and(eq(imports.id, id), eq(imports.isDeleted, false)))
      .limit(1);

    return result[0];
  }

  async updateImportName(id: string, name: string): Promise<Import | undefined> {
    await db.update(imports).set({ name }).where(eq(imports.id, id));
    return this.getImportById(id);
  }

  async deleteImport(id: string): Promise<boolean> {
    await db.update(imports).set({ isDeleted: true }).where(eq(imports.id, id));
    return true;
  }

  async deleteDataRowsByImport(importId: string): Promise<number> {
    const deletedRows = await db
      .delete(dataRows)
      .where(eq(dataRows.importId, importId))
      .returning({ id: dataRows.id });

    return deletedRows.length;
  }

  async createDataRow(data: InsertDataRow): Promise<DataRow> {
    if (!data.jsonDataJsonb || typeof data.jsonDataJsonb !== "object") {
      throw new Error("Invalid jsonDataJsonb");
    }

    const result = await db
      .insert(dataRows)
      .values({
        id: crypto.randomUUID(),
        importId: data.importId,
        jsonDataJsonb: data.jsonDataJsonb,
      })
      .returning();

    return result[0];
  }

  async getDataRowsByImport(importId: string): Promise<DataRow[]> {
    const rows: DataRow[] = [];
    let offset = 0;

    while (true) {
      const chunk = await db
        .select()
        .from(dataRows)
        .where(eq(dataRows.importId, importId))
        .limit(QUERY_PAGE_LIMIT)
        .offset(offset);

      if (!chunk.length) break;
      rows.push(...chunk);
      if (chunk.length < QUERY_PAGE_LIMIT) break;
      offset += chunk.length;
    }

    return rows;
  }

  async getImportColumnNames(importId: string): Promise<string[]> {
    const result = await db.execute(sql`
      SELECT DISTINCT key AS column_name
      FROM public.data_rows dr
      CROSS JOIN LATERAL jsonb_object_keys(dr.json_data::jsonb) AS key
      WHERE dr.import_id = ${importId}
        AND jsonb_typeof(dr.json_data::jsonb) = 'object'
      ORDER BY key
      LIMIT ${IMPORT_COLUMN_KEYS_MAX_LIMIT}
    `);

    return readImportRows<ImportColumnNameRow>(result.rows)
      .map((row) => String(row.column_name ?? "").trim())
      .filter(Boolean);
  }

  async getDataRowsByImportPage(importId: string, limit: number, offset: number): Promise<DataRow[]> {
    return db
      .select()
      .from(dataRows)
      .where(eq(dataRows.importId, importId))
      .limit(Math.max(1, limit))
      .offset(Math.max(0, offset));
  }

  async getDataRowCountByImport(importId: string): Promise<number> {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(dataRows)
      .where(eq(dataRows.importId, importId));

    return Number(count);
  }

  async getDataRowCountsByImportIds(importIds: string[]): Promise<Map<string, number>> {
    if (!importIds.length) {
      return new Map();
    }

    const result = await db.execute(sql`
      SELECT
        dr.import_id as "importId",
        COUNT(dr.id)::int as "rowCount"
      FROM public.data_rows dr
      WHERE dr.import_id = ANY(${importIds}::text[])
      GROUP BY dr.import_id
    `);

    return new Map(
      readImportRows<ImportRowCountByImportIdRow>(result.rows)
        .map((row) => [String(row.importId ?? ""), Number(row.rowCount ?? 0)]),
    );
  }
}
