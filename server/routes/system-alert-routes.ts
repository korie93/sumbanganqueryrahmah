import type { AuthenticatedRequest } from "../auth/guards";
import { asyncHandler, routeHandler } from "../http/async-handler";
import {
  buildPaginationMetadata,
  clampOffsetPaginationToTotal,
  parseOffsetPaginationQuery,
  toDbOffset,
} from "../utils/pagination";
import type { SystemRouteContext } from "./system-route-context";

function readCleanupDays(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(3650, Math.max(1, Math.floor(parsed)))
    : fallback;
}

export function registerSystemAlertRoutes(context: SystemRouteContext) {
  const {
    app,
    authenticateToken,
    requireRole,
    requireMonitorAccess,
    computeInternalMonitorSnapshot,
    buildInternalMonitorAlerts,
    listMonitorAlertHistory,
    deleteMonitorAlertHistoryOlderThan,
    createAuditLog,
  } = context;

  app.get(
    "/internal/alerts",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    routeHandler((req, res) => {
      const snapshot = computeInternalMonitorSnapshot();
      const alerts = buildInternalMonitorAlerts(snapshot);
      const requestedPagination = parseOffsetPaginationQuery(req.query, {
        defaultLimit: 5,
        maxLimit: 100,
      });
      const totalItems = alerts.length;
      const pagination = clampOffsetPaginationToTotal(requestedPagination, totalItems);
      const { offset, limit } = toDbOffset(pagination);
      const metadata = buildPaginationMetadata(totalItems, pagination);
      res.json({
        alerts: alerts.slice(offset, offset + limit),
        pagination: {
          page: metadata.page,
          pageSize: metadata.pageSize,
          totalItems,
          totalPages: metadata.totalPages,
        },
        updatedAt: snapshot.updatedAt,
      });
    }),
  );

  app.get(
    "/internal/alerts/history",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    asyncHandler(async (req, res) => {
      const pagination = parseOffsetPaginationQuery(req.query, {
        defaultLimit: 5,
        maxLimit: 100,
      });
      const incidents = await listMonitorAlertHistory({
        page: pagination.page,
        pageSize: pagination.pageSize,
      });
      res.json({
        incidents: incidents.incidents,
        pagination: incidents.pagination,
        updatedAt: new Date().toISOString(),
      });
    }),
  );

  app.delete(
    "/internal/alerts/history",
    authenticateToken,
    requireRole("superuser"),
    requireMonitorAccess,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
      const olderThanDays = readCleanupDays(req.body?.olderThanDays, 30);
      const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
      const deletedCount = await deleteMonitorAlertHistoryOlderThan(cutoffDate);

      await createAuditLog({
        action: "MONITOR_ALERT_HISTORY_CLEANUP",
        performedBy: req.user?.username || "system",
        details: `Deleted ${deletedCount} resolved monitor alert incidents older than ${olderThanDays} days.`,
      });

      res.json({
        ok: true,
        deletedCount,
        olderThanDays,
        updatedAt: new Date().toISOString(),
      });
    }),
  );
}
