import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword } from "../../auth/passwords";
import { encryptTwoFactorSecret, generateCurrentTwoFactorCode } from "../../auth/two-factor";
import { AuthAccountService, AuthAccountError } from "../auth-account.service";

function buildSuperuser(passwordHash: string) {
  const now = new Date("2026-03-20T00:00:00.000Z");
  return {
    id: "super-1",
    username: "superuser",
    passwordHash,
    fullName: "Super User",
    email: "superuser@example.com",
    role: "superuser",
    status: "active",
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    passwordChangedAt: now,
    activatedAt: now,
    lastLoginAt: now,
    isBanned: false,
    twoFactorEnabled: false,
    twoFactorSecretEncrypted: null,
    twoFactorConfiguredAt: null,
  };
}

test("AuthAccountService.login clears stale superuser sessions before issuing a new session", async () => {
  const passwordHash = await hashPassword("Password123!");
  const user = buildSuperuser(passwordHash);
  const auditActions: string[] = [];
  let deactivated = false;

  const service = new AuthAccountService({
    getUserByUsername: async () => user,
    isVisitorBanned: async () => false,
    createAuditLog: async (entry: any) => {
      auditActions.push(String(entry?.action || ""));
      return entry;
    },
    getBooleanSystemSetting: async () => true,
    getActiveActivitiesByUsername: async () => [
      {
        id: "activity-old-1",
        username: "superuser",
        lastActivityTime: new Date("2026-03-19T20:00:00.000Z"),
        loginTime: new Date("2026-03-19T19:00:00.000Z"),
        isActive: true,
      },
    ],
    deactivateUserActivities: async () => {
      deactivated = true;
    },
    createActivity: async () => ({
      id: "activity-new-1",
      userId: user.id,
      username: user.username,
      role: user.role,
      loginTime: new Date("2026-03-20T00:00:00.000Z"),
      lastActivityTime: new Date("2026-03-20T00:00:00.000Z"),
      logoutTime: null,
      isActive: true,
      logoutReason: null,
      fingerprint: "fp-1",
      browser: "chrome",
      pcName: "pc",
      ipAddress: "127.0.0.1",
    }),
    touchLastLogin: async () => undefined,
    // Optional runtime app config path used by stale-session detection.
    getAppConfig: async () => ({
      systemName: "SQR",
      sessionTimeoutMinutes: 30,
      heartbeatIntervalMinutes: 5,
      wsIdleMinutes: 3,
      aiEnabled: false,
      semanticSearchEnabled: false,
      aiTimeoutMs: 10000,
      searchResultLimit: 100,
      viewerRowsPerPage: 100,
    }),
  } as any);

  const result = await service.login({
    username: "superuser",
    password: "Password123!",
    browserName: "chrome",
    fingerprint: "fp-1",
    ipAddress: "127.0.0.1",
    pcName: "pc",
  });

  assert.equal(result.kind, "authenticated");
  assert.equal(result.user.username, "superuser");
  assert.equal(result.activity.id, "activity-new-1");
  assert.equal(deactivated, true);
  assert.ok(auditActions.includes("LOGIN_STALE_SESSION_RECOVERED"));
  assert.ok(auditActions.includes("LOGIN_SUCCESS"));
});

test("AuthAccountService.login blocks superuser when another recent session is still active", async () => {
  const passwordHash = await hashPassword("Password123!");
  const user = buildSuperuser(passwordHash);

  const service = new AuthAccountService({
    getUserByUsername: async () => user,
    isVisitorBanned: async () => false,
    createAuditLog: async (entry: any) => entry,
    getBooleanSystemSetting: async () => true,
    getActiveActivitiesByUsername: async () => [
      {
        id: "activity-active-1",
        username: "superuser",
        lastActivityTime: new Date(),
        loginTime: new Date(),
        isActive: true,
      },
    ],
  } as any);

  await assert.rejects(
    service.login({
      username: "superuser",
      password: "Password123!",
      browserName: "chrome",
      fingerprint: "fp-1",
      ipAddress: "127.0.0.1",
      pcName: "pc",
    }),
    (error: unknown) =>
      error instanceof AuthAccountError
      && error.statusCode === 409
      && error.code === "SUPERUSER_SINGLE_SESSION_ENFORCED",
  );
});

