import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { createAuthGuards } from "../../auth/guards";
import { hashOpaqueToken, hashPassword, verifyPassword } from "../../auth/passwords";
import { writeDevMailPreview } from "../../mail/dev-mail-outbox";
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

function authenticateAs(user: {
  id?: string;
  username: string;
  role: string;
  mustChangePassword?: boolean;
}) {
  return (req: any, _res: any, next: () => void) => {
    req.user = {
      userId: user.id,
      username: user.username,
      role: user.role,
      activityId: "activity-auth-test-1",
      mustChangePassword: user.mustChangePassword ?? false,
    };
    next();
  };
}

function createOwnCredentialsStorageDouble(options?: {
  user?: Record<string, any>;
  existingUsersByUsername?: Record<string, any>;
}) {
  const auditLogs: AuditEntry[] = [];
  const credentialUpdates: Array<Record<string, unknown>> = [];
  const activityUsernameUpdates: Array<{ previousUsername: string; nextUsername: string }> = [];
  const user = {
    id: "credential-user-1",
    username: "credential.user",
    fullName: "Credential User",
    email: "credential.user@example.com",
    role: "user",
    status: "active",
    passwordHash: "$2b$10$1VQv8s4QS6j3fAD/0VjV6euQkTQ6j3Q9T5o9pL7V4Q7ZQ6XnU6QKa",
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    isBanned: false,
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    passwordChangedAt: null,
    lastLoginAt: null,
    ...options?.user,
  };
  const usersByUsername = new Map<string, Record<string, any>>(
    Object.entries(options?.existingUsersByUsername || {}),
  );
  usersByUsername.set(user.username, user);

  const storage = {
    getUser: async (userId: string) => (userId === user.id ? user : null),
    getUserByUsername: async (username: string) => usersByUsername.get(username) ?? null,
    updateUserCredentials: async (params: Record<string, any>) => {
      credentialUpdates.push(params);

      if (typeof params.newUsername === "string" && params.newUsername) {
        usersByUsername.delete(user.username);
        user.username = params.newUsername;
        usersByUsername.set(user.username, user);
      }

      if (typeof params.newPasswordHash === "string" && params.newPasswordHash) {
        user.passwordHash = params.newPasswordHash;
        user.passwordChangedAt = params.passwordChangedAt ?? user.passwordChangedAt;
        user.mustChangePassword = params.mustChangePassword ?? user.mustChangePassword;
        user.passwordResetBySuperuser =
          params.passwordResetBySuperuser ?? user.passwordResetBySuperuser;
      }

      return user;
    },
    updateActivitiesUsername: async (previousUsername: string, nextUsername: string) => {
      activityUsernameUpdates.push({ previousUsername, nextUsername });
    },
    getActiveActivitiesByUsername: async () => [],
    deactivateUserActivities: async () => undefined,
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
  } as unknown as PostgresStorage;

  return {
    storage,
    user,
    auditLogs,
    credentialUpdates,
    activityUsernameUpdates,
  };
}

function createAccountsStorageDouble() {
  const actor = {
    id: "superuser-1",
    username: "root.admin",
    fullName: "Root Admin",
    email: "root.admin@example.com",
    role: "superuser",
    status: "active",
    passwordHash: null,
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    isBanned: false,
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    passwordChangedAt: null,
    lastLoginAt: null,
  };
  const accounts = [
    { username: "admin.alpha", role: "admin", isBanned: false },
    { username: "user.beta", role: "user", isBanned: true },
  ];

  const storage = {
    getUser: async (userId: string) => (userId === actor.id ? actor : null),
    getUserByUsername: async (username: string) => (username === actor.username ? actor : null),
    getAccounts: async () => accounts,
  } as unknown as PostgresStorage;

  return {
    storage,
    actor,
    accounts,
  };
}

function createDevMailAdminStorageDouble() {
  const actor = {
    id: "superuser-mail-1",
    username: "mail.admin",
    fullName: "Mail Admin",
    email: "mail.admin@example.com",
    role: "superuser",
    status: "active",
    passwordHash: null,
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    isBanned: false,
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    passwordChangedAt: null,
    lastLoginAt: null,
  };
  const auditLogs: AuditEntry[] = [];

  const storage = {
    getUser: async (userId: string) => (userId === actor.id ? actor : null),
    getUserByUsername: async (username: string) => (username === actor.username ? actor : null),
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
  } as unknown as PostgresStorage;

  return {
    storage,
    actor,
    auditLogs,
  };
}

