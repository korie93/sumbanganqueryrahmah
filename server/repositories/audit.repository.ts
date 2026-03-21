import crypto from "crypto";
import { desc, gte, sql } from "drizzle-orm";
import type { AuditLog, InsertAuditLog } from "../../shared/schema-postgres";
import { auditLogs } from "../../shared/schema-postgres";
import { db } from "../db-postgres";

const QUERY_PAGE_LIMIT = 1000;
const AUDIT_LIST_DEFAULT_PAGE_SIZE = 50;
const AUDIT_LIST_MAX_PAGE_SIZE = 100;

type AuditLogSort = "newest" | "oldest";

type AuditLogPageParams = {
  page?: number;
  pageSize?: number;
  action?: string;
  performedBy?: string;
  targetUser?: string;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: AuditLogSort;
};

type AuditLogPageResult = {
  logs: AuditLog[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export class AuditRepository {
  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const result = await db
      .insert(auditLogs)
      .values({
        id: crypto.randomUUID(),
        action: data.action,
        performedBy: data.performedBy,
        targetUser: data.targetUser ?? null,
        targetResource: data.targetResource ?? null,
        details: data.details ?? null,
        timestamp: new Date(),
      })
      .returning();

    return result[0];
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    const firstPage = await this.listAuditLogsPage({
      page: 1,
      pageSize: QUERY_PAGE_LIMIT,
      sortBy: "newest",
    });
    if (firstPage.total <= firstPage.logs.length) {
      return firstPage.logs;
    }

    const logs: AuditLog[] = [...firstPage.logs];
    let page = 2;
    while (logs.length < firstPage.total) {
      const nextPage = await this.listAuditLogsPage({
        page,
        pageSize: QUERY_PAGE_LIMIT,
        sortBy: "newest",
      });
      if (!nextPage.logs.length) break;
      logs.push(...nextPage.logs);
      page += 1;
    }
    return logs;
  }

  async listAuditLogsPage(params: AuditLogPageParams = {}): Promise<AuditLogPageResult> {
    const rawPage = Number(params.page);
    const rawPageSize = Number(params.pageSize);
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
    const pageSize = Number.isFinite(rawPageSize)
      ? Math.max(1, Math.min(AUDIT_LIST_MAX_PAGE_SIZE, Math.floor(rawPageSize)))
      : AUDIT_LIST_DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * pageSize;

    const whereClauses: any[] = [];
    const action = String(params.action || "").trim();
    if (action) {
      whereClauses.push(sql`action = ${action}`);
    }

    const performedBy = String(params.performedBy || "").trim();
    if (performedBy) {
      whereClauses.push(sql`performed_by ILIKE ${`%${performedBy}%`}`);
    }

    const targetUser = String(params.targetUser || "").trim();
    if (targetUser) {
      whereClauses.push(sql`target_user ILIKE ${`%${targetUser}%`}`);
    }

    const search = String(params.search || "").trim();
    if (search) {
      whereClauses.push(sql`(
        action ILIKE ${`%${search}%`}
        OR COALESCE(details, '') ILIKE ${`%${search}%`}
        OR COALESCE(target_resource, '') ILIKE ${`%${search}%`}
      )`);
    }

    const dateFrom = params.dateFrom instanceof Date && Number.isFinite(params.dateFrom.getTime())
      ? params.dateFrom
      : null;
    const dateTo = params.dateTo instanceof Date && Number.isFinite(params.dateTo.getTime())
      ? params.dateTo
      : null;
    if (dateFrom) {
      whereClauses.push(sql`timestamp >= ${dateFrom}`);
    }
    if (dateTo) {
      whereClauses.push(sql`timestamp <= ${dateTo}`);
    }

    const whereSql = whereClauses.length
      ? sql`WHERE ${sql.join(whereClauses, sql` AND `)}`
      : sql``;
    const sortBy = String(params.sortBy || "newest").toLowerCase();
    const orderBySql = sortBy === "oldest"
      ? sql`ORDER BY timestamp ASC, id ASC`
      : sql`ORDER BY timestamp DESC, id DESC`;

    const [countResult, rowsResult] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM public.audit_logs
        ${whereSql}
      `),
      db.execute(sql`
        SELECT
          id,
          action,
          performed_by as "performedBy",
          target_user as "targetUser",
          target_resource as "targetResource",
          details,
          timestamp
        FROM public.audit_logs
        ${whereSql}
        ${orderBySql}
        LIMIT ${pageSize}
        OFFSET ${offset}
      `),
    ]);

    const total = Number((countResult.rows?.[0] as { total?: number } | undefined)?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      logs: (rowsResult.rows || []) as AuditLog[],
      page,
      pageSize,
      total,
      totalPages,
    };
  }

  async getAuditLogStats(): Promise<{
    totalLogs: number;
    todayLogs: number;
    actionBreakdown: Record<string, number>;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalLogs, todayLogs] = await Promise.all([
      db.select({ value: sql<number>`count(*)` }).from(auditLogs),
      db.select({ value: sql<number>`count(*)` }).from(auditLogs).where(gte(auditLogs.timestamp, today)),
    ]);

    const actionRows = await db.execute(sql`
      SELECT action, COUNT(*)::int AS count
      FROM public.audit_logs
      GROUP BY action
    `);

    const actionBreakdown: Record<string, number> = {};
    for (const row of actionRows.rows || []) {
      actionBreakdown[String((row as any).action || "UNKNOWN")] = Number((row as any).count || 0);
    }

    return {
      totalLogs: Number(totalLogs[0]?.value || 0),
      todayLogs: Number(todayLogs[0]?.value || 0),
      actionBreakdown,
    };
  }

  async cleanupAuditLogsOlderThan(cutoffDate: Date): Promise<number> {
    const result = await db.execute(sql`
      DELETE FROM public.audit_logs
      WHERE timestamp IS NOT NULL
        AND timestamp < ${cutoffDate}
      RETURNING id
    `);

    return result.rows?.length || 0;
  }
}
