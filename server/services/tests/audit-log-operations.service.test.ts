import assert from "node:assert/strict";
import test from "node:test";
import { AuditLogOperationsService } from "../audit-log-operations.service";

type AuditLogOperationsStorage = ConstructorParameters<typeof AuditLogOperationsService>[0];
type AuditLogOperationsRepository = ConstructorParameters<typeof AuditLogOperationsService>[1];
type AuditEntry = Parameters<AuditLogOperationsStorage["createAuditLog"]>[0];
type AuditRow = Awaited<ReturnType<AuditLogOperationsRepository["getAuditLogs"]>>[number];

function createAuditRow(overrides: Partial<AuditRow> = {}): AuditRow {
  return {
    id: "audit-1",
    action: "LOGIN",
    performedBy: "super.user",
    requestId: null,
    targetUser: null,
    targetResource: null,
    details: "Logged in",
    timestamp: new Date("2026-03-19T10:00:00.000Z"),
    ...overrides,
  };
}

test("AuditLogOperationsService cleanup clamps the cutoff and writes an audit log", async () => {
  const auditLogs: AuditEntry[] = [];
  const cleanupCalls: Date[] = [];
  const service = new AuditLogOperationsService(
    {
      createAuditLog: async (entry: AuditEntry) => {
        auditLogs.push(entry);
        return createAuditRow({
          id: `audit-${auditLogs.length}`,
          action: entry.action,
          performedBy: entry.performedBy,
          details: entry.details ?? null,
          requestId: entry.requestId ?? null,
          targetUser: entry.targetUser ?? null,
          targetResource: entry.targetResource ?? null,
          timestamp: new Date("2026-03-20T00:00:00.000Z"),
        });
      },
    },
    {
      getAuditLogs: async () => [],
      listAuditLogsPage: async () => ({
        logs: [],
        page: 1,
        pageSize: 50,
        total: 0,
        totalPages: 1,
      }),
      getAuditLogStats: async () => ({
        totalLogs: 0,
        todayLogs: 0,
        actionBreakdown: {},
      }),
      cleanupAuditLogsOlderThan: async (cutoffDate: Date) => {
        cleanupCalls.push(cutoffDate);
        return 7;
      },
    },
  );

  const before = Date.now();
  const result = await service.cleanupAuditLogs({
    olderThanDays: 0,
    username: "super.user",
  });

  assert.deepEqual(result, {
    success: true,
    deletedCount: 7,
    message: "Cleanup completed",
  });
  assert.equal(cleanupCalls.length, 1);
  const hours = (before - cleanupCalls[0].getTime()) / (1000 * 60 * 60);
  assert.ok(hours >= 23 && hours <= 25);
  assert.deepEqual(auditLogs, [
    {
      action: "CLEANUP_AUDIT_LOGS",
      performedBy: "super.user",
      details: "Cleanup requested for logs older than 1 days",
    },
  ]);
});

test("AuditLogOperationsService proxies audit log reads through the repository", async () => {
  const logs = [createAuditRow()];
  const stats = {
    totalLogs: 12,
    todayLogs: 3,
    actionBreakdown: {
      LOGIN: 5,
    },
  };

  const service = new AuditLogOperationsService(
    {
      createAuditLog: async () => createAuditRow({ id: "audit-2" }),
    },
    {
      getAuditLogs: async () => logs,
      listAuditLogsPage: async () => ({
        logs,
        page: 1,
        pageSize: 50,
        total: logs.length,
        totalPages: 1,
      }),
      getAuditLogStats: async () => stats,
      cleanupAuditLogsOlderThan: async () => 0,
    },
  );

  assert.deepEqual(await service.listAuditLogs({}), {
    logs,
    pagination: {
      mode: "offset",
      page: 1,
      pageSize: 50,
      limit: 50,
      offset: 0,
      total: logs.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  });
  assert.deepEqual(await service.getAuditLogStats(), stats);
});
