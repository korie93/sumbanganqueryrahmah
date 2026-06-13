import assert from "node:assert/strict";
import test from "node:test";
import { logger } from "../../lib/logger";
import { createActivitySessionOperations } from "../activity-session-operations";
import type { ActivityStorage } from "../activity-service-types";

type ActivityRecord = NonNullable<Awaited<ReturnType<ActivityStorage["getActivityById"]>>>;
type AuditRecord = Awaited<ReturnType<ActivityStorage["createAuditLog"]>>;

function createStorageMock(overrides: Partial<ActivityStorage> = {}): ActivityStorage {
  return {
    banVisitor: async () => undefined,
    clearCollectionNicknameSessionByActivity: async () => undefined,
    createAuditLog: async () =>
      ({
        id: "audit-1",
        action: "TEST",
        performedBy: "tester",
        details: null,
        targetUser: null,
        timestamp: new Date("2026-04-08T00:00:00.000Z"),
        requestId: null,
        targetResource: null,
      }) as AuditRecord,
    cleanupActivityRetention: async () => ({
      deletedIds: [],
      lockAcquired: true,
      securityDeletedCount: 0,
      standardDeletedCount: 0,
    }),
    deactivateUserActivities: async () => undefined,
    deleteActivity: async () => true,
    deleteEndedActivitiesBefore: async () => [],
    getActiveActivities: async () => [],
    getActiveActivitiesByUsername: async () => [],
    getActivityById: async () => undefined,
    getActivityInvestigation: async () => undefined,
    getActivityRetentionPolicy: async () => ({
      autoCleanupEnabled: false,
      batchSize: 500,
      securityRetentionDays: 365,
      standardRetentionDays: 90,
    }),
    getActivityRetentionPreview: async () => ({
      protectedActiveBanCount: 0,
      securityEligibleCount: 0,
      standardEligibleCount: 0,
      totalEligibleCount: 0,
    }),
    getAllActivities: async () => [],
    listActivityPage: async (params) => ({
      activities: [],
      page: params.page,
      pageSize: params.pageSize,
      total: 0,
      totalPages: 1,
      summary: {
        idleCount: 0,
        kickedCount: 0,
        logoutCount: 0,
        onlineCount: 0,
      },
    }),
    getBannedSessions: async () => [],
    getFilteredActivities: async () => [],
    getUserByUsername: async () => undefined,
    unbanVisitor: async () => undefined,
    updateActivity: async () => undefined,
    updateUserBan: async () => undefined,
    ...overrides,
  };
}

function createActiveActivityRecord(activityId = "act-1"): ActivityRecord {
  return {
    id: activityId,
    userId: "user-1",
    username: "ali",
    role: "user",
    fingerprint: null,
    ipAddress: null,
    browser: null,
    isActive: true,
    pcName: null,
    loginTime: null,
    logoutTime: null,
    lastActivityTime: null,
    logoutReason: null,
  } as ActivityRecord;
}

function isPreLogoutFlushPatch(patch: unknown): boolean {
  return Boolean(
    patch
      && typeof patch === "object"
      && Object.prototype.hasOwnProperty.call(patch, "lastActivityTime")
      && !Object.prototype.hasOwnProperty.call(patch, "logoutTime"),
  );
}

test("logout flushes activity session state before marking the session inactive", async () => {
  const events: string[] = [];
  const operations = createActivitySessionOperations(
    createStorageMock({
      getActivityById: async () => createActiveActivityRecord(),
      updateActivity: async (_activityId, patch) => {
        events.push(isPreLogoutFlushPatch(patch) ? "flush" : "logout");
        return undefined;
      },
      createAuditLog: async (entry) => {
        events.push("audit");
        return {
          id: "audit-logout",
          ...entry,
          timestamp: new Date("2026-04-08T00:00:00.000Z"),
        } as AuditRecord;
      },
    }),
    async () => {
      events.push("close-socket");
    },
  );

  await operations.logout("act-1", "ali");

  assert.deepEqual(events, ["flush", "logout", "close-socket", "audit"]);
});

