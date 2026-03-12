import crypto from "crypto";
import { desc, gte, sql } from "drizzle-orm";
import type { AuditLog, InsertAuditLog } from "../../shared/schema-postgres";
import { auditLogs } from "../../shared/schema-postgres";
import { db } from "../db-postgres";

const QUERY_PAGE_LIMIT = 1000;

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
    const logs: AuditLog[] = [];
    let offset = 0;

    while (true) {
      const chunk = await db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.timestamp))
        .limit(QUERY_PAGE_LIMIT)
        .offset(offset);

      if (!chunk.length) break;
      logs.push(...chunk);
      if (chunk.length < QUERY_PAGE_LIMIT) break;
      offset += chunk.length;
    }

    return logs;
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