async function withDevMailOutboxFixture(
  run: (context: { outboxDir: string }) => Promise<void>,
) {
  const previousDir = process.env.MAIL_DEV_OUTBOX_DIR;
  const previousEnabled = process.env.MAIL_DEV_OUTBOX_ENABLED;
  const previousNodeEnv = process.env.NODE_ENV;
  const outboxDir = await mkdtemp(path.join(os.tmpdir(), "sqr-dev-mail-outbox-"));

  process.env.MAIL_DEV_OUTBOX_DIR = outboxDir;
  process.env.MAIL_DEV_OUTBOX_ENABLED = "1";
  delete process.env.NODE_ENV;

  try {
    await run({ outboxDir });
  } finally {
    if (previousDir === undefined) {
      delete process.env.MAIL_DEV_OUTBOX_DIR;
    } else {
      process.env.MAIL_DEV_OUTBOX_DIR = previousDir;
    }

    if (previousEnabled === undefined) {
      delete process.env.MAIL_DEV_OUTBOX_ENABLED;
    } else {
      process.env.MAIL_DEV_OUTBOX_ENABLED = previousEnabled;
    }

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    await rm(outboxDir, { recursive: true, force: true });
  }
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

test("GET /api/accounts returns account summaries for the authenticated superuser", async () => {
  const { storage, actor, accounts } = createAccountsStorageDouble();
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: authenticateAs(actor),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/accounts`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      accounts,
    });
  } finally {
    await stopTestServer(server);
  }
});

test("GET /dev/mail-preview/:previewId renders the stored preview HTML", { concurrency: false }, async () => {
  await withDevMailOutboxFixture(async () => {
    const preview = await writeDevMailPreview({
      to: "preview.user@example.com",
      subject: "Activation Preview",
      text: "Plain preview body",
      html: "<p><strong>Preview body</strong></p>",
    });
    const { storage } = createDevMailAdminStorageDouble();
    const app = createJsonTestApp();

    registerAuthRoutes(app, {
      storage,
      authenticateToken: (_req, _res, next) => next(),
      requireRole: () => (_req, _res, next) => next(),
      connectedClients: new Map(),
    });

    const { server, baseUrl } = await startTestServer(app);
    try {
      const response = await fetch(`${baseUrl}/dev/mail-preview/${preview.messageId}`);

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const html = await response.text();
      assert.match(html, /Activation Preview/);
      assert.match(html, /Preview body/);
      assert.match(html, /preview\.user@example\.com/);
    } finally {
      await stopTestServer(server);
    }
  });
});

test("GET /api/admin/dev-mail-outbox returns recent preview entries", { concurrency: false }, async () => {
  await withDevMailOutboxFixture(async () => {
    const preview = await writeDevMailPreview({
      to: "admin.preview@example.com",
      subject: "Reset Preview",
      text: "Reset plain text",
      html: "<p>Reset preview</p>",
    });
    const { storage, actor } = createDevMailAdminStorageDouble();
    const app = createJsonTestApp();

    registerAuthRoutes(app, {
      storage,
      authenticateToken: authenticateAs(actor),
      requireRole: () => (_req, _res, next) => next(),
      connectedClients: new Map(),
    });

    const { server, baseUrl } = await startTestServer(app);
    try {
      const response = await fetch(`${baseUrl}/api/admin/dev-mail-outbox`);

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.enabled, true);
      assert.equal(payload.previews.length, 1);
      assert.equal(payload.previews[0].id, preview.messageId);
      assert.match(payload.previews[0].previewUrl, new RegExp(`/dev/mail-preview/${preview.messageId}$`));
    } finally {
      await stopTestServer(server);
    }
  });
});

test("DELETE /api/admin/dev-mail-outbox/:previewId deletes a preview and audits the action", { concurrency: false }, async () => {
  await withDevMailOutboxFixture(async () => {
    const preview = await writeDevMailPreview({
      to: "delete.preview@example.com",
      subject: "Delete Preview",
      text: "Delete plain text",
      html: "<p>Delete preview</p>",
    });
    const { storage, actor, auditLogs } = createDevMailAdminStorageDouble();
    const app = createJsonTestApp();

    registerAuthRoutes(app, {
      storage,
      authenticateToken: authenticateAs(actor),
      requireRole: () => (_req, _res, next) => next(),
      connectedClients: new Map(),
    });

    const { server, baseUrl } = await startTestServer(app);
    try {
      const response = await fetch(`${baseUrl}/api/admin/dev-mail-outbox/${preview.messageId}`, {
        method: "DELETE",
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        ok: true,
        deleted: true,
      });
      assert.equal(auditLogs.length, 1);
      assert.equal(auditLogs[0].action, "DEV_MAIL_OUTBOX_ENTRY_DELETED");
      assert.equal(auditLogs[0].performedBy, actor.username);

      const previewResponse = await fetch(`${baseUrl}/dev/mail-preview/${preview.messageId}`);
      assert.equal(previewResponse.status, 404);
    } finally {
      await stopTestServer(server);
    }
  });
});

test("DELETE /api/admin/dev-mail-outbox/:previewId returns a 404 when the preview is missing", { concurrency: false }, async () => {
  await withDevMailOutboxFixture(async () => {
    const { storage, actor, auditLogs } = createDevMailAdminStorageDouble();
    const app = createJsonTestApp();

    registerAuthRoutes(app, {
      storage,
      authenticateToken: authenticateAs(actor),
      requireRole: () => (_req, _res, next) => next(),
      connectedClients: new Map(),
    });

    const { server, baseUrl } = await startTestServer(app);
    try {
      const response = await fetch(`${baseUrl}/api/admin/dev-mail-outbox/1710000000000-1234567890abcdef`, {
        method: "DELETE",
      });

      assert.equal(response.status, 404);
      const payload = await response.json();
      assert.equal(payload.ok, false);
      assert.equal(payload.error.code, "MAIL_PREVIEW_NOT_FOUND");
      assert.equal(auditLogs.length, 0);
    } finally {
      await stopTestServer(server);
    }
  });
});

test("DELETE /api/admin/dev-mail-outbox clears previews and audits the deleted count", { concurrency: false }, async () => {
  await withDevMailOutboxFixture(async () => {
    await writeDevMailPreview({
      to: "clear.one@example.com",
      subject: "Clear One",
      text: "First preview",
      html: "<p>First preview</p>",
    });
    await writeDevMailPreview({
      to: "clear.two@example.com",
      subject: "Clear Two",
      text: "Second preview",
      html: "<p>Second preview</p>",
    });
    const { storage, actor, auditLogs } = createDevMailAdminStorageDouble();
    const app = createJsonTestApp();

    registerAuthRoutes(app, {
      storage,
      authenticateToken: authenticateAs(actor),
      requireRole: () => (_req, _res, next) => next(),
      connectedClients: new Map(),
    });

    const { server, baseUrl } = await startTestServer(app);
    try {
      const response = await fetch(`${baseUrl}/api/admin/dev-mail-outbox`, {
        method: "DELETE",
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        ok: true,
        deletedCount: 2,
      });
      assert.equal(auditLogs.length, 1);
      assert.equal(auditLogs[0].action, "DEV_MAIL_OUTBOX_CLEARED");
      assert.deepEqual(JSON.parse(String(auditLogs[0].details)), {
        metadata: {
          deleted_count: 2,
        },
      });

      const listResponse = await fetch(`${baseUrl}/api/admin/dev-mail-outbox`);
      const listPayload = await listResponse.json();
      assert.equal(listPayload.previews.length, 0);
    } finally {
      await stopTestServer(server);
    }
  });
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

test("PATCH /api/me/credentials returns the current user when no credential fields are provided", async () => {
  const { storage, user, credentialUpdates } = createOwnCredentialsStorageDouble();
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: authenticateAs(user),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/me/credentials`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.forceLogout, false);
    assert.equal(payload.user.username, user.username);
    assert.equal(credentialUpdates.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("PATCH /api/me/credentials rejects username-only updates while password change is required", async () => {
  const { storage, user, credentialUpdates, activityUsernameUpdates } = createOwnCredentialsStorageDouble({
    user: {
      mustChangePassword: true,
    },
  });
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: authenticateAs(user),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/me/credentials`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        newUsername: "renamed.user",
      }),
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.ok, false);
    assert.equal(payload.error.code, "PASSWORD_CHANGE_REQUIRED");
    assert.equal(credentialUpdates.length, 0);
    assert.equal(activityUsernameUpdates.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("PATCH /api/me/credentials updates the current username without forcing logout", async () => {
  const { storage, user, auditLogs, activityUsernameUpdates } = createOwnCredentialsStorageDouble();
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: authenticateAs(user),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(`${baseUrl}/api/me/credentials`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        newUsername: "renamed.user",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.forceLogout, false);
    assert.equal(payload.user.username, "renamed.user");
    assert.deepEqual(activityUsernameUpdates, [{
      previousUsername: "credential.user",
      nextUsername: "renamed.user",
    }]);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "USER_USERNAME_CHANGED");
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