test("AuthAccountService.login requires second factor for admin accounts with 2FA enabled", async () => {
  const passwordHash = await hashPassword("Password123!");
  const user = {
    ...buildSuperuser(passwordHash),
    id: "admin-1",
    username: "admin.user",
    role: "admin",
    twoFactorEnabled: true,
    twoFactorSecretEncrypted: encryptTwoFactorSecret("JBSWY3DPEHPK3PXP"),
    twoFactorConfiguredAt: new Date("2026-03-20T00:00:00.000Z"),
  };
  let createActivityCalled = false;
  const auditActions: string[] = [];

  const service = new AuthAccountService({
    getUserByUsername: async () => user,
    isVisitorBanned: async () => false,
    deactivateUserSessionsByFingerprint: async () => undefined,
    createActivity: async () => {
      createActivityCalled = true;
      return { id: "activity-unexpected" };
    },
    touchLastLogin: async () => undefined,
    createAuditLog: async (entry: any) => {
      auditActions.push(String(entry?.action || ""));
      return entry;
    },
  } as any);

  const result = await service.login({
    username: "admin.user",
    password: "Password123!",
    browserName: "chrome",
    fingerprint: "fp-2",
    ipAddress: "127.0.0.1",
    pcName: "pc",
  });

  assert.equal(result.kind, "two_factor_required");
  assert.equal(result.user.username, "admin.user");
  assert.equal(createActivityCalled, false);
  assert.ok(auditActions.includes("LOGIN_SECOND_FACTOR_REQUIRED"));
});

test("AuthAccountService supports starting, confirming, and disabling 2FA for admin accounts", async () => {
  const passwordHash = await hashPassword("Password123!");
  const auditActions: string[] = [];
  const user = {
    ...buildSuperuser(passwordHash),
    id: "admin-2",
    username: "admin.2",
    role: "admin",
  };

  const service = new AuthAccountService({
    getUser: async () => user,
    getUserByUsername: async () => user,
    createAuditLog: async (entry: any) => {
      auditActions.push(String(entry?.action || ""));
      return entry;
    },
    updateUserAccount: async (params: any) => {
      Object.assign(user, {
        twoFactorEnabled:
          params.twoFactorEnabled === undefined ? user.twoFactorEnabled : params.twoFactorEnabled,
        twoFactorSecretEncrypted:
          params.twoFactorSecretEncrypted === undefined
            ? user.twoFactorSecretEncrypted
            : params.twoFactorSecretEncrypted,
        twoFactorConfiguredAt:
          params.twoFactorConfiguredAt === undefined
            ? user.twoFactorConfiguredAt
            : params.twoFactorConfiguredAt,
      });
      return user;
    },
    updateUserCredentials: async () => user,
    getActiveActivitiesByUsername: async () => [],
    deactivateUserActivities: async () => undefined,
    updateActivitiesUsername: async () => undefined,
  } as any);

  const authUser = {
    userId: user.id,
    username: user.username,
    role: user.role,
    activityId: "activity-self-1",
  };

  const setupResult = await service.startTwoFactorSetup(authUser, {
    currentPassword: "Password123!",
  });

  assert.equal(typeof setupResult.setup.secret, "string");
  assert.equal(setupResult.setup.secret.length > 10, true);
  assert.equal(typeof user.twoFactorSecretEncrypted, "string");
  assert.equal(user.twoFactorEnabled, false);

  const enabledUser = await service.confirmTwoFactorSetup(authUser, {
    code: generateCurrentTwoFactorCode(setupResult.setup.secret),
  });

  assert.equal(enabledUser.twoFactorEnabled, true);
  assert.ok(enabledUser.twoFactorConfiguredAt instanceof Date);

  const disabledUser = await service.disableTwoFactor(authUser, {
    currentPassword: "Password123!",
    code: generateCurrentTwoFactorCode(setupResult.setup.secret),
  });

  assert.equal(disabledUser.twoFactorEnabled, false);
  assert.equal(disabledUser.twoFactorSecretEncrypted, null);
  assert.equal(disabledUser.twoFactorConfiguredAt, null);
  assert.ok(auditActions.includes("TWO_FACTOR_SETUP_INITIATED"));
  assert.ok(auditActions.includes("TWO_FACTOR_ENABLED"));
  assert.ok(auditActions.includes("TWO_FACTOR_DISABLED"));
});
