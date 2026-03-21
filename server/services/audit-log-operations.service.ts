import { readInteger } from "../http/validation";
import type { AuditRepository } from "../repositories/audit.repository";
import type { PostgresStorage } from "../storage-postgres";

type AuditLogOperationsStorage = Pick<PostgresStorage, "createAuditLog">;
type AuditLogOperationsRepository = Pick<
  AuditRepository,
  "cleanupAuditLogsOlderThan" | "getAuditLogStats" | "getAuditLogs"
>;

export class AuditLogOperationsService {
  constructor(
    private readonly storage: AuditLogOperationsStorage,
    private readonly auditRepository: AuditLogOperationsRepository,
  ) {}

  async listAuditLogs() {
    return {
      logs: await this.auditRepository.getAuditLogs(),
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