test("logout continues and logs when the pre-logout activity flush fails", async () => {
  const originalWarn = logger.warn;
  const events: string[] = [];
  const warnings: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  logger.warn = ((message: string, payload?: Record<string, unknown>) => {
    warnings.push({ message, payload });
  }) as typeof logger.warn;

  const operations = createActivitySessionOperations(
    createStorageMock({
      getActivityById: async () => createActiveActivityRecord(),
      updateActivity: async (_activityId, patch) => {
        if (isPreLogoutFlushPatch(patch)) {
          events.push("flush");
          throw new Error("last activity write failed");
        }

        events.push("logout");
        return undefined;
      },
      createAuditLog: async (entry) => {
        events.push("audit");
        return {
          id: "audit-logout",
          ...entry,
          timestamp: new Date("2026-04-08T00:00:00.000Z"),
        } as AuditRecord;
      },
    }),
    async () => {
      events.push("close-socket");
    },
  );

  try {
    await operations.logout("act-1", "ali");

    assert.deepEqual(events, ["flush", "logout", "close-socket", "audit"]);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "Activity session flush failed before logout; continuing logout");
    assert.equal(warnings[0].payload?.event, "activity_logout_flush_failed");
    assert.equal(warnings[0].payload?.errorType, "Error");
    assert.equal(String(warnings[0].payload?.activityIdHash || "").length, 16);
    assert.equal(JSON.stringify(warnings[0].payload).includes("act-1"), false);
  } finally {
    logger.warn = originalWarn;
  }
});

test("getActivityInvestigation masks persistent identifiers and exposes only safe audit metadata", async () => {
  const operations = createActivitySessionOperations(
    createStorageMock({
      getActivityInvestigation: async () => ({
        activity: {
          ...createActiveActivityRecord("act-investigate"),
          fingerprint: "sha256-device-fingerprint",
          browser: "Chrome 149",
          ipAddress: "127.0.0.1",
          pcName: "OPS-01",
          loginTime: new Date("2026-06-12T01:00:00.000Z"),
          lastActivityTime: new Date("2026-06-12T01:10:00.000Z"),
          status: "ONLINE",
        },
        activeBan: null,
        auditEvents: [
          {
            id: "audit-1",
            action: "LOGIN_SUCCESS",
            performedBy: "ali",
            requestId: "request-1",
            timestamp: new Date("2026-06-12T01:00:00.000Z"),
          },
        ],
        history: {
          activeConcurrentSessionCount: 0,
          priorMatchingFingerprintCount: 0,
          priorMatchingIpCount: 0,
          priorSessionCount: 0,
          sharedFingerprintAccountCount: 0,
          sharedIpAccountCount: 0,
        },
        relatedSessions: [],
        relatedSessionsPagination: {
          page: 1,
          pageSize: 5,
          total: 0,
          totalPages: 1,
        },
      }),
    }),
    async () => undefined,
  );

  const result = await operations.getActivityInvestigation("act-investigate");

  assert.equal(result?.session.device.fingerprintHint, "••••rprint");
  assert.equal(result?.security.riskLevel, "normal");
  assert.equal(result?.auditEvents[0]?.requestId, "request-1");
  assert.equal("details" in (result?.auditEvents[0] ?? {}), false);
  assert.equal(result?.timeline[0]?.label, "Session started");
});

test("getActivityInvestigation explains correlation risk without exposing raw related fingerprints", async () => {
  const operations = createActivitySessionOperations(
    createStorageMock({
      getActivityInvestigation: async () => ({
        activity: {
          ...createActiveActivityRecord("act-current"),
          browser: "Chrome 149",
          deviceType: "desktop",
          fingerprint: "current-device-fingerprint",
          ipAddress: "203.0.113.10",
          loginTime: new Date("2026-06-12T02:00:00.000Z"),
          platform: "Windows 11",
          status: "ONLINE",
        },
        activeBan: null,
        auditEvents: [],
        history: {
          activeConcurrentSessionCount: 1,
          priorMatchingFingerprintCount: 0,
          priorMatchingIpCount: 0,
          priorSessionCount: 4,
          sharedFingerprintAccountCount: 1,
          sharedIpAccountCount: 2,
        },
        relatedSessions: [
          {
            ...createActiveActivityRecord("act-related"),
            browser: "Chrome 149",
            deviceType: "desktop",
            fingerprint: "current-device-fingerprint",
            ipAddress: "203.0.113.10",
            loginTime: new Date("2026-06-12T01:30:00.000Z"),
            platform: "Windows 11",
            status: "ONLINE",
            userId: "user-2",
            username: "siti",
          },
        ],
        relatedSessionsPagination: {
          page: 1,
          pageSize: 5,
          total: 1,
          totalPages: 1,
        },
      }),
    }),
    async () => undefined,
  );

  const result = await operations.getActivityInvestigation("act-current");

  assert.equal(result?.security.riskLevel, "attention");
  assert.deepEqual(
    result?.security.signals.map((signal) => signal.code),
    ["new_ip", "new_device", "concurrent_session", "shared_device", "shared_ip"],
  );
  assert.deepEqual(result?.relatedSessions[0]?.matches, [
    "ip_address",
    "device_fingerprint",
  ]);
  assert.equal(
    result?.relatedSessions[0]?.device.fingerprintHint?.endsWith("rprint"),
    true,
  );
  assert.equal("fingerprint" in (result?.relatedSessions[0]?.device ?? {}), false);
  assert.equal(JSON.stringify(result).includes("current-device-fingerprint"), false);
  assert.deepEqual(result?.relatedSessionsPagination, {
    mode: "offset",
    page: 1,
    pageSize: 5,
    limit: 5,
    offset: 0,
    total: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  });
});

