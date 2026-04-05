import { asyncHandler } from "../http/async-handler";
import type { OperationsRouteContext } from "./operations-route-context";

export function registerOperationsAuditRoutes(context: OperationsRouteContext) {
  const {
    app,
    operationsController,
    authenticateToken,
    requireRole,
    requireTabAccess,
  } = context;

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
}
