import type { Express, RequestHandler } from "express";
import type { OperationsController } from "../controllers/operations.controller";
import { asyncHandler } from "../http/async-handler";

type OperationsRouteDeps = {
  operationsController: OperationsController;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
};

export function registerOperationsRoutes(app: Express, deps: OperationsRouteDeps) {
  const {
    operationsController,
    authenticateToken,
    requireRole,
    requireTabAccess,
  } = deps;

  app.get(
    "/api/audit-logs",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("audit-logs"),
    asyncHandler(operationsController.listAuditLogs),
  );

  app.get(
    "/api/audit-logs/stats",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("audit-logs"),
    asyncHandler(operationsController.getAuditLogStats),
  );

  app.delete(
    "/api/audit-logs/cleanup",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("audit-logs"),
    asyncHandler(operationsController.cleanupAuditLogs),
  );

  app.get(
    "/api/analytics/summary",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(operationsController.getDashboardSummary),
  );

  app.get(
    "/api/analytics/login-trends",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(operationsController.getLoginTrends),
  );

  app.get(
    "/api/analytics/top-users",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(operationsController.getTopActiveUsers),
  );

  app.get(
    "/api/analytics/peak-hours",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(operationsController.getPeakHours),
  );

  app.get(
    "/api/analytics/role-distribution",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(operationsController.getRoleDistribution),
  );

  app.get(
    "/api/backups",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("backup"),
    asyncHandler(operationsController.listBackups),
  );

  app.post(
    "/api/backups",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("backup"),
    asyncHandler(operationsController.createBackup),
  );

  app.get(
    "/api/backups/jobs/:jobId",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("backup"),
    asyncHandler(operationsController.getBackupJob),
  );

  app.get(
    "/api/backups/:id",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("backup"),
    asyncHandler(operationsController.getBackup),
  );

  app.get(
    "/api/backups/:id/export",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("backup"),
    asyncHandler(operationsController.exportBackup),
  );

  app.post(
    "/api/backups/:id/restore",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("backup"),
    asyncHandler(operationsController.restoreBackup),
  );

  app.delete(
    "/api/backups/:id",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("backup"),
    asyncHandler(operationsController.deleteBackup),
  );

  app.get("/api/debug/websocket-clients", authenticateToken, requireRole("superuser"), asyncHandler(operationsController.getWebsocketClients));
}
