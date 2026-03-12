import type { Express, RequestHandler, Response } from "express";
import type { WebSocket } from "ws";
import type { AuthenticatedRequest } from "../auth/guards";
import { ensureObject } from "../http/validation";
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
    async (_req, res) => {
      try {
        return res.json({ logs: await auditRepository.getAuditLogs() });
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to load audit logs" });
      }
    },
  );

  app.get(
    "/api/audit-logs/stats",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("audit-logs"),
    async (_req, res) => {
      try {
        return res.json(await auditRepository.getAuditLogStats());
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to load audit log stats" });
      }
    },
  );

  app.delete(
    "/api/audit-logs/cleanup",
    authenticateToken,
    requireRole("superuser"),
    requireTabAccess("audit-logs"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const body = ensureObject(req.body) || {};
        const olderThanDays = Number(body.olderThanDays || 30);
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
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to cleanup audit logs" });
      }
    },
  );

  app.get(
    "/api/analytics/summary",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    async (_req, res) => {
      try {
        return res.json(await analyticsRepository.getDashboardSummary());
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to load analytics summary" });
      }
    },
  );

  app.get(
    "/api/analytics/login-trends",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    async (req, res) => {
      try {
        const days = Number(req.query.days || 7);
        return res.json(await analyticsRepository.getLoginTrends(days));
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to load login trends" });
      }
    },
  );

  app.get(
    "/api/analytics/top-users",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    async (req, res) => {
      try {
        const limit = Number(req.query.limit || 10);
        return res.json(await analyticsRepository.getTopActiveUsers(limit));
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to load top users" });
      }
    },
  );

  app.get(
    "/api/analytics/peak-hours",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    async (_req, res) => {
      try {
        return res.json(await analyticsRepository.getPeakHours());
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to load peak hours" });
      }
    },
  );

  app.get(
    "/api/analytics/role-distribution",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("dashboard"),
    async (_req, res) => {
      try {
        return res.json(await analyticsRepository.getRoleDistribution());
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to load role distribution" });
      }
    },
  );

  app.get(
    "/api/backups",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("backup"),
    async (_req, res) => {
      try {
        return res.json({ backups: await backupsRepository.getBackups() });
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to load backups" });
      }
    },
  );

  app.post(
    "/api/backups",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("backup"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const body = ensureObject(req.body) || {};
        const name = String(body.name || "");
        const backup = await withExportCircuit(async () => {
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

        return res.json(backup);
      } catch (error) {
        if (isExportCircuitOpenError(error)) {
          return res.status(503).json({ message: "Export circuit is OPEN. Retry later." });
        }
        return res.status(500).json({ message: "Failed to create backup" });
      }
    },
  );

  app.get(
    "/api/backups/:id",
    authenticateToken,
    requireRole("user", "admin", "superuser"),
    requireTabAccess("backup"),
    async (req, res) => {
      try {
        const backup = await backupsRepository.getBackupById(req.params.id);
        if (!backup) {
          return res.status(404).json({ message: "Backup not found" });
        }
        return res.json(backup);
      } catch (error: any) {
        return res.status(500).json({ message: error?.message || "Failed to load backup" });
      }
    },
  );

  app.post(
    "/api/backups/:id/restore",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("backup"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const backup = await withExportCircuit(() => backupsRepository.getBackupById(req.params.id));
        if (!backup) {
          return res.status(404).json({ message: "Backup not found" });
        }

        const result = await withExportCircuit(async () => {
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

        return res.json({
          ...result.restored,
          message: `Restore completed in ${Math.round((Date.now() - result.startTime) / 1000)}s`,
        });
      } catch (error) {
        if (isExportCircuitOpenError(error)) {
          return res.status(503).json({ message: "Export circuit is OPEN. Retry later." });
        }
        return res.status(500).json({ message: "Failed to restore backup" });
      }
    },
  );

  app.delete(
    "/api/backups/:id",
    authenticateToken,
    requireRole("admin", "superuser"),
    requireTabAccess("backup"),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const backup = await withExportCircuit(() => backupsRepository.getBackupById(req.params.id));
        const deleted = await withExportCircuit(() => backupsRepository.deleteBackup(req.params.id));
        if (!deleted) {
          return res.status(404).json({ message: "Backup not found" });
        }

        await storage.createAuditLog({
          action: "DELETE_BACKUP",
          performedBy: req.user!.username,
          targetResource: backup?.name || req.params.id,
        });

        return res.json({ success: true });
      } catch (error) {
        if (isExportCircuitOpenError(error)) {
          return res.status(503).json({ message: "Export circuit is OPEN. Retry later." });
        }
        return res.status(500).json({ message: "Failed to delete backup" });
      }
    },
  );

  app.get("/api/debug/websocket-clients", authenticateToken, requireRole("superuser"), async (_req, res) => {
    try {
      const clients = Array.from(connectedClients.keys());
      return res.json({ count: clients.length, clients });
    } catch (error: any) {
      return res.status(500).json({ message: error?.message || "Failed to inspect websocket clients" });
    }
  });
}
