import type { AuthenticatedRequest } from "../auth/guards";
import { asyncHandler } from "../http/async-handler";
import type { SystemRouteContext } from "./system-route-context";

function readPositivePage(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback;
}

function readPageSize(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(100, Math.max(1, Math.floor(parsed)))
    : fallback;
}

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
    (req, res) => {
      const snapshot = computeInternalMonitorSnapshot();
      const alerts = buildInternalMonitorAlerts(snapshot);
      const page = readPositivePage(req.query.page, 1);
      const pageSize = readPageSize(req.query.pageSize, 5);
      const totalItems = alerts.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      const safePage = Math.min(page, totalPages);
      const startIndex = (safePage - 1) * pageSize;
      res.json({
        alerts: alerts.slice(startIndex, startIndex + pageSize),
        pagination: {
          page: safePage,
          pageSize,
          totalItems,
          totalPages,
        },
        updatedAt: snapshot.updatedAt,
      });
    },
  );

  app.get(
    "/internal/alerts/history",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireMonitorAccess,
    asyncHandler(async (req, res) => {
      const incidents = await listMonitorAlertHistory({
        page: readPositivePage(req.query.page, 1),
        pageSize: readPageSize(req.query.pageSize, 5),
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
