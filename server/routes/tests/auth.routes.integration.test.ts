import assert from "node:assert/strict";
import test from "node:test";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { createAuthGuards } from "../../auth/guards";
import { hashOpaqueToken, hashPassword, verifyPassword } from "../../auth/passwords";
import { registerAuthRoutes } from "../auth.routes";
import type { PostgresStorage } from "../../storage-postgres";
import {
  createJsonTestApp,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

type AuditEntry = {
  action: string;
  performedBy?: string;
  targetUser?: string;
  details?: string;
};

type ActivationRecord = {
  tokenId: string;
  userId: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  isBanned: boolean | null;
  activatedAt: Date | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

type PasswordResetRecord = {
  requestId: string;
  userId: string;
  username: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
  isBanned: boolean | null;
  activatedAt: Date | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

function createAuthStorageDouble(options?: {
  userByUsername?: Record<string, any>;
  userByEmail?: Record<string, any>;
}) {
  const resetRequests: Array<{ userId: string; requestedByUser: string }> = [];
  const auditLogs: AuditEntry[] = [];

  const storage = {
    getUserByUsername: async (username: string) => options?.userByUsername?.[username] ?? null,
    getUserByEmail: async (email: string) => options?.userByEmail?.[email] ?? null,
    createPasswordResetRequest: async (payload: { userId: string; requestedByUser: string }) => {
      resetRequests.push(payload);
      return { id: `reset-${resetRequests.length}`, ...payload };
    },
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
  } as unknown as PostgresStorage;

  return {
    storage,
    resetRequests,
    auditLogs,
  };
}

function createActivationStorageDouble(options?: {
  activationRecord?: Partial<ActivationRecord>;
  user?: Record<string, any>;
}) {
  const now = new Date();
  const rawToken = "activation-token-test-123";
  const tokenHash = hashOpaqueToken(rawToken);
  const auditLogs: AuditEntry[] = [];
  const invalidateCalls: string[] = [];
  const updateCalls: Array<Record<string, unknown>> = [];
  const user = {
    id: "user-activate-1",
    username: "pending.user",
    fullName: "Pending User",
    email: "pending.user@example.com",
    role: "user",
    status: "pending_activation",
    passwordHash: null,
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    isBanned: false,
    activatedAt: null,
    passwordChangedAt: null,
    lastLoginAt: null,
    ...options?.user,
  };
  const activationRecord: ActivationRecord = {
    tokenId: "token-1",
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: "pending_activation",
    isBanned: false,
    activatedAt: null,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    usedAt: null,
    createdAt: now,
    ...options?.activationRecord,
  };

  const recordByHash = new Map<string, ActivationRecord>([[tokenHash, activationRecord]]);

  const storage = {
    getActivationTokenRecordByHash: async (hash: string) => recordByHash.get(hash) ?? null,
    consumeActivationTokenById: async ({ tokenId, now: consumedAt }: { tokenId: string; now: Date }) => {
      const record = Array.from(recordByHash.values()).find((entry) => entry.tokenId === tokenId) ?? null;
      if (!record || record.usedAt) {
        return false;
      }
      record.usedAt = consumedAt;
      return true;
    },
    getUser: async (userId: string) => (userId === user.id ? user : null),
    updateUserAccount: async (params: Record<string, any>) => {
      updateCalls.push(params);
      Object.assign(user, {
        passwordHash: params.passwordHash,
        status: params.status,
        mustChangePassword: params.mustChangePassword,
        passwordResetBySuperuser: params.passwordResetBySuperuser,
        activatedAt: params.activatedAt,
        passwordChangedAt: params.passwordChangedAt,
      });
      return user;
    },
    invalidateUnusedActivationTokens: async (userId: string) => {
      invalidateCalls.push(userId);
    },
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
  } as unknown as PostgresStorage;

  return {
    storage,
    rawToken,
    user,
    auditLogs,
    invalidateCalls,
    updateCalls,
  };
}

function createPasswordResetStorageDouble(options?: {
  resetRecord?: Partial<PasswordResetRecord>;
  user?: Record<string, any>;
}) {
  const now = new Date();
  const rawToken = "password-reset-token-test-456";
  const tokenHash = hashOpaqueToken(rawToken);
  const auditLogs: AuditEntry[] = [];
  const invalidateCalls: Array<{ userId: string; now: Date }> = [];
  const updateCalls: Array<Record<string, unknown>> = [];
  const deactivatedSessions: Array<{ username: string; reason: string }> = [];
  const user = {
    id: "user-reset-1",
    username: "reset.user",
    fullName: "Reset User",
    email: "reset.user@example.com",
    role: "user",
    status: "active",
    passwordHash: "$2b$10$1VQv8s4QS6j3fAD/0VjV6euQkTQ6j3Q9T5o9pL7V4Q7ZQ6XnU6QKa",
    mustChangePassword: true,
    passwordResetBySuperuser: true,
    isBanned: false,
    activatedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    passwordChangedAt: null,
    lastLoginAt: null,
    ...options?.user,
  };
  const resetRecord: PasswordResetRecord = {
    requestId: "reset-request-1",
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
    isBanned: false,
    activatedAt: user.activatedAt,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    usedAt: null,
    createdAt: now,
    ...options?.resetRecord,
  };

  const recordByHash = new Map<string, PasswordResetRecord>([[tokenHash, resetRecord]]);

  const storage = {
    getPasswordResetTokenRecordByHash: async (hash: string) => recordByHash.get(hash) ?? null,
    consumePasswordResetRequestById: async ({ requestId, now: consumedAt }: { requestId: string; now: Date }) => {
      const record = Array.from(recordByHash.values()).find((entry) => entry.requestId === requestId) ?? null;
      if (!record || record.usedAt) {
        return false;
      }
      record.usedAt = consumedAt;
      return true;
    },
    getUser: async (userId: string) => (userId === user.id ? user : null),
    updateUserAccount: async (params: Record<string, any>) => {
      updateCalls.push(params);
      Object.assign(user, {
        passwordHash: params.passwordHash,
        status: user.status,
        mustChangePassword: params.mustChangePassword,
        passwordResetBySuperuser: params.passwordResetBySuperuser,
        activatedAt: params.activatedAt,
        passwordChangedAt: params.passwordChangedAt,
      });
      return user;
    },
    invalidateUnusedPasswordResetTokens: async (userId: string, invalidatedAt: Date) => {
      invalidateCalls.push({ userId, now: invalidatedAt });
    },
    getActiveActivitiesByUsername: async (username: string) => (username === user.username
      ? [{ id: "activity-1" }, { id: "activity-2" }]
      : []),
    deactivateUserActivities: async (username: string, reason: string) => {
      deactivatedSessions.push({ username, reason });
    },
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
  } as unknown as PostgresStorage;

  return {
    storage,
    rawToken,
    user,
    auditLogs,
    invalidateCalls,
    updateCalls,
    deactivatedSessions,
  };
}

function createCookieAuthStorageDouble() {
  const user = {
    id: "cookie-user-1",
    username: "cookie.user",
    fullName: "Cookie User",
    email: "cookie.user@example.com",
    role: "admin",
    status: "active",
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    isBanned: false,
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    passwordChangedAt: null,
    lastLoginAt: null,
  };
  const activity = {
    id: "activity-cookie-1",
    userId: user.id,
    username: user.username,
    role: user.role,
    isActive: true,
    logoutTime: null,
    fingerprint: "fingerprint-cookie",
    ipAddress: "127.0.0.1",
  };

  const storage = {
    getActivityById: async (activityId: string) => (activityId === activity.id ? activity : null),
    getUser: async (userId: string) => (userId === user.id ? user : null),
    getUserByUsername: async (username: string) => (username === user.username ? user : null),
    isVisitorBanned: async () => false,
    updateActivity: async () => activity,
    getRoleTabVisibility: async () => ({}),
  } as unknown as PostgresStorage;

  return {
    storage,
    user,
    activity,
  };
}

async function createLoginStorageDouble() {
  const passwordHash = await hashPassword("StrongPass123!");
  const auditLogs: AuditEntry[] = [];
  const user = {
    id: "login-user-1",
    username: "login.user",
    fullName: "Login User",
    email: "login.user@example.com",
    role: "user",
    status: "active",
    passwordHash,
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    isBanned: false,
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    passwordChangedAt: new Date("2026-03-01T00:00:00.000Z"),
    lastLoginAt: null,
  };
  const activity = {
    id: "activity-login-1",
    userId: user.id,
    username: user.username,
    role: user.role,
    isActive: true,
    logoutTime: null,
    fingerprint: "fingerprint-login",
    ipAddress: "127.0.0.1",
  };

  const storage = {
    getUserByUsername: async (username: string) => (username === user.username ? user : null),
    isVisitorBanned: async () => false,
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
    createActivity: async () => activity,
    touchLastLogin: async () => undefined,
  } as unknown as PostgresStorage;

  return {
    storage,
    user,
    activity,
    auditLogs,
  };
}

test("POST /api/auth/request-password-reset stays generic for unknown accounts", async () => {
  const { storage, resetRequests, auditLogs } = createAuthStorageDouble();
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/auth/request-password-reset`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ identifier: "missing.user@example.com" }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      message: "If the account exists, the request has been submitted for superuser review.",
    });
    assert.equal(resetRequests.length, 0);
    assert.equal(auditLogs.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/me accepts the auth session cookie without a bearer token", async () => {
  const secret = "cookie-auth-test-secret";
  const { storage, user, activity } = createCookieAuthStorageDouble();
  const guards = createAuthGuards({ storage, secret });
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: guards.authenticateToken,
    requireRole: guards.requireRole,
    connectedClients: new Map(),
  });

  const token = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      activityId: activity.id,
    },
    secret,
    { expiresIn: "24h" },
  );

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/me`, {
      headers: {
        Cookie: `sqr_auth=${encodeURIComponent(token)}`,
      },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.user.username, user.username);
    assert.equal(payload.user.role, user.role);
    assert.equal(payload.user.status, user.status);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/auth/login sets the auth cookie without exposing the JWT in JSON", async () => {
  const { storage, user, activity, auditLogs } = await createLoginStorageDouble();
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: user.username,
        password: "StrongPass123!",
        fingerprint: "fingerprint-login",
        browser: "Mozilla/5.0",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.username, user.username);
    assert.equal(payload.activityId, activity.id);
    assert.equal(payload.token, undefined);

    const setCookie = response.headers.get("set-cookie") || "";
    assert.match(setCookie, /sqr_auth=/);
    assert.match(setCookie, /sqr_auth_hint=1/);
    assert.equal(auditLogs.some((entry) => entry.action === "LOGIN_SUCCESS"), true);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/auth/login scopes visitor-ban lookup to the target username", async () => {
  const { storage, user } = await createLoginStorageDouble();
  let banLookup: { fingerprint: string | null; ipAddress: string | null; username: string | null } | null = null;

  const storageWithBanSpy = {
    ...storage,
    isVisitorBanned: async (
      fingerprint?: string | null,
      ipAddress?: string | null,
      username?: string | null,
    ) => {
      banLookup = {
        fingerprint: fingerprint ?? null,
        ipAddress: ipAddress ?? null,
        username: username ?? null,
      };
      return false;
    },
  } as unknown as PostgresStorage;

  const app = createJsonTestApp();
  registerAuthRoutes(app, {
    storage: storageWithBanSpy,
    authenticateToken: (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: user.username,
        password: "StrongPass123!",
        fingerprint: "fingerprint-login",
        browser: "Mozilla/5.0",
      }),
    });

    assert.equal(response.status, 200);
    assert.ok(banLookup, "expected visitor-ban lookup to be called during login");
    const lookup = banLookup as { fingerprint: string | null; ipAddress: string | null; username: string | null };
    assert.equal(lookup.fingerprint, "fingerprint-login");
    assert.equal(lookup.username, user.username);
    assert.ok(
      typeof lookup.ipAddress === "string" && lookup.ipAddress.includes("127.0.0.1"),
      "expected login IP to be forwarded to visitor-ban lookup",
    );
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/auth/request-password-reset creates a request and audit log for a known manageable account", async () => {
  const managedUser = {
    id: "user-1",
    username: "managed.user",
    email: "managed.user@example.com",
    role: "user",
  };
  const { storage, resetRequests, auditLogs } = createAuthStorageDouble({
    userByUsername: {
      "managed.user": managedUser,
    },
    userByEmail: {
      "managed.user@example.com": managedUser,
    },
  });
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/auth/request-password-reset`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ identifier: "managed.user@example.com" }),
    });

    assert.equal(response.status, 200);
    assert.equal(resetRequests.length, 1);
    assert.deepEqual(resetRequests[0], {
      userId: "user-1",
      requestedByUser: "managed.user@example.com",
    });
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "PASSWORD_RESET_REQUESTED");
    assert.equal(auditLogs[0].performedBy, "managed.user");
    assert.equal(auditLogs[0].targetUser, "user-1");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/auth/request-password-reset is rate limited after repeated attempts", async () => {
  const { storage } = createAuthStorageDouble();
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
    rateLimiters: {
      publicRecovery: rateLimit({
        windowMs: 60 * 1000,
        max: 2,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (_req, res) => {
          res.status(429).json({
            ok: false,
            error: {
              code: "AUTH_RECOVERY_RATE_LIMITED",
              message: "Too many activation or password reset attempts. Please try again shortly.",
            },
          });
        },
      }),
    },
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const requestBody = JSON.stringify({ identifier: "missing.user@example.com" });
    const headers = { "Content-Type": "application/json" };

    const first = await fetch(`${baseUrl}/api/auth/request-password-reset`, {
      method: "POST",
      headers,
      body: requestBody,
    });
    const second = await fetch(`${baseUrl}/api/auth/request-password-reset`, {
      method: "POST",
      headers,
      body: requestBody,
    });
    const third = await fetch(`${baseUrl}/api/auth/request-password-reset`, {
      method: "POST",
      headers,
      body: requestBody,
    });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
    assert.deepEqual(await third.json(), {
      ok: false,
      error: {
        code: "AUTH_RECOVERY_RATE_LIMITED",
        message: "Too many activation or password reset attempts. Please try again shortly.",
      },
    });
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/auth/validate-activation-token returns activation metadata for a valid pending token", async () => {
  const { storage, rawToken } = createActivationStorageDouble();
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/auth/validate-activation-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: rawToken }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.activation.username, "pending.user");
    assert.equal(payload.activation.email, "pending.user@example.com");
    assert.equal(payload.activation.role, "user");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/auth/activate-account activates a pending account, hashes the password, and audits completion", async () => {
  const { storage, rawToken, user, auditLogs, invalidateCalls, updateCalls } = createActivationStorageDouble();
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/auth/activate-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "pending.user",
        token: rawToken,
        newPassword: "StrongPass123",
        confirmPassword: "StrongPass123",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.user.status, "active");
    assert.equal(updateCalls.length, 1);
    assert.equal(typeof user.passwordHash, "string");
    assert.notEqual(user.passwordHash, "StrongPass123");
    assert.equal(await verifyPassword("StrongPass123", user.passwordHash), true);
    assert.deepEqual(invalidateCalls, [user.id]);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "ACCOUNT_ACTIVATION_COMPLETED");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/auth/activate-account rejects a token that has already been used", async () => {
  const { storage, rawToken } = createActivationStorageDouble({
    activationRecord: {
      usedAt: new Date(),
    },
  });
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/auth/activate-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: rawToken,
        newPassword: "StrongPass123",
        confirmPassword: "StrongPass123",
      }),
    });

    assert.equal(response.status, 410);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "TOKEN_USED");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/auth/validate-password-reset-token returns reset metadata for a valid token", async () => {
  const { storage, rawToken } = createPasswordResetStorageDouble();
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/auth/validate-password-reset-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: rawToken }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.reset.username, "reset.user");
    assert.equal(payload.reset.email, "reset.user@example.com");
    assert.equal(payload.reset.role, "user");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/auth/reset-password-with-token updates credentials, invalidates old resets, and audits completion", async () => {
  const {
    storage,
    rawToken,
    user,
    auditLogs,
    invalidateCalls,
    updateCalls,
    deactivatedSessions,
  } = createPasswordResetStorageDouble();
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/auth/reset-password-with-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: rawToken,
        newPassword: "ResetStrong123",
        confirmPassword: "ResetStrong123",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(updateCalls.length, 1);
    assert.equal(typeof user.passwordHash, "string");
    assert.equal(await verifyPassword("ResetStrong123", user.passwordHash), true);
    assert.equal(user.mustChangePassword, false);
    assert.equal(user.passwordResetBySuperuser, false);
    assert.equal(invalidateCalls.length, 1);
    assert.equal(invalidateCalls[0].userId, user.id);
    assert.deepEqual(deactivatedSessions, [{
      username: "reset.user",
      reason: "PASSWORD_RESET_COMPLETED",
    }]);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "PASSWORD_RESET_COMPLETED");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/auth/reset-password-with-token rejects a token that has already been used", async () => {
  const { storage, rawToken } = createPasswordResetStorageDouble({
    resetRecord: {
      usedAt: new Date(),
    },
  });
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/auth/reset-password-with-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: rawToken,
        newPassword: "ResetStrong123",
        confirmPassword: "ResetStrong123",
      }),
    });

    assert.equal(response.status, 410);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "TOKEN_USED");
  } finally {
    await stopTestServer(server);
  }
});
