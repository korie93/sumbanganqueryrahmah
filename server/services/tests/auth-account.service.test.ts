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
    twoFactorConfiguredAt: null as Date | null,
    failedLoginAttempts: 0,
    lockedAt: null as Date | null,
    lockedReason: null as string | null,
    lockedBySystem: false,
  };
}

function buildManagedUser(passwordHash: string, overrides?: Record<string, unknown>) {
  return {
    ...buildSuperuser(passwordHash),
    id: "user-1",
    username: "managed.user",
    fullName: "Managed User",
    email: "managed.user@example.com",
    role: "user",
    ...overrides,
  };
}

async function createLockoutHarness(overrides?: Record<string, unknown>) {
  const passwordHash = await hashPassword("Password123!");
  const user = buildManagedUser(passwordHash, overrides);
  const auditActions: string[] = [];
  const updateUserAccountCalls: Array<Record<string, unknown>> = [];
  const deactivatedReasons: string[] = [];
  const activity = {
    id: "activity-lockout-1",
    userId: user.id,
    username: user.username,
    role: user.role,
    loginTime: new Date("2026-03-20T00:00:00.000Z"),
    lastActivityTime: new Date("2026-03-20T00:00:00.000Z"),
    logoutTime: null,
    isActive: true,
    logoutReason: null,
    fingerprint: "fp-lockout",
    browser: "chrome",
    pcName: "pc",
    ipAddress: "127.0.0.1",
  };
  let recordFailedLoginAttemptCalls = 0;

  const service = new AuthAccountService({
    getUserByUsername: async (username: string) => (username === user.username ? user : null),
    isVisitorBanned: async () => false,
    getBooleanSystemSetting: async () => false,
    getActiveActivitiesByUsername: async () => [{
      id: "activity-existing-1",
      username: user.username,
      loginTime: new Date("2026-03-20T00:00:00.000Z"),
      lastActivityTime: new Date("2026-03-20T00:00:00.000Z"),
      isActive: true,
    }],
    deactivateUserActivities: async (_username: string, reason: string) => {
      deactivatedReasons.push(reason);
    },
    deactivateUserSessionsByFingerprint: async () => undefined,
    createAuditLog: async (entry: any) => {
      auditActions.push(String(entry?.action || ""));
      return entry;
    },
    recordFailedLoginAttempt: async (params: any) => {
      recordFailedLoginAttemptCalls += 1;
      const wasLocked = Boolean(user.lockedAt);
      user.failedLoginAttempts = Number(user.failedLoginAttempts || 0) + 1;
      const locked = wasLocked || user.failedLoginAttempts > Number(params.maxAllowedAttempts || 0);
      if (locked && !wasLocked) {
        user.lockedAt = params.now instanceof Date ? params.now : new Date("2026-03-20T00:30:00.000Z");
        user.lockedReason = String(params.lockedReason || "too_many_failed_password_attempts");
        user.lockedBySystem = true;
      }
      return {
        user,
        failedLoginAttempts: user.failedLoginAttempts,
        locked,
        newlyLocked: locked && !wasLocked,
      };
    },
    updateUserAccount: async (params: any) => {
      updateUserAccountCalls.push(params);
      Object.assign(user, {
        failedLoginAttempts:
          params.failedLoginAttempts === undefined ? user.failedLoginAttempts : params.failedLoginAttempts,
        lockedAt: params.lockedAt === undefined ? user.lockedAt : params.lockedAt,
        lockedReason: params.lockedReason === undefined ? user.lockedReason : params.lockedReason,
        lockedBySystem: params.lockedBySystem === undefined ? user.lockedBySystem : params.lockedBySystem,
      });
      return user;
    },
    createActivity: async () => activity,
    touchLastLogin: async () => undefined,
  } as any);

  return {
    service,
    user,
    activity,
    auditActions,
    updateUserAccountCalls,
    deactivatedReasons,
    getRecordFailedLoginAttemptCalls: () => recordFailedLoginAttemptCalls,
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

test("AuthAccountService.login replaces existing user sessions so only the latest login stays active", async () => {
  const passwordHash = await hashPassword("Password123!");
  const user = buildManagedUser(passwordHash);
  const auditActions: string[] = [];
  const deactivatedReasons: string[] = [];

  const service = new AuthAccountService({
    getUserByUsername: async () => user,
    isVisitorBanned: async () => false,
    getActiveActivitiesByUsername: async () => [
      {
        id: "activity-old-1",
        username: user.username,
        loginTime: new Date("2026-03-20T00:00:00.000Z"),
        lastActivityTime: new Date("2026-03-20T00:05:00.000Z"),
        isActive: true,
      },
      {
        id: "activity-old-2",
        username: user.username,
        loginTime: new Date("2026-03-20T00:10:00.000Z"),
        lastActivityTime: new Date("2026-03-20T00:15:00.000Z"),
        isActive: true,
      },
    ],
    deactivateUserActivities: async (_username: string, reason: string) => {
      deactivatedReasons.push(reason);
    },
    deactivateUserSessionsByFingerprint: async () => undefined,
    createAuditLog: async (entry: any) => {
      auditActions.push(String(entry?.action || ""));
      return entry;
    },
    createActivity: async () => ({
      id: "activity-new-1",
      userId: user.id,
      username: user.username,
      role: user.role,
      loginTime: new Date("2026-03-20T00:20:00.000Z"),
      lastActivityTime: new Date("2026-03-20T00:20:00.000Z"),
      logoutTime: null,
      isActive: true,
      logoutReason: null,
      fingerprint: "fp-user",
      browser: "chrome",
      pcName: "pc",
      ipAddress: "127.0.0.1",
    }),
    touchLastLogin: async () => undefined,
  } as any);

  const result = await service.login({
    username: user.username,
    password: "Password123!",
    browserName: "chrome",
    fingerprint: "fp-user",
    ipAddress: "127.0.0.1",
    pcName: "pc",
  });

  assert.equal(result.kind, "authenticated");
  assert.deepEqual(result.closedSessionIds, ["activity-old-1", "activity-old-2"]);
  assert.deepEqual(deactivatedReasons, ["NEW_SESSION"]);
  assert.ok(auditActions.includes("LOGIN_REPLACED_EXISTING_SESSION"));
  assert.ok(auditActions.includes("LOGIN_SUCCESS"));
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

test("AuthAccountService.verifyTwoFactorLogin replaces existing admin sessions after successful verification", async () => {
  const passwordHash = await hashPassword("Password123!");
  const user = {
    ...buildSuperuser(passwordHash),
    id: "admin-verify-1",
    username: "admin.verify",
    role: "admin",
    twoFactorEnabled: true,
    twoFactorSecretEncrypted: encryptTwoFactorSecret("JBSWY3DPEHPK3PXP"),
    twoFactorConfiguredAt: new Date("2026-03-20T00:00:00.000Z"),
  };
  const auditActions: string[] = [];
  const deactivatedReasons: string[] = [];

  const service = new AuthAccountService({
    getUser: async () => user,
    isVisitorBanned: async () => false,
    getActiveActivitiesByUsername: async () => [
      {
        id: "activity-old-admin-1",
        username: user.username,
        loginTime: new Date("2026-03-20T00:00:00.000Z"),
        lastActivityTime: new Date("2026-03-20T00:05:00.000Z"),
        isActive: true,
      },
    ],
    deactivateUserActivities: async (_username: string, reason: string) => {
      deactivatedReasons.push(reason);
    },
    createAuditLog: async (entry: any) => {
      auditActions.push(String(entry?.action || ""));
      return entry;
    },
    createActivity: async () => ({
      id: "activity-admin-new-1",
      userId: user.id,
      username: user.username,
      role: user.role,
      loginTime: new Date("2026-03-20T00:20:00.000Z"),
      lastActivityTime: new Date("2026-03-20T00:20:00.000Z"),
      logoutTime: null,
      isActive: true,
      logoutReason: null,
      fingerprint: "fp-admin",
      browser: "chrome",
      pcName: "pc",
      ipAddress: "127.0.0.1",
    }),
    touchLastLogin: async () => undefined,
  } as any);

  const result = await service.verifyTwoFactorLogin({
    userId: user.id,
    code: generateCurrentTwoFactorCode("JBSWY3DPEHPK3PXP"),
    fingerprint: "fp-admin",
    browserName: "chrome",
    ipAddress: "127.0.0.1",
    pcName: "pc",
  });

  assert.equal(result.activity.id, "activity-admin-new-1");
  assert.deepEqual(result.closedSessionIds, ["activity-old-admin-1"]);
  assert.deepEqual(deactivatedReasons, ["NEW_SESSION"]);
  assert.ok(auditActions.includes("LOGIN_REPLACED_EXISTING_SESSION"));
  assert.ok(auditActions.includes("LOGIN_SUCCESS"));
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

test("AuthAccountService.login increments failed password attempts without locking through the third wrong password", async () => {
  const { service, user, auditActions } = await createLockoutHarness();

  for (const attempt of [1, 2, 3]) {
    await assert.rejects(
      service.login({
        username: user.username,
        password: "WrongPassword!",
        browserName: "chrome",
        fingerprint: "fp-lockout",
        ipAddress: "127.0.0.1",
        pcName: "pc",
      }),
      (error: unknown) =>
        error instanceof AuthAccountError
        && error.statusCode === 401
        && error.code === "INVALID_CREDENTIALS",
    );

    assert.equal(user.failedLoginAttempts, attempt);
    assert.equal(user.lockedAt, null);
    assert.equal(user.lockedBySystem, false);
  }

  assert.equal(
    auditActions.filter((action) => action === "LOGIN_FAILED_PASSWORD").length,
    3,
  );
  assert.equal(auditActions.includes("ACCOUNT_LOCKED_TOO_MANY_FAILED_LOGINS"), false);
});

test("AuthAccountService.login locks an account after more than three wrong password attempts", async () => {
  const { service, user, auditActions, deactivatedReasons } = await createLockoutHarness();

  for (const attempt of [1, 2, 3]) {
    await assert.rejects(
      service.login({
        username: user.username,
        password: `WrongPassword-${attempt}`,
        browserName: "chrome",
        fingerprint: "fp-lockout",
        ipAddress: "127.0.0.1",
        pcName: "pc",
      }),
      (error: unknown) =>
        error instanceof AuthAccountError
        && error.statusCode === 401
        && error.code === "INVALID_CREDENTIALS",
    );
  }

  await assert.rejects(
    service.login({
      username: user.username,
      password: "StillWrongPassword!",
      browserName: "chrome",
      fingerprint: "fp-lockout",
      ipAddress: "127.0.0.1",
      pcName: "pc",
    }),
    (error: unknown) =>
      error instanceof AuthAccountError
      && error.statusCode === 423
      && error.code === "ACCOUNT_LOCKED",
  );

  assert.equal(user.failedLoginAttempts, 4);
  assert.ok(user.lockedAt instanceof Date);
  assert.equal(user.lockedReason, "too_many_failed_password_attempts");
  assert.equal(user.lockedBySystem, true);
  assert.ok(auditActions.includes("LOGIN_FAILED_PASSWORD_LOCKED"));
  assert.ok(auditActions.includes("ACCOUNT_LOCKED_TOO_MANY_FAILED_LOGINS"));
  assert.deepEqual(deactivatedReasons, ["ACCOUNT_LOCKED_FAILED_LOGINS"]);

  await assert.rejects(
    service.login({
      username: user.username,
      password: "Password123!",
      browserName: "chrome",
      fingerprint: "fp-lockout",
      ipAddress: "127.0.0.1",
      pcName: "pc",
    }),
    (error: unknown) =>
      error instanceof AuthAccountError
      && error.statusCode === 423
      && error.code === "ACCOUNT_LOCKED",
  );

  assert.ok(auditActions.includes("LOGIN_BLOCKED_LOCKED_ACCOUNT"));
});

test("AuthAccountService.login resets failed attempt counters after a successful login", async () => {
  const { service, user, activity, auditActions, updateUserAccountCalls } = await createLockoutHarness({
    failedLoginAttempts: 3,
    lockedAt: null,
    lockedReason: null,
    lockedBySystem: false,
  });

  const result = await service.login({
    username: user.username,
    password: "Password123!",
    browserName: "chrome",
    fingerprint: "fp-lockout",
    ipAddress: "127.0.0.1",
    pcName: "pc",
  });

  assert.equal(result.kind, "authenticated");
  assert.equal(result.activity.id, activity.id);
  assert.equal(user.failedLoginAttempts, 0);
  assert.equal(user.lockedAt, null);
  assert.equal(user.lockedReason, null);
  assert.equal(user.lockedBySystem, false);
  assert.deepEqual(updateUserAccountCalls[0], {
    userId: user.id,
    failedLoginAttempts: 0,
    lockedAt: null,
    lockedReason: null,
    lockedBySystem: false,
  });
  assert.ok(auditActions.includes("LOGIN_SUCCESS"));
});

test("AuthAccountService.login keeps invalid usernames generic and does not record failed-account lockout state", async () => {
  const auditActions: string[] = [];
  let recordFailedLoginAttemptCalled = false;

  const service = new AuthAccountService({
    getUserByUsername: async () => null,
    isVisitorBanned: async () => false,
    createAuditLog: async (entry: any) => {
      auditActions.push(String(entry?.action || ""));
      return entry;
    },
    recordFailedLoginAttempt: async () => {
      recordFailedLoginAttemptCalled = true;
      return {
        user: undefined,
        failedLoginAttempts: 0,
        locked: false,
        newlyLocked: false,
      };
    },
  } as any);

  await assert.rejects(
    service.login({
      username: "missing.user",
      password: "WrongPassword!",
      browserName: "chrome",
      fingerprint: "fp-missing",
      ipAddress: "127.0.0.1",
      pcName: "pc",
    }),
    (error: unknown) =>
      error instanceof AuthAccountError
      && error.statusCode === 401
      && error.code === "INVALID_CREDENTIALS",
  );

  assert.equal(recordFailedLoginAttemptCalled, false);
  assert.deepEqual(auditActions, ["LOGIN_FAILED"]);
});
