import { asyncHandler } from "../http/async-handler";
import type { OperationsRouteContext } from "./operations-route-context";

export function registerOperationsBackupRoutes(context: OperationsRouteContext) {
  const {
    app,
    operationsController,
    authenticateToken,
    requireRole,
    requireTabAccess,
  } = context;

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
}