test("bulkDeleteActivityLogs reports not found ids and closes deleted activities", async () => {
  const deletedIds: string[] = [];
  const closedIds: string[] = [];
  const auditEntries: Array<Parameters<ActivityStorage["createAuditLog"]>[0]> = [];

  const operations = createActivitySessionOperations(
    createStorageMock({
      createAuditLog: async (entry) => {
        auditEntries.push(entry);
        return {
          id: `audit-${auditEntries.length}`,
          ...entry,
          timestamp: new Date("2026-04-08T00:00:00.000Z"),
        } as AuditRecord;
      },
      getActivityById: async (activityId: string) =>
        activityId === "missing"
          ? undefined
          : ({
              id: activityId,
              userId: "user-1",
              username: "ali",
              role: "user",
              fingerprint: null,
              ipAddress: null,
              browser: null,
              isActive: true,
              pcName: null,
              loginTime: null,
              logoutTime: null,
              lastActivityTime: null,
              logoutReason: null,
            } as ActivityRecord),
      deleteActivity: async (activityId: string) => {
        deletedIds.push(activityId);
        return true;
      },
    }),
    async (activityId: string) => {
      closedIds.push(activityId);
    },
  );

  const result = await operations.bulkDeleteActivityLogs(["a1", "missing", "a2"], "admin.user");

  assert.deepEqual(result, {
    deletedCount: 2,
    notFoundIds: ["missing"],
    protectedIds: [],
  });
  assert.deepEqual(deletedIds, ["a1", "a2"]);
  assert.deepEqual(closedIds, ["a1", "a2"]);
  assert.equal(auditEntries.length, 1);
  assert.equal(auditEntries[0]?.action, "BULK_DELETE_ACTIVITY_LOGS");
  assert.equal(auditEntries[0]?.performedBy, "admin.user");
  const details = JSON.parse(String(auditEntries[0]?.details));
  assert.equal(details.requestedCount, 3);
  assert.equal(details.deletedCount, 2);
  assert.equal(details.notFoundCount, 1);
  assert.equal(details.protectedCount, 0);
});

test("bulkDeleteActivityLogs preserves records linked to active bans", async () => {
  const closedIds: string[] = [];
  const operations = createActivitySessionOperations(
    createStorageMock({
      getActivityById: async (activityId) => createActiveActivityRecord(activityId),
      deleteActivity: async (activityId) => activityId !== "protected-ban",
    }),
    async (activityId) => {
      closedIds.push(activityId);
    },
  );

  const result = await operations.bulkDeleteActivityLogs(
    ["ordinary-log", "protected-ban"],
    "admin.user",
  );

  assert.deepEqual(result, {
    deletedCount: 1,
    notFoundIds: [],
    protectedIds: ["protected-ban"],
  });
  assert.deepEqual(closedIds, ["ordinary-log"]);
});

test("getActivityRetentionStatus returns bounded policy cutoffs and protected ban counts", async () => {
  const previewCalls: Array<{ securityCutoff: Date; standardCutoff: Date }> = [];
  const operations = createActivitySessionOperations(
    createStorageMock({
      getActivityRetentionPolicy: async () => ({
        autoCleanupEnabled: true,
        batchSize: 250,
        securityRetentionDays: 365,
        standardRetentionDays: 90,
      }),
      getActivityRetentionPreview: async (params) => {
        previewCalls.push(params);
        return {
          protectedActiveBanCount: 2,
          securityEligibleCount: 3,
          standardEligibleCount: 4,
          totalEligibleCount: 7,
        };
      },
    }),
    async () => undefined,
  );

  const result = await operations.getActivityRetentionStatus(
    new Date("2026-06-12T00:00:00.000Z"),
  );

  assert.equal(result.standardCutoff, "2026-03-14T00:00:00.000Z");
  assert.equal(result.securityCutoff, "2025-06-12T00:00:00.000Z");
  assert.equal(result.preview.protectedActiveBanCount, 2);
  assert.equal(result.preview.totalEligibleCount, 7);
  assert.equal(previewCalls.length, 1);
});

