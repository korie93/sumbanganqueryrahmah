import type { Express, RequestHandler, Response } from "express";
import type { WebSocket } from "ws";
import type { AuthenticatedRequest } from "../auth/guards";
import { asyncHandler } from "../http/async-handler";
import { ensureObject, readInteger } from "../http/validation";
import type { AnalyticsRepository } from "../repositories/analytics.repository";
import type { AuditRepository } from "../repositories/audit.repository";
import type { BackupsRepository } from "../repositories/backups.repository";
import type { PostgresStorage } from "../storage-postgres";

type OperationsRouteDeps = {
  storage: PostgresStorage;
  auditRepository: AuditRepository;
  backupsRepository: BackupsRepository;
  analyticsRepository: AnalyticsRepository;
  authenticateToken: RequestHandler;
  requireRole: (...roles: string[]) => RequestHandler;
  requireTabAccess: (tabId: string) => RequestHandler;
  withExportCircuit: <T>(fn: () => Promise<T>) => Promise<T>;
  isExportCircuitOpenError: (error: unknown) => boolean;
  connectedClients: Map<string, WebSocket>;
};

export function registerOperationsRoutes(app: Express, deps: OperationsRouteDeps) {
  const {
    storage,
    auditRepository,
    backupsRepository,
    analyticsRepository,
    authenticateToken,
    requireRole,
    requireTabAccess,
    withExportCircuit,
    isExportCircuitOpenError,
    connectedClients,
  } = deps;

  app.get(
    "/api/audit-logs",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("audit-logs"),
    asyncHandler(async (_req, res) => {
      return res.json({ logs: await auditRepository.getAuditLogs() });
    }),
  );

  app.get(
    "/api/audit-logs/stats",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("audit-logs"),
    asyncHandler(async (_req, res) => {
      return res.json(await auditRepository.getAuditLogStats());
    }),
  );

  app.delete(
    "/api/audit-logs/cleanup",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("audit-logs"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = ensureObject(req.body) || {};
      const olderThanDays = Math.max(1, readInteger(body.olderThanDays, 30));
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const deletedCount = await auditRepository.cleanupAuditLogsOlderThan(cutoffDate);

      await storage.createAuditLog({
        action: "CLEANUP_AUDIT_LOGS",
        performedBy: req.user?.username || "system",
        details: `Cleanup requested for logs older than ${olderThanDays} days`,
      });

      return res.json({
        success: true,
        deletedCount,
        message: "Cleanup completed",
      });
    }),
  );

  app.get(
    "/api/analytics/summary",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(async (_req, res) => {
      return res.json(await analyticsRepository.getDashboardSummary());
    }),
  );

  app.get(
    "/api/analytics/login-trends",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(async (req, res) => {
      const days = Math.max(1, readInteger(req.query.days, 7));
      return res.json(await analyticsRepository.getLoginTrends(days));
    }),
  );

  app.get(
    "/api/analytics/top-users",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(async (req, res) => {
      const limit = Math.max(1, readInteger(req.query.limit, 10));
      return res.json(await analyticsRepository.getTopActiveUsers(limit));
    }),
  );

  app.get(
    "/api/analytics/peak-hours",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(async (_req, res) => {
      return res.json(await analyticsRepository.getPeakHours());
    }),
  );

  app.get(
    "/api/analytics/role-distribution",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    asyncHandler(async (_req, res) => {
      return res.json(await analyticsRepository.getRoleDistribution());
    }),
  );

  app.get(
    "/api/backups",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("backup"),
    asyncHandler(async (_req, res) => {
      return res.json({ backups: await backupsRepository.getBackups() });
    }),
  );

  app.post(
    "/api/backups",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("backup"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const body = ensureObject(req.body) || {};
      const name = String(body.name || "");

      let backup;
      try {
        backup = await withExportCircuit(async () => {
          const startTime = Date.now();
          const backupData = await backupsRepository.getBackupDataForExport();
          const metadata = {
            timestamp: new Date().toISOString(),
            importsCount: backupData.imports.length,
            dataRowsCount: backupData.dataRows.length,
            usersCount: backupData.users.length,
            auditLogsCount: backupData.auditLogs.length,
          };
          const created = await backupsRepository.createBackup({
            name,
            createdBy: req.user!.username,
            backupData: JSON.stringify(backupData),
            metadata: JSON.stringify(metadata),
          });
          await storage.createAuditLog({
            action: "CREATE_BACKUP",
            performedBy: req.user!.username,
            targetResource: name,
            details: JSON.stringify({
              ...metadata,
              durationMs: Date.now() - startTime,
            }),
          });
          return created;
        });
      } catch (error) {
        if (isExportCircuitOpenError(error)) {
          return res.status(503).json({ message: "Export circuit is OPEN. Retry later." });
        }
        throw error;
      }

      return res.json(backup);
    }),
  );

  app.get(
    "/api/backups/:id",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("backup"),
    asyncHandler(async (req, res) => {
      const backup = await backupsRepository.getBackupById(req.params.id);
      if (!backup) {
        return res.status(404).json({ message: "Backup not found" });
      }
      return res.json(backup);
    }),
  );

  app.post(
    "/api/backups/:id/restore",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("backup"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      let backup;
      try {
        backup = await withExportCircuit(() => backupsRepository.getBackupById(req.params.id));
      } catch (error) {
        if (isExportCircuitOpenError(error)) {
          return res.status(503).json({ message: "Export circuit is OPEN. Retry later." });
        }
        throw error;
      }

      if (!backup) {
        return res.status(404).json({ message: "Backup not found" });
      }

      let result;
      try {
        result = await withExportCircuit(async () => {
          const startTime = Date.now();
          const backupData = JSON.parse(backup.backupData);
          const restored = await backupsRepository.restoreFromBackup(backupData);
          await storage.createAuditLog({
            action: "RESTORE_BACKUP",
            performedBy: req.user!.username,
            targetResource: backup.name,
            details: JSON.stringify({
              ...restored.stats,
              durationMs: Date.now() - startTime,
            }),
          });
          return { restored, startTime };
        });
      } catch (error) {
        if (isExportCircuitOpenError(error)) {
          return res.status(503).json({ message: "Export circuit is OPEN. Retry later." });
        }
        throw error;
      }

      return res.json({
        ...result.restored,
        message: `Restore completed in ${Math.round((Date.now() - result.startTime) / 1000)}s`,
      });
    }),
  );

  app.delete(
    "/api/backups/:id",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("backup"),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      let backup;
      let deleted;

      try {
        backup = await withExportCircuit(() => backupsRepository.getBackupById(req.params.id));
        deleted = await withExportCircuit(() => backupsRepository.deleteBackup(req.params.id));
      } catch (error) {
        if (isExportCircuitOpenError(error)) {
          return res.status(503).json({ message: "Export circuit is OPEN. Retry later." });
        }
        throw error;
      }

      if (!deleted) {
        return res.status(404).json({ message: "Backup not found" });
      }

      await storage.createAuditLog({
        action: "DELETE_BACKUP",
        performedBy: req.user!.username,
        targetResource: backup?.name || req.params.id,
      });

      return res.json({ success: true });
    }),
  );

  app.get("/api/debug/websocket-clients", authenticateToken, requireRole("superuser"), asyncHandler(async (_req, res) => {
    const clients = Array.from(connectedClients.keys());
    return res.json({ count: clients.length, clients });
  }));
}
