import assert from "node:assert/strict";
import test from "node:test";
import { hashOpaqueToken, verifyPassword } from "../../auth/passwords";
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
