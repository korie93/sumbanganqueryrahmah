import crypto from "crypto";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type {
  DataRow,
  Import,
  InsertDataRow,
  InsertImport,
} from "../../shared/schema-postgres";
import { dataRows, imports } from "../../shared/schema-postgres";
import { db } from "../db-postgres";
import { buildLikePattern } from "./sql-like-utils";
import { assertSqlIdentifier } from "./sql-identifier-utils";

const QUERY_PAGE_LIMIT = 1000;
const IMPORT_LIST_PAGE_DEFAULT_LIMIT = 100;
const IMPORT_LIST_PAGE_MAX_LIMIT = 200;
const IMPORT_LIST_OFFSET_DEFAULT_PAGE_SIZE = 20;
const IMPORT_LIST_OFFSET_MAX_PAGE_SIZE = 100;
const IMPORT_COLUMN_KEYS_MAX_LIMIT = 500;
const LARGE_IMPORT_SIZE_BYTES = 10 * 1024 * 1024;
const LARGE_IMPORT_ROW_COUNT = 10_000;

export type ImportWithRowCount = Import & { isDuplicate?: boolean; rowCount: number };
export type ImportListView = "all" | "recent" | "large" | "duplicates" | "review";
export type ImportListPage = {
  items: ImportWithRowCount[];
  nextCursor: string | null;
  total: number;
  limit: number;
};
export type ImportListOffsetPage = {
  items: ImportWithRowCount[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  offset: number;
};

type ImportListPageParams = {
  cursor?: string | null | undefined;
  limit?: number | undefined;
  search?: string | null | undefined;
  createdOn?: string | null | undefined;
};

export type ImportListOffsetPageParams = {
  page?: number | undefined;
  pageSize?: number | undefined;
  search?: string | null | undefined;
  createdBy?: string | null | undefined;
  createdOn?: string | null | undefined;
  minRows?: number | null | undefined;
  maxRows?: number | null | undefined;
  view?: ImportListView | undefined;
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

function clampImportListPageSize(pageSize: number | undefined): number {
  const safePageSize = Number.isFinite(pageSize)
    ? Math.trunc(Number(pageSize))
    : IMPORT_LIST_OFFSET_DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(IMPORT_LIST_OFFSET_MAX_PAGE_SIZE, safePageSize));
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
  createdBy?: string | null | undefined;
  createdOn?: string | null | undefined;
  minRows?: number | null | undefined;
  maxRows?: number | null | undefined;
  view?: ImportListView | undefined;
  cursor?: ImportListCursor | null | undefined;
  includeCursor: boolean;
}) {
  const alias = sql.raw(assertSqlIdentifier(params.alias));
  const conditions = [sql`${alias}.is_deleted = false`];
  const search = String(params.search || "").trim();
  if (search) {
    const likeValue = buildLikePattern(search, "contains");
    conditions.push(
      sql`(
        ${alias}.name ILIKE ${likeValue} ESCAPE '\'
        OR ${alias}.filename ILIKE ${likeValue} ESCAPE '\'
        OR COALESCE(${alias}.created_by, '') ILIKE ${likeValue} ESCAPE '\'
      )`,
    );
  }

  const createdBy = String(params.createdBy || "").trim();
  if (createdBy) {
    conditions.push(
      sql`COALESCE(${alias}.created_by, '') ILIKE ${buildLikePattern(createdBy, "contains")} ESCAPE '\'`,
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

  const rowCountSql = sql`(
    SELECT COUNT(*)::int
    FROM public.data_rows import_rows
    WHERE import_rows.import_id = ${alias}.id
  )`;
  if (typeof params.minRows === "number") {
    conditions.push(sql`${rowCountSql} >= ${params.minRows}`);
  }
  if (typeof params.maxRows === "number") {
    conditions.push(sql`${rowCountSql} <= ${params.maxRows}`);
  }

  if (params.view === "recent") {
    conditions.push(sql`${alias}.created_at >= NOW() - INTERVAL '7 days'`);
  } else if (params.view === "large") {
    conditions.push(
      sql`(COALESCE(${alias}.source_size_bytes, 0) >= ${LARGE_IMPORT_SIZE_BYTES} OR ${rowCountSql} >= ${LARGE_IMPORT_ROW_COUNT})`,
    );
  } else if (params.view === "duplicates") {
    conditions.push(sql`
      ${alias}.content_hash_sha256 IS NOT NULL
      AND ${alias}.content_hash_sha256 IN (
        SELECT duplicate_import.content_hash_sha256
        FROM public.imports duplicate_import
        WHERE duplicate_import.is_deleted = false
          AND duplicate_import.content_hash_sha256 IS NOT NULL
        GROUP BY duplicate_import.content_hash_sha256
        HAVING COUNT(*) > 1
      )
    `);
  } else if (params.view === "review") {
    conditions.push(sql`${rowCountSql} = 0`);
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

function buildImportDuplicateSql(aliasName: string) {
  const alias = sql.raw(assertSqlIdentifier(aliasName));
  return sql`EXISTS (
    SELECT 1
    FROM public.imports duplicate_import
    WHERE duplicate_import.is_deleted = false
      AND duplicate_import.content_hash_sha256 IS NOT NULL
      AND duplicate_import.content_hash_sha256 = ${alias}.content_hash_sha256
      AND duplicate_import.id <> ${alias}.id
  )`;
}

export class ImportsRepository {
  async createImport(
    data: InsertImport & {
      createdBy?: string;
      contentHashSha256?: string;
      sourceSizeBytes?: number;
    },
  ): Promise<Import> {
    const result = await db
      .insert(imports)
      .values({
        id: crypto.randomUUID(),
        name: data.name,
        filename: data.filename,
        createdBy: data.createdBy || null,
        contentHashSha256: data.contentHashSha256 || null,
        sourceSizeBytes: Number.isFinite(data.sourceSizeBytes)
          ? Math.max(0, Math.trunc(Number(data.sourceSizeBytes)))
          : null,
        createdAt: new Date(),
        isDeleted: false,
      })
      .returning();

    return result[0];
  }

  async getImports(): Promise<Import[]> {
    const results: Import[] = [];
    let offset = 0;

    while (true) {
      const chunk = await db
        .select()
        .from(imports)
        .where(eq(imports.isDeleted, false))
        .orderBy(desc(imports.createdAt))
        .limit(QUERY_PAGE_LIMIT)
        .offset(offset);

      if (!chunk.length) break;
      results.push(...chunk);
      if (chunk.length < QUERY_PAGE_LIMIT) break;
      offset += chunk.length;
    }

    return results;
  }

  async getImportsWithRowCounts(): Promise<ImportWithRowCount[]> {
    const importRecords = await this.getImports();
    const rowCountsByImportId = await this.getDataRowCountsByImportIds(
      importRecords.map((importRecord) => importRecord.id),
    );

    return importRecords.map((importRecord) => ({
      ...importRecord,
      rowCount: rowCountsByImportId.get(importRecord.id) ?? 0,
    }));
  }

  async findActiveImportByContentHash(
    createdBy: string,
    contentHashSha256: string,
  ): Promise<Import | undefined> {
    const normalizedCreatedBy = String(createdBy || "").trim();
    const normalizedHash = String(contentHashSha256 || "").trim().toLowerCase();
    if (!normalizedCreatedBy || !/^[a-f0-9]{64}$/.test(normalizedHash)) {
      return undefined;
    }

    const result = await db
      .select()
      .from(imports)
      .where(and(
        eq(imports.createdBy, normalizedCreatedBy),
        eq(imports.contentHashSha256, normalizedHash),
        eq(imports.isDeleted, false),
      ))
      .limit(1);

    return result[0];
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
        view: "all",
        includeCursor: false,
      })}
    `);

    const total = Number(totalResult.rows?.[0]?.total || 0);
    const pageResult = await db.execute(sql`
      SELECT
        i.id,
        i.name,
        i.filename,
        i.content_hash_sha256 as "contentHashSha256",
        i.source_size_bytes::double precision as "sourceSizeBytes",
        i.created_at as "createdAt",
        i.last_opened_at as "lastOpenedAt",
        ${buildImportDuplicateSql("i")} as "isDuplicate",
        i.is_deleted as "isDeleted",
        i.created_by as "createdBy"
      FROM public.imports i
      WHERE ${buildImportListFilterSql({
        alias: "i",
        search: params.search,
        createdOn: params.createdOn,
        view: "all",
        cursor,
        includeCursor: true,
      })}
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT ${limit + 1}
    `);

    const rows = ((pageResult.rows || []) as Array<Import & { isDuplicate?: boolean }>);
    const hasMore = rows.length > limit;
    const pageItems = hasMore ? rows.slice(0, limit) : rows;
    const rowCountsByImportId = await this.getDataRowCountsByImportIds(
      pageItems.map((importRecord) => importRecord.id),
    );
    const items = pageItems.map((importRecord) => ({
      ...importRecord,
      rowCount: rowCountsByImportId.get(importRecord.id) ?? 0,
    }));
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

  async listImportsWithRowCountsOffsetPage(
    params: ImportListOffsetPageParams = {},
  ): Promise<ImportListOffsetPage> {
    const pageSize = clampImportListPageSize(params.pageSize);
    const requestedPage = Number.isFinite(params.page) ? Math.max(1, Math.trunc(Number(params.page))) : 1;
    const filterSql = buildImportListFilterSql({
      alias: "i",
      search: params.search,
      createdBy: params.createdBy,
      createdOn: params.createdOn,
      minRows: params.minRows,
      maxRows: params.maxRows,
      view: params.view ?? "all",
      includeCursor: false,
    });
    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS "total"
      FROM public.imports i
      WHERE ${filterSql}
    `);
    const total = Number(totalResult.rows?.[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;
    const pageResult = await db.execute(sql`
      SELECT
        i.id,
        i.name,
        i.filename,
        i.content_hash_sha256 as "contentHashSha256",
        i.source_size_bytes::double precision as "sourceSizeBytes",
        i.created_at as "createdAt",
        i.last_opened_at as "lastOpenedAt",
        ${buildImportDuplicateSql("i")} as "isDuplicate",
        i.is_deleted as "isDeleted",
        i.created_by as "createdBy"
      FROM public.imports i
      WHERE ${filterSql}
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `);
    const pageItems = (pageResult.rows || []) as Array<Import & { isDuplicate?: boolean }>;
    const rowCountsByImportId = await this.getDataRowCountsByImportIds(
      pageItems.map((importRecord) => importRecord.id),
    );

    return {
      items: pageItems.map((importRecord) => ({
        ...importRecord,
        rowCount: rowCountsByImportId.get(importRecord.id) ?? 0,
      })),
      total,
      page,
      pageSize,
      totalPages,
      offset,
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

  async markImportOpened(id: string): Promise<void> {
    await db
      .update(imports)
      .set({ lastOpenedAt: new Date() })
      .where(and(eq(imports.id, id), eq(imports.isDeleted, false)));
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

  async createDataRows(rows: InsertDataRow[]): Promise<DataRow[]> {
    if (rows.length === 0) {
      return [];
    }

    const values = rows.map((row) => {
      if (!row.jsonDataJsonb || typeof row.jsonDataJsonb !== "object") {
        throw new Error("Invalid jsonDataJsonb");
      }

      return {
        id: crypto.randomUUID(),
        importId: row.importId,
        jsonDataJsonb: row.jsonDataJsonb,
      };
    });

    return db
      .insert(dataRows)
      .values(values)
      .returning();
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

  async getDataRowsByImportPageAfterId(
    importId: string,
    limit: number,
    afterRowId: string | null = null,
  ): Promise<DataRow[]> {
    const conditions = [eq(dataRows.importId, importId)];
    if (afterRowId) {
      conditions.push(gt(dataRows.id, afterRowId));
    }

    return db
      .select()
      .from(dataRows)
      .where(and(...conditions))
      .orderBy(asc(dataRows.id))
      .limit(Math.max(1, limit));
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

    const result = await db
      .select({
        importId: dataRows.importId,
        rowCount: sql<number>`COUNT(${dataRows.id})::int`,
      })
      .from(dataRows)
      .where(inArray(dataRows.importId, importIds))
      .groupBy(dataRows.importId);

    return new Map(
      readImportRows<ImportRowCountByImportIdRow>(result)
        .map((row) => [String(row.importId ?? ""), Number(row.rowCount ?? 0)]),
    );
  }
}
