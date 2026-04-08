import assert from "node:assert/strict";
import test from "node:test";
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

test("bulkDeleteActivityLogs reports not found ids and closes deleted activities", async () => {
  const deletedIds: string[] = [];
  const closedIds: string[] = [];

  const operations = createActivitySessionOperations(
    createStorageMock({
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

  const result = await operations.bulkDeleteActivityLogs(["a1", "missing", "a2"]);

  assert.deepEqual(result, {
    deletedCount: 2,
    notFoundIds: ["missing"],
  });
  assert.deepEqual(deletedIds, ["a1", "a2"]);
  assert.deepEqual(closedIds, ["a1", "a2"]);
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
