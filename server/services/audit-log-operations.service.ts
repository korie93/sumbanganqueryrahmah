import { readDate, readInteger, readOptionalString } from "../http/validation";
import type { AuditRepository } from "../repositories/audit.repository";
import type { PostgresStorage } from "../storage-postgres";

type AuditLogOperationsStorage = Pick<PostgresStorage, "createAuditLog">;
type AuditLogOperationsRepository = Pick<
  AuditRepository,
  "cleanupAuditLogsOlderThan" | "getAuditLogStats" | "getAuditLogs" | "listAuditLogsPage"
>;

export class AuditLogOperationsService {
  constructor(
    private readonly storage: AuditLogOperationsStorage,
    private readonly auditRepository: AuditLogOperationsRepository,
  ) {}

  async listAuditLogs(query: Record<string, unknown>) {
    const page = Math.max(1, readInteger(query.page, 1));
    const pageSize = Math.max(1, Math.min(100, readInteger(query.pageSize, 50)));
    const result = await this.auditRepository.listAuditLogsPage({
      page,
      pageSize,
      action: readOptionalString(query.action),
      performedBy: readOptionalString(query.performedBy),
      targetUser: readOptionalString(query.targetUser),
      search: readOptionalString(query.search),
      dateFrom: readDate(query.dateFrom),
      dateTo: readDate(query.dateTo),
      sortBy: String(readOptionalString(query.sortBy) || "newest").toLowerCase() === "oldest"
        ? "oldest"
        : "newest",
    });

    return {
      logs: result.logs,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  async getAuditLogStats() {
    return this.auditRepository.getAuditLogStats();
  }

  async cleanupAuditLogs(params: { olderThanDays?: unknown; username?: string }) {
    const olderThanDays = Math.max(1, readInteger(params.olderThanDays, 30));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const deletedCount = await this.auditRepository.cleanupAuditLogsOlderThan(cutoffDate);

    await this.storage.createAuditLog({
      action: "CLEANUP_AUDIT_LOGS",
      performedBy: params.username || "system",
      details: `Cleanup requested for logs older than ${olderThanDays} days`,
    });

    return {
      success: true,
      deletedCount,
      message: "Cleanup completed",
    };
  }
}
