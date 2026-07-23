import type { Response } from "express";
import type { WebSocket } from "ws";
import { runWithRequestDeadline } from "../http/request-deadline";
import { buildApiErrorResponse } from "../http/api-error-response";
import type { AuthenticatedRequest } from "../auth/guards";
import { ensureObject, readQueryObject, readRouteParam } from "../http/validation";
import type { AuditLogOperationsService } from "../services/audit-log-operations.service";
import type { BackupJobQueueService } from "../services/backup-job-queue.service";
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
  backupJobQueueService: Pick<BackupJobQueueService, "enqueue" | "getJob">;
  operationsAnalyticsService: Pick<
    OperationsAnalyticsService,
    | "getDashboardSummary"
    | "getLoginTrends"
    | "getPeakHours"
    | "getRecentLoginActivity"
    | "getRecentLoginActivityPage"
    | "getRoleDistribution"
    | "getTopActiveUsers"
  >;
  connectedClients: Map<string, WebSocket>;
  requestTimeouts?: {
    backupOperationMs?: number | undefined;
  };
};

export type OperationsController = ReturnType<typeof createOperationsController>;

export function createOperationsController(deps: CreateOperationsControllerDeps) {
  const {
    auditLogOperationsService,
    backupOperationsService,
    backupJobQueueService,
    operationsAnalyticsService,
    connectedClients,
    requestTimeouts,
  } = deps;

  const isAsyncJobRequested = (value: unknown) => {
    const candidate = Array.isArray(value) ? value[0] : value;
    const normalized = String(candidate ?? "").trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  };

  const listAuditLogs = async (req: AuthenticatedRequest, res: Response) => {
    return res.json(await auditLogOperationsService.listAuditLogs(readQueryObject(req.query)));
  };

  const getAuditLogStats = async (_req: AuthenticatedRequest, res: Response) => {
    return res.json(await auditLogOperationsService.getAuditLogStats());
  };

  const cleanupAuditLogs = async (req: AuthenticatedRequest, res: Response) => {
    const body = ensureObject(req.body) || {};
    return res.json(
      await auditLogOperationsService.cleanupAuditLogs({
        olderThanDays: body.olderThanDays,
        ...(req.user?.username ? { username: req.user.username } : {}),
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
    return res.json(
      await operationsAnalyticsService.getTopActiveUsers(req.query.pageSize ?? req.query.limit),
    );
  };

  const getRecentLoginActivity = async (req: AuthenticatedRequest, res: Response) => {
    return res.json(
      await operationsAnalyticsService.getRecentLoginActivity(
        req.query.pageSize ?? req.query.limit,
        req.user?.role,
      ),
    );
  };

  const getRecentLoginActivityPage = async (req: AuthenticatedRequest, res: Response) => {
    return res.json(
      await operationsAnalyticsService.getRecentLoginActivityPage(
        readQueryObject(req.query),
        req.user?.role,
      ),
    );
  };

  const getPeakHours = async (_req: AuthenticatedRequest, res: Response) => {
    return res.json(await operationsAnalyticsService.getPeakHours());
  };

  const getRoleDistribution = async (_req: AuthenticatedRequest, res: Response) => {
    return res.json(await operationsAnalyticsService.getRoleDistribution());
  };

  const listBackups = async (req: AuthenticatedRequest, res: Response) => {
    return res.json(await backupOperationsService.listBackups(readQueryObject(req.query)));
  };

  const createBackup = async (req: AuthenticatedRequest, res: Response) => {
    const body = ensureObject(req.body) || {};
    if (isAsyncJobRequested(req.query.async)) {
      const job = await backupJobQueueService.enqueue({
        type: "create",
        requestedBy: req.user!.username,
        backupName: String(body.name || ""),
      });
      return res.status(202).json({
        message: "Backup creation queued.",
        job,
      });
    }

    const outcome = await runWithRequestDeadline(
      res,
      {
        timeoutMs: requestTimeouts?.backupOperationMs ?? 120_000,
        operationName: "backup-create",
        timeoutMessage:
          "Backup creation is taking longer than expected. Please retry or use the async backup queue.",
      },
      () =>
        backupOperationsService.createBackup({
          name: String(body.name || ""),
          username: req.user!.username,
        }),
    );
    if (outcome.timedOut) {
      return;
    }

    const result = outcome.value;
    return res.status(result.statusCode).json(result.body);
  };

  const getBackup = async (req: AuthenticatedRequest, res: Response) => {
    const backupId = readRouteParam(req.params.id, "backup id");
    const result = await backupOperationsService.getBackupMetadata(backupId, req.user!.username);
    return res.status(result.statusCode).json(result.body);
  };

  const getBackupJob = async (req: AuthenticatedRequest, res: Response) => {
    const jobId = readRouteParam(req.params.jobId, "backup job id");
    const job = await backupJobQueueService.getJob(jobId);
    if (!job) {
      return res.status(404).json(buildApiErrorResponse("Backup job not found", {
        statusCode: 404,
      }));
    }
    return res.status(200).json(job);
  };

  const exportBackup = async (req: AuthenticatedRequest, res: Response) => {
    const backupId = readRouteParam(req.params.id, "backup id");
    const outcome = await runWithRequestDeadline(
      res,
      {
        timeoutMs: requestTimeouts?.backupOperationMs ?? 120_000,
        operationName: "backup-export",
        timeoutMessage:
          "Backup export is taking longer than expected. Please retry in a moment.",
      },
      () => backupOperationsService.exportBackup(backupId, req.user!.username),
    );
    if (outcome.timedOut) {
      return;
    }

    const result = outcome.value;
    if (
      result.statusCode !== 200
      || !("fileName" in result.body)
      || !("payloadPrefixJson" in result.body)
      || !("backupDataJsonChunks" in result.body)
      || !("payloadSuffixJson" in result.body)
    ) {
      return res.status(result.statusCode).json(result.body);
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="${result.body.fileName}"`);
    res.status(200);
    res.write(result.body.payloadPrefixJson);
    for await (const chunk of result.body.backupDataJsonChunks) {
      if (chunk) {
        res.write(chunk);
      }
    }
    res.end(result.body.payloadSuffixJson);
    return;
  };

  const restoreBackup = async (req: AuthenticatedRequest, res: Response) => {
    const backupId = readRouteParam(req.params.id, "backup id");
    if (isAsyncJobRequested(req.query.async)) {
      const job = await backupJobQueueService.enqueue({
        type: "restore",
        requestedBy: req.user!.username,
        backupId,
      });
      return res.status(202).json({
        message: "Backup restore queued.",
        job,
      });
    }

    const outcome = await runWithRequestDeadline(
      res,
      {
        timeoutMs: requestTimeouts?.backupOperationMs ?? 120_000,
        operationName: "backup-restore",
        timeoutMessage:
          "Backup restore is taking longer than expected. Please retry or use the async backup queue.",
      },
      () =>
        backupOperationsService.restoreBackup({
          backupId,
          username: req.user!.username,
        }),
    );
    if (outcome.timedOut) {
      return;
    }

    const result = outcome.value;
    return res.status(result.statusCode).json(result.body);
  };

  const deleteBackup = async (req: AuthenticatedRequest, res: Response) => {
    const backupId = readRouteParam(req.params.id, "backup id");
    const result = await backupOperationsService.deleteBackup({
      backupId,
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
    getRecentLoginActivity,
    getRecentLoginActivityPage,
    getPeakHours,
    getRoleDistribution,
    listBackups,
    createBackup,
    getBackup,
    getBackupJob,
    exportBackup,
    restoreBackup,
    deleteBackup,
    getWebsocketClients,
  };
}