test("cleanupEndedActivityLogs deletes eligible records and audits protected ban details", async () => {
  const closedIds: string[] = [];
  const cleanupCalls: Array<{
    limit: number;
    securityCutoff: Date;
    standardCutoff: Date;
  }> = [];
  const auditEntries: Array<Parameters<ActivityStorage["createAuditLog"]>[0]> = [];

  const operations = createActivitySessionOperations(
    createStorageMock({
      createAuditLog: async (entry) => {
        auditEntries.push(entry);
        return {
          id: `audit-${auditEntries.length}`,
          ...entry,
          timestamp: new Date("2026-06-08T00:00:00.000Z"),
        } as AuditRecord;
      },
      getActivityRetentionPolicy: async () => ({
        autoCleanupEnabled: true,
        batchSize: 500,
        securityRetentionDays: 365,
        standardRetentionDays: 90,
      }),
      getActivityRetentionPreview: async () => ({
        protectedActiveBanCount: 3,
        securityEligibleCount: 1,
        standardEligibleCount: 2,
        totalEligibleCount: 3,
      }),
      cleanupActivityRetention: async (params) => {
        cleanupCalls.push(params);
        return {
          deletedIds: ["ended-old-1", "kicked-old-1"],
          lockAcquired: true,
          securityDeletedCount: 1,
          standardDeletedCount: 1,
        };
      },
    }),
    async (activityId: string) => {
      closedIds.push(activityId);
    },
  );

  const result = await operations.cleanupEndedActivityLogs({
    now: new Date("2026-06-12T00:00:00.000Z"),
    limit: 500,
    olderThanDays: 30,
    performedBy: "admin.user",
    source: "manual",
  });

  assert.equal(result.cutoff, "2026-05-13T00:00:00.000Z");
  assert.equal(result.securityCutoff, "2025-06-12T00:00:00.000Z");
  assert.equal(result.deletedCount, 2);
  assert.equal(result.standardDeletedCount, 1);
  assert.equal(result.securityDeletedCount, 1);
  assert.equal(result.protectedActiveBanCount, 3);
  assert.equal(result.skipped, false);
  assert.equal(cleanupCalls.length, 1);
  assert.equal(cleanupCalls[0]?.limit, 500);
  assert.deepEqual(closedIds, ["ended-old-1", "kicked-old-1"]);
  assert.equal(auditEntries.length, 1);
  assert.equal(auditEntries[0]?.action, "DELETE_OLD_ACTIVITY_LOGS");
  assert.equal(auditEntries[0]?.performedBy, "admin.user");
  const details = JSON.parse(String(auditEntries[0]?.details));
  assert.equal(details.standardCutoffIso, "2026-05-13T00:00:00.000Z");
  assert.equal(details.securityCutoffIso, "2025-06-12T00:00:00.000Z");
  assert.equal(details.deletedCount, 2);
  assert.equal(details.limit, 500);
  assert.equal(details.standardRetentionDays, 30);
  assert.equal(details.securityRetentionDays, 365);
  assert.equal(details.protectedActiveBanCount, 3);
  assert.equal(details.source, "manual");
});

test("cleanupEndedActivityLogs skips automatic cleanup when policy is disabled", async () => {
  let cleanupCalled = false;
  const operations = createActivitySessionOperations(
    createStorageMock({
      cleanupActivityRetention: async () => {
        cleanupCalled = true;
        throw new Error("cleanup must not run");
      },
    }),
    async () => undefined,
  );

  const result = await operations.cleanupEndedActivityLogs({
    now: new Date("2026-06-12T00:00:00.000Z"),
    performedBy: "system:activity-retention",
    source: "automatic",
  });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, "disabled");
  assert.equal(result.deletedCount, 0);
  assert.equal(cleanupCalled, false);
});

