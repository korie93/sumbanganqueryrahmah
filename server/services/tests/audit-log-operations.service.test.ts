import assert from "node:assert/strict";
import test from "node:test";
import { AuditLogOperationsService } from "../audit-log-operations.service";

type AuditEntry = {
  action: string;
  performedBy?: string;
  details?: string;
};

test("AuditLogOperationsService cleanup clamps the cutoff and writes an audit log", async () => {
  const auditLogs: AuditEntry[] = [];
  const cleanupCalls: Date[] = [];
  const service = new AuditLogOperationsService(
    {
      createAuditLog: async (entry: AuditEntry) => {
        auditLogs.push(entry);
        return { id: `audit-${auditLogs.length}`, ...entry };
      },
    } as any,
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
    } as any,
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
  const logs = [
    {
      id: "audit-1",
      action: "LOGIN",
      performedBy: "super.user",
      targetUser: null,
      targetResource: null,
      details: "Logged in",
      timestamp: new Date("2026-03-19T10:00:00.000Z"),
    },
  ];
  const stats = {
    totalLogs: 12,
    todayLogs: 3,
    actionBreakdown: {
      LOGIN: 5,
    },
  };

  const service = new AuditLogOperationsService(
    {
      createAuditLog: async () => ({ id: "audit-2" }),
    } as any,
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
    } as any,
  );

  assert.deepEqual(await service.listAuditLogs({}), {
    logs,
    pagination: {
      page: 1,
      pageSize: 50,
      total: logs.length,
      totalPages: 1,
    },
  });
  assert.deepEqual(await service.getAuditLogStats(), stats);
});
