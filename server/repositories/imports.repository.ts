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

const QUERY_PAGE_LIMIT = 1000;

export type ImportWithRowCount = Import & { rowCount: number };

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
      (result.rows || []).map((row: any) => [String(row.importId), Number(row.rowCount)]),
    );
  }
}
