import assert from "node:assert/strict";
import test from "node:test";
import { createActivityModerationOperations } from "../activity-moderation-operations";
import type { ActivityStorage } from "../activity-service-types";

type ActivityRecord = NonNullable<Awaited<ReturnType<ActivityStorage["getActivityById"]>>>;
type UserRecord = NonNullable<Awaited<ReturnType<ActivityStorage["getUserByUsername"]>>>;
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

test("banActivity blocks superuser targets before visitor ban", async () => {
  let banVisitorCalled = false;

  const operations = createActivityModerationOperations(
    createStorageMock({
      getActivityById: async () =>
        ({
          id: "act-1",
          userId: "user-1",
          username: "root",
          role: "superuser",
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
      getUserByUsername: async () =>
        ({
          id: "user-1",
          username: "root",
          email: "root@example.com",
          role: "superuser",
          isActive: true,
          isBanned: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          emailVerifiedAt: null,
          activationToken: null,
          activationTokenExpiresAt: null,
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
          failedLoginAttempts: 0,
          lockoutUntil: null,
          lastLoginAt: null,
          twoFactorEnabled: false,
          twoFactorSecret: null,
          forcePasswordChange: false,
        } as unknown as UserRecord),
      banVisitor: async () => {
        banVisitorCalled = true;
      },
    }),
    async () => undefined,
  );

  const result = await operations.banActivity("act-1", "admin");

  assert.deepEqual(result, { status: "cannot_ban_superuser" });
  assert.equal(banVisitorCalled, false);
});

test("banAccount closes all active sessions and writes audit log", async () => {
  const closed: Array<{ id: string; payload?: Record<string, unknown> | undefined }> = [];
  let auditTargetUser = "";

  const operations = createActivityModerationOperations(
    createStorageMock({
      getUserByUsername: async () =>
        ({
          id: "user-1",
          username: "ali",
          email: "ali@example.com",
          role: "user",
          isActive: true,
          isBanned: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          emailVerifiedAt: null,
          activationToken: null,
          activationTokenExpiresAt: null,
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
          failedLoginAttempts: 0,
          lockoutUntil: null,
          lastLoginAt: null,
          twoFactorEnabled: false,
          twoFactorSecret: null,
          forcePasswordChange: false,
        } as unknown as UserRecord),
      getActiveActivitiesByUsername: async () =>
        [
          {
            id: "a1",
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
          },
          {
            id: "a2",
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
          },
        ] as Awaited<ReturnType<ActivityStorage["getActiveActivitiesByUsername"]>>,
      createAuditLog: async (entry) => {
        auditTargetUser = String(entry.targetUser ?? "");
        return {
          id: "audit-2",
          action: String(entry.action),
          performedBy: String(entry.performedBy),
          details: (entry.details ?? null) as string | null,
          targetUser: (entry.targetUser ?? null) as string | null,
          timestamp: new Date("2026-04-08T00:00:00.000Z"),
          requestId: (entry.requestId ?? null) as string | null,
          targetResource: (entry.targetResource ?? null) as string | null,
        } as AuditRecord;
      },
    }),
    async (activityId: string, payload?: Record<string, unknown>) => {
      closed.push({ id: activityId, payload });
    },
  );

  const result = await operations.banAccount("ali", "superadmin");

  assert.deepEqual(result, { status: "ok" });
  assert.equal(auditTargetUser, "ali");
  assert.deepEqual(
    closed.map((entry) => entry.id),
    ["a1", "a2"],
  );
  assert.equal(closed[0]?.payload?.type, "banned");
});
