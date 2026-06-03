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
    deactivateUserActivities: async () => undefined,
    deleteActivity: async () => true,
    getActiveActivities: async () => [],
    getActiveActivitiesByUsername: async () => [],
    getActivityById: async () => undefined,
    getAllActivities: async () => [],
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
