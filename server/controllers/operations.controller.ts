import type { Response } from "express";
import type { WebSocket } from "ws";
import type { AuthenticatedRequest } from "../auth/guards";
import { ensureObject } from "../http/validation";
import type { AuditLogOperationsService } from "../services/audit-log-operations.service";
import type { BackupOperationsService } from "../services/backup-operations.service";
import type { OperationsAnalyticsService } from "../services/operations-analytics.service";

type CreateOperationsControllerDeps = {
  auditLogOperationsService: Pick<
    AuditLogOperationsService,
    "cleanupAuditLogs" | "getAuditLogStats" | "listAuditLogs"
  >;
  backupOperationsService: Pick<
    BackupOperationsService,
    | "createBackup"
    | "deleteBackup"
    | "exportBackup"
    | "getBackupMetadata"
    | "listBackups"
    | "restoreBackup"
  >;
  operationsAnalyticsService: Pick<
    OperationsAnalyticsService,
    | "getDashboardSummary"
    | "getLoginTrends"
    | "getPeakHours"
    | "getRoleDistribution"
    | "getTopActiveUsers"
  >;
  connectedClients: Map<string, WebSocket>;
};

export type OperationsController = ReturnType<typeof createOperationsController>;

export function createOperationsController(deps: CreateOperationsControllerDeps) {
  const {
    auditLogOperationsService,
    backupOperationsService,
    operationsAnalyticsService,
    connectedClients,
  } = deps;

  const listAuditLogs = async (req: AuthenticatedRequest, res: Response) => {
    return res.json(await auditLogOperationsService.listAuditLogs(req.query as Record<string, unknown>));
  };

  const getAuditLogStats = async (_req: AuthenticatedRequest, res: Response) => {
    return res.json(await auditLogOperationsService.getAuditLogStats());
  };

  const cleanupAuditLogs = async (req: AuthenticatedRequest, res: Response) => {
    const body = ensureObject(req.body) || {};
    return res.json(
      await auditLogOperationsService.cleanupAuditLogs({
        olderThanDays: body.olderThanDays,
        username: req.user?.username,
      }),
    );
  };

  const getDashboardSummary = async (_req: AuthenticatedRequest, res: Response) => {
    return res.json(await operationsAnalyticsService.getDashboardSummary());
  };

  const getLoginTrends = async (req: AuthenticatedRequest, res: Response) => {
    return res.json(await operationsAnalyticsService.getLoginTrends(req.query.days));
  };

  const getTopActiveUsers = async (req: AuthenticatedRequest, res: Response) => {
    return res.json(await operationsAnalyticsService.getTopActiveUsers(req.query.limit));
  };

  const getPeakHours = async (_req: AuthenticatedRequest, res: Response) => {
    return res.json(await operationsAnalyticsService.getPeakHours());
  };

  const getRoleDistribution = async (_req: AuthenticatedRequest, res: Response) => {
    return res.json(await operationsAnalyticsService.getRoleDistribution());
  };

  const listBackups = async (req: AuthenticatedRequest, res: Response) => {
    return res.json(await backupOperationsService.listBackups(req.query as Record<string, unknown>));
  };

  const createBackup = async (req: AuthenticatedRequest, res: Response) => {
    const body = ensureObject(req.body) || {};
    const result = await backupOperationsService.createBackup({
      name: String(body.name || ""),
      username: req.user!.username,
    });
    return res.status(result.statusCode).json(result.body);
  };

  const getBackup = async (req: AuthenticatedRequest, res: Response) => {
    const result = await backupOperationsService.getBackupMetadata(req.params.id, req.user!.username);
    return res.status(result.statusCode).json(result.body);
  };

  const exportBackup = async (req: AuthenticatedRequest, res: Response) => {
    const result = await backupOperationsService.exportBackup(req.params.id, req.user!.username);
    if (result.statusCode !== 200 || !("fileName" in result.body) || !("payloadJson" in result.body)) {
      return res.status(result.statusCode).json(result.body);
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="${result.body.fileName}"`);
    return res.status(200).send(result.body.payloadJson);
  };

  const restoreBackup = async (req: AuthenticatedRequest, res: Response) => {
    const result = await backupOperationsService.restoreBackup({
      backupId: req.params.id,
      username: req.user!.username,
    });
    return res.status(result.statusCode).json(result.body);
  };

  const deleteBackup = async (req: AuthenticatedRequest, res: Response) => {
    const result = await backupOperationsService.deleteBackup({
      backupId: req.params.id,
      username: req.user!.username,
    });
    return res.status(result.statusCode).json(result.body);
  };

  const getWebsocketClients = async (_req: AuthenticatedRequest, res: Response) => {
    const clients = Array.from(connectedClients.keys());
    return res.json({ count: clients.length, clients });
  };

  return {
    listAuditLogs,
    getAuditLogStats,
    cleanupAuditLogs,
    getDashboardSummary,
    getLoginTrends,
    getTopActiveUsers,
    getPeakHours,
    getRoleDistribution,
    listBackups,
    createBackup,
    getBackup,
    exportBackup,
    restoreBackup,
    deleteBackup,
    getWebsocketClients,
  };
}