test("cleanupEndedActivityLogs writes a failure audit when retention cleanup fails", async () => {
  const auditEntries: Array<Parameters<ActivityStorage["createAuditLog"]>[0]> = [];
  const operations = createActivitySessionOperations(
    createStorageMock({
      createAuditLog: async (entry) => {
        auditEntries.push(entry);
        return {
          id: `audit-${auditEntries.length}`,
          ...entry,
          timestamp: new Date("2026-06-08T00:00:00.000Z"),
        } as AuditRecord;
      },
      cleanupActivityRetention: async () => {
        throw new Error("cleanup failed");
      },
    }),
    async () => undefined,
  );

  await assert.rejects(
    () =>
      operations.cleanupEndedActivityLogs({
        now: new Date("2026-06-12T00:00:00.000Z"),
        limit: 500,
        olderThanDays: 30,
        performedBy: "admin.user",
        source: "manual",
      }),
    /cleanup failed/,
  );

  assert.equal(auditEntries.length, 1);
  assert.equal(auditEntries[0]?.action, "DELETE_OLD_ACTIVITY_LOGS_FAILED");
  assert.equal(auditEntries[0]?.performedBy, "admin.user");
  const details = JSON.parse(String(auditEntries[0]?.details));
  assert.equal(details.errorType, "Error");
  assert.equal(details.limit, 500);
  assert.equal(details.standardRetentionDays, 30);
  assert.equal(details.securityRetentionDays, 365);
  assert.equal(details.source, "manual");
});

test("heartbeat marks activity online and returns ISO timestamp", async () => {
  let updatedActivityId = "";
  const capture: {
    patch: { isActive?: boolean; lastActivityTime?: unknown } | null;
  } = {
    patch: null,
  };

  const operations = createActivitySessionOperations(
    createStorageMock({
      updateActivity: async (activityId: string, patch) => {
        updatedActivityId = activityId;
        capture.patch = patch as { isActive?: boolean; lastActivityTime?: unknown };
        return undefined;
      },
    }),
    async () => undefined,
  );

  const result = await operations.heartbeat("act-1");

  assert.equal(updatedActivityId, "act-1");
  assert.equal(result.ok, true);
  assert.equal(result.status, "ONLINE");
  assert.ok(typeof result.lastActivityTime === "string");
  if (!capture.patch) {
    throw new Error("Expected heartbeat to update activity");
  }
  const capturedPatch = capture.patch;
  assert.equal(capturedPatch.isActive, true);
  assert.ok(capturedPatch.lastActivityTime instanceof Date);
});

test("listActivityPage serializes dates and keeps the requesting active session online", async () => {
  const staleCurrentActivity = {
    ...createActiveActivityRecord("act-1"),
    loginTime: new Date("2026-06-12T01:00:00.000Z"),
    lastActivityTime: new Date(Date.now() - 10 * 60_000),
  } as ActivityRecord;
  const pageCalls: Array<Parameters<ActivityStorage["listActivityPage"]>[0]> = [];
  const operations = createActivitySessionOperations(
    createStorageMock({
      listActivityPage: async (params) => {
        pageCalls.push(params);
        return {
          activities: [{
            ...staleCurrentActivity,
            status: "IDLE",
          }],
          page: 2,
          pageSize: 10,
          total: 12,
          totalPages: 2,
          summary: {
            idleCount: 3,
            kickedCount: 1,
            logoutCount: 2,
            onlineCount: 6,
          },
        };
      },
    }),
    async () => undefined,
  );

  const result = await operations.listActivityPage(
    {
      page: 2,
      pageSize: 10,
      sortBy: "username",
      sortOrder: "asc",
    },
    {
      status: ["ONLINE"],
      username: "ali",
    },
    "act-1",
  );

  assert.deepEqual(pageCalls, [{
    page: 2,
    pageSize: 10,
    sortBy: "username",
    sortOrder: "asc",
    currentActivityId: "act-1",
    filters: {
      status: ["ONLINE"],
      username: "ali",
    },
  }]);
  assert.equal(result.activities.length, 1);
  assert.equal(result.activities[0]?.status, "ONLINE");
  assert.equal(result.activities[0]?.loginTime, "2026-06-12T01:00:00.000Z");
  assert.match(String(result.activities[0]?.lastActivityTime), /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(result.summary, {
    idleCount: 3,
    kickedCount: 1,
    logoutCount: 2,
    onlineCount: 6,
  });
});

test("getAllActivities keeps the requesting active session online in the returned feed", async () => {
  const staleCurrentActivity = {
    id: "act-1",
    userId: "user-1",
    username: "ali",
    role: "user",
    fingerprint: null,
    ipAddress: "127.0.0.1",
    browser: "Chrome",
    isActive: true,
    pcName: "PC-1",
    loginTime: new Date("2026-04-10T06:05:00.000Z"),
    logoutTime: null,
    lastActivityTime: new Date(Date.now() - 10 * 60_000),
    logoutReason: null,
  } as ActivityRecord;

  const operations = createActivitySessionOperations(
    createStorageMock({
      getActivityById: async (activityId: string) => (activityId === "act-1" ? staleCurrentActivity : undefined),
      getAllActivities: async () => [
        {
          ...staleCurrentActivity,
          status: "IDLE",
        } as ActivityRecord & { status: string },
      ],
    }),
    async () => undefined,
  );

  const result = await operations.getAllActivities("act-1");

  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "act-1");
  assert.equal((result[0] as { status?: string }).status, "ONLINE");
  assert.equal(typeof (result[0] as { loginTime?: unknown }).loginTime, "string");
  assert.equal(typeof (result[0] as { lastActivityTime?: unknown }).lastActivityTime, "string");
  assert.ok(resolveDateValue((result[0] as { lastActivityTime?: unknown }).lastActivityTime) > staleCurrentActivity.lastActivityTime!.getTime());
});

