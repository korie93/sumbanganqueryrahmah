import { readBoundedPageSize, readDate, readOptionalString, readPositivePage } from "../http/validation";
import type { AuditRepository } from "../repositories/audit.repository";
import type { PostgresStorage } from "../storage-postgres";

const AUDIT_LOGS_MAX_PAGE_SIZE = 100;

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
    const page = readPositivePage(query.page, 1);
    const pageSize = readBoundedPageSize(query.pageSize, 50, AUDIT_LOGS_MAX_PAGE_SIZE);
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
    const offset = (result.page - 1) * result.pageSize;

    return {
      logs: result.logs,
      pagination: {
        mode: "offset" as const,
        page: result.page,
        pageSize: result.pageSize,
        limit: result.pageSize,
        offset,
        total: result.total,
        totalPages: result.totalPages,
        hasNextPage: result.page < result.totalPages,
        hasPreviousPage: result.page > 1,
      },
    };
  }

  async getAuditLogStats() {
    return this.auditRepository.getAuditLogStats();
  }

  async cleanupAuditLogs(params: { olderThanDays?: unknown; username?: string }) {
    const olderThanDays = readPositivePage(params.olderThanDays, 30);
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
