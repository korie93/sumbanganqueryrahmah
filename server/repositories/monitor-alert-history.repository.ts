import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import type { InternalMonitorAlert } from "../internal/runtime-monitor-manager";

export type MonitorAlertIncident = {
  id: string;
  alertKey: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  source: string | null;
  message: string;
  status: "open" | "resolved";
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
  updatedAt: Date;
};

export type MonitorAlertIncidentPage = {
  incidents: MonitorAlertIncident[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

function mapMonitorAlertIncidentRow(row: Record<string, unknown>): MonitorAlertIncident {
  return {
    id: String(row.id || ""),
    alertKey: String(row.alert_key || ""),
    severity: String(row.severity || "INFO") as MonitorAlertIncident["severity"],
    source: row.source ? String(row.source) : null,
    message: String(row.message || ""),
    status: String(row.status || "open") as MonitorAlertIncident["status"],
    firstSeenAt: row.first_seen_at instanceof Date ? row.first_seen_at : new Date(String(row.first_seen_at || 0)),
    lastSeenAt: row.last_seen_at instanceof Date ? row.last_seen_at : new Date(String(row.last_seen_at || 0)),
    resolvedAt: row.resolved_at
      ? row.resolved_at instanceof Date
        ? row.resolved_at
        : new Date(String(row.resolved_at))
      : null,
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(String(row.updated_at || 0)),
  };
}

export class MonitorAlertHistoryRepository {
  async syncCurrentAlerts(alerts: InternalMonitorAlert[], observedAt: Date = new Date()): Promise<void> {
    const normalizedAlerts = Array.from(
      new Map(
        (alerts || [])
          .map((alert) => ({
            alertKey: String(alert.id || "").trim(),
            severity: String(alert.severity || "INFO").trim() || "INFO",
            source: String(alert.source || "").trim() || null,
            message: String(alert.message || "").trim() || "Monitor alert",
          }))
          .filter((alert) => alert.alertKey)
          .map((alert) => [alert.alertKey, alert] as const),
      ).values(),
    );

    await db.transaction(async (tx) => {
      for (const alert of normalizedAlerts) {
        await tx.execute(sql`
          INSERT INTO public.monitor_alert_incidents (
            id,
            alert_key,
            severity,
            source,
            message,
            status,
            first_seen_at,
            last_seen_at,
            resolved_at,
            updated_at
          )
          VALUES (
            ${randomUUID()},
            ${alert.alertKey},
            ${alert.severity},
            ${alert.source},
            ${alert.message},
            'open',
            ${observedAt},
            ${observedAt},
            null,
            ${observedAt}
          )
          ON CONFLICT (alert_key) WHERE status = 'open'
          DO UPDATE SET
            severity = EXCLUDED.severity,
            source = EXCLUDED.source,
            message = EXCLUDED.message,
            last_seen_at = EXCLUDED.last_seen_at,
            updated_at = EXCLUDED.updated_at
        `);
      }

      if (normalizedAlerts.length > 0) {
        const alertKeysSql = sql.join(normalizedAlerts.map((alert) => sql`${alert.alertKey}`), sql`, `);
        await tx.execute(sql`
          UPDATE public.monitor_alert_incidents
          SET
            status = 'resolved',
            resolved_at = ${observedAt},
            updated_at = ${observedAt}
          WHERE status = 'open'
            AND alert_key NOT IN (${alertKeysSql})
        `);
      } else {
        await tx.execute(sql`
          UPDATE public.monitor_alert_incidents
          SET
            status = 'resolved',
            resolved_at = ${observedAt},
            updated_at = ${observedAt}
          WHERE status = 'open'
        `);
      }
    });
  }

  async listRecentPage(options?: {
    page?: number;
    pageSize?: number;
  }): Promise<MonitorAlertIncidentPage> {
    const safePage = Number.isFinite(options?.page)
      ? Math.max(1, Math.floor(Number(options?.page)))
      : 1;
    const safePageSize = Number.isFinite(options?.pageSize)
      ? Math.min(100, Math.max(1, Math.floor(Number(options?.pageSize))))
      : 25;
    const offset = (safePage - 1) * safePageSize;

    const [countResult, rowsResult] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS total_items
        FROM public.monitor_alert_incidents
      `),
      db.execute(sql`
        SELECT
          id,
          alert_key,
          severity,
          source,
          message,
          status,
          first_seen_at,
          last_seen_at,
          resolved_at,
          updated_at
        FROM public.monitor_alert_incidents
        ORDER BY COALESCE(resolved_at, last_seen_at) DESC, updated_at DESC
        LIMIT ${safePageSize}
        OFFSET ${offset}
      `),
    ]);

    const totalItems = Number((countResult.rows?.[0] as Record<string, unknown> | undefined)?.total_items ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));

    return {
      incidents: (rowsResult.rows || []).map((row) => mapMonitorAlertIncidentRow(row as Record<string, unknown>)),
      pagination: {
        page: Math.min(safePage, totalPages),
        pageSize: safePageSize,
        totalItems,
        totalPages,
      },
    };
  }

  async deleteResolvedOlderThan(cutoffDate: Date): Promise<number> {
    const result = await db.execute(sql`
      DELETE FROM public.monitor_alert_incidents
      WHERE status = 'resolved'
        AND resolved_at IS NOT NULL
        AND resolved_at < ${cutoffDate}
    `);
    return Number(result.rowCount ?? 0);
  }
}