test("activity feeds expose exact IPs only when privileged audit access is requested", async () => {
  const activity = {
    ...createActiveActivityRecord("act-network"),
    ipAddress: "203.0.113.77",
    deviceType: "desktop",
    platform: "Windows 10/11",
    status: "ONLINE",
  };
  const operations = createActivitySessionOperations(
    createStorageMock({
      getAllActivities: async () => [activity],
    }),
    async () => undefined,
  );

  const masked = await operations.getAllActivities();
  const exact = await operations.getAllActivities(undefined, {
    includeExactIpAddress: true,
  });

  assert.equal(masked[0]?.ipAddress, "203.0.113.x");
  assert.equal(exact[0]?.ipAddress, "203.0.113.77");
  assert.equal(exact[0]?.deviceType, "desktop");
  assert.equal(exact[0]?.platform, "Windows 10/11");
});

test("getFilteredActivities injects the requesting active session into ONLINE filters when storage returned stale data", async () => {
  const staleCurrentActivity = {
    id: "act-1",
    userId: "user-1",
    username: "ali",
    role: "user",
    fingerprint: null,
    ipAddress: "127.0.0.1",
    browser: "Chrome",
    isActive: true,
    pcName: "PC-1",
    loginTime: new Date("2026-04-10T06:05:00.000Z"),
    logoutTime: null,
    lastActivityTime: new Date(Date.now() - 10 * 60_000),
    logoutReason: null,
  } as ActivityRecord;

  const operations = createActivitySessionOperations(
    createStorageMock({
      getActivityById: async (activityId: string) => (activityId === "act-1" ? staleCurrentActivity : undefined),
      getFilteredActivities: async () => [],
    }),
    async () => undefined,
  );

  const result = await operations.getFilteredActivities({ status: ["ONLINE"] }, "act-1");

  assert.equal(result.length, 1);
  assert.equal(result[0]?.id, "act-1");
  assert.equal((result[0] as { status?: string }).status, "ONLINE");
  assert.equal(
    (result[0] as { loginTime?: unknown }).loginTime,
    "2026-04-10T06:05:00.000Z",
  );
});

test("getFilteredActivities removes the requesting active session from IDLE filters once it is treated as online", async () => {
  const staleCurrentActivity = {
    id: "act-1",
    userId: "user-1",
    username: "ali",
    role: "user",
    fingerprint: null,
    ipAddress: "127.0.0.1",
    browser: "Chrome",
    isActive: true,
    pcName: "PC-1",
    loginTime: new Date("2026-04-10T06:05:00.000Z"),
    logoutTime: null,
    lastActivityTime: new Date(Date.now() - 10 * 60_000),
    logoutReason: null,
  } as ActivityRecord;

  const operations = createActivitySessionOperations(
    createStorageMock({
      getActivityById: async (activityId: string) => (activityId === "act-1" ? staleCurrentActivity : undefined),
      getFilteredActivities: async () => [
        {
          ...staleCurrentActivity,
          status: "IDLE",
        } as ActivityRecord & { status: string },
      ],
    }),
    async () => undefined,
  );

  const result = await operations.getFilteredActivities({ status: ["IDLE"] }, "act-1");

  assert.equal(result.length, 0);
});

function resolveDateValue(value: unknown) {
  return new Date(value as string | number | Date).getTime();
}
