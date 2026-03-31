import assert from "node:assert/strict";
import test from "node:test";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { createAuthGuards } from "../../auth/guards";
import { hashPassword, verifyPassword } from "../../auth/passwords";
import {
  encryptTwoFactorSecret,
  generateCurrentTwoFactorCode,
  generateTwoFactorSecret,
} from "../../auth/two-factor";
import { writeDevMailPreview } from "../../mail/dev-mail-outbox";
import { registerAuthRoutes } from "../auth.routes";
import type { PostgresStorage } from "../../storage-postgres";
import {
  createTestAuthenticateToken,
  createTestRequireRole,
  createJsonTestApp,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";
import {
  authenticateAs,
  createActivationStorageDouble,
  createAuthStorageDouble,
  createCookieAuthStorageDouble,
  createLoginStorageDouble,
  createOwnCredentialsStorageDouble,
  createPasswordResetStorageDouble,
} from "./auth-route-auth-flow-doubles";
import { ERROR_CODES } from "../../../shared/error-codes";
import {
  createAccountsStorageDouble,
  createDevMailAdminStorageDouble,
  createManagedUsersPageStorageDouble,
  createPendingResetPageStorageDouble,
  withDevMailOutboxFixture,
} from "./auth-route-admin-doubles";

const previousTwoFactorEncryptionKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;
process.env.TWO_FACTOR_ENCRYPTION_KEY = "test-two-factor-encryption-key";

test.after(() => {
  if (previousTwoFactorEncryptionKey === undefined) {
    delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
    return;
  }
  process.env.TWO_FACTOR_ENCRYPTION_KEY = previousTwoFactorEncryptionKey;
});

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

test("GET /api/admin/users returns paginated managed users and forwards filters", async () => {
  const { storage, actor, listPageCalls } = createManagedUsersPageStorageDouble();
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: authenticateAs(actor),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(
      `${baseUrl}/api/admin/users?page=2&pageSize=15&search=alpha&role=admin&status=active`,
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.users.length, 1);
    assert.deepEqual(payload.pagination, {
      page: 2,
      pageSize: 15,
      total: 31,
      totalPages: 3,
    });
    assert.equal(listPageCalls.length, 1);
    assert.equal(listPageCalls[0].page, 2);
    assert.equal(listPageCalls[0].pageSize, 15);
    assert.equal(listPageCalls[0].search, "alpha");
    assert.equal(listPageCalls[0].role, "admin");
    assert.equal(listPageCalls[0].status, "active");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/admin/password-reset-requests returns paginated rows and forwards filters", async () => {
  const { storage, actor, listPageCalls } = createPendingResetPageStorageDouble();
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: authenticateAs(actor),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const response = await fetch(
      `${baseUrl}/api/admin/password-reset-requests?page=1&pageSize=20&search=user&status=banned`,
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.requests.length, 1);
    assert.deepEqual(payload.pagination, {
      page: 1,
      pageSize: 20,
      total: 7,
      totalPages: 2,
    });
    assert.equal(listPageCalls.length, 1);
    assert.equal(listPageCalls[0].page, 1);
    assert.equal(listPageCalls[0].pageSize, 20);
    assert.equal(listPageCalls[0].search, "user");
    assert.equal(listPageCalls[0].status, "banned");
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

test("GET /dev/mail-preview/:previewId returns 404 in production mode", { concurrency: false }, async () => {
  await withDevMailOutboxFixture(async () => {
    const preview = await writeDevMailPreview({
      to: "preview.user@example.com",
      subject: "Activation Preview",
      text: "Plain preview body",
      html: "<p><strong>Preview body</strong></p>",
    });
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

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
      assert.equal(response.status, 404);
    } finally {
      await stopTestServer(server);
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
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

test("GET /api/admin/dev-mail-outbox supports pagination and subject filter", { concurrency: false }, async () => {
  await withDevMailOutboxFixture(async () => {
    await writeDevMailPreview({
      to: "mail.one@example.com",
      subject: "Alpha Subject",
      text: "Alpha",
      html: "<p>Alpha</p>",
    });
    const betaPreview = await writeDevMailPreview({
      to: "mail.two@example.com",
      subject: "Beta Subject",
      text: "Beta",
      html: "<p>Beta</p>",
    });
    await writeDevMailPreview({
      to: "mail.three@example.com",
      subject: "Gamma Subject",
      text: "Gamma",
      html: "<p>Gamma</p>",
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
      const response = await fetch(
        `${baseUrl}/api/admin/dev-mail-outbox?page=1&pageSize=1&searchSubject=Beta`,
      );
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.previews.length, 1);
      assert.equal(payload.previews[0].id, betaPreview.messageId);
      assert.deepEqual(payload.pagination, {
        page: 1,
        pageSize: 1,
        total: 1,
        totalPages: 1,
      });
    } finally {
      await stopTestServer(server);
    }
  });
});

test("GET /api/admin/dev-mail-outbox requires superuser role", { concurrency: false }, async () => {
  await withDevMailOutboxFixture(async () => {
    const { storage } = createDevMailAdminStorageDouble();
    const app = createJsonTestApp();

    registerAuthRoutes(app, {
      storage,
      authenticateToken: createTestAuthenticateToken({
        userId: "admin-1",
        username: "admin.user",
        role: "admin",
      }),
      requireRole: createTestRequireRole(),
      connectedClients: new Map(),
    });

    const { server, baseUrl } = await startTestServer(app);
    try {
      const response = await fetch(`${baseUrl}/api/admin/dev-mail-outbox`);
      assert.equal(response.status, 403);
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

test("POST /api/auth/login keeps unknown usernames generic without leaking account existence", async () => {
  const auditLogs: Array<{ action: string; performedBy?: string; details?: string }> = [];
  const storage = {
    getUserByUsername: async () => null,
    isVisitorBanned: async () => false,
    createAuditLog: async (entry: { action: string; performedBy?: string; details?: string }) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
  } as unknown as PostgresStorage;
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
        username: "missing.user",
        password: "WrongPassword!",
        fingerprint: "fingerprint-missing",
        browser: "Mozilla/5.0",
      }),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: "Invalid credentials",
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Invalid credentials",
      },
    });
    assert.deepEqual(auditLogs, [{
      action: "LOGIN_FAILED",
      performedBy: "missing.user",
      details: "User not found",
    }]);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/auth/login rejects malformed request bodies with a validation error code", async () => {
  const { storage, auditLogs } = await createLoginStorageDouble();
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
        username: 123,
        password: "StrongPass123!",
      }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: "Expected string, received number",
      error: {
        code: ERROR_CODES.REQUEST_BODY_INVALID,
        message: "Expected string, received number",
        details: [
          {
            code: "invalid_type",
            message: "Expected string, received number",
            path: "username",
          },
        ],
      },
    });
    assert.equal(auditLogs.length, 0);
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

test("POST /api/auth/login deactivates and closes older sessions for the same account", async () => {
  const {
    storage,
    user,
    activeSessions,
    deactivatedSessions,
    auditLogs,
  } = await createLoginStorageDouble({
    activeSessions: [
      { id: "activity-existing-1" },
      { id: "activity-existing-2" },
    ],
  });
  const sentPayloads: string[] = [];
  let closedCount = 0;
  const connectedClients = new Map<string, any>([
    ["activity-existing-1", {
      readyState: 1,
      send: (payload: string) => {
        sentPayloads.push(payload);
      },
      close: () => {
        closedCount += 1;
      },
    }],
    ["activity-existing-2", {
      readyState: 1,
      send: (payload: string) => {
        sentPayloads.push(payload);
      },
      close: () => {
        closedCount += 1;
      },
    }],
  ]);
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients,
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
    assert.deepEqual(deactivatedSessions, [{
      username: user.username,
      reason: "NEW_SESSION",
    }]);
    assert.equal(closedCount, activeSessions.length);
    assert.equal(sentPayloads.length, activeSessions.length);
    assert.ok(sentPayloads.every((payload) => payload.includes("another browser or device")));
    assert.equal(connectedClients.size, 0);
    assert.equal(auditLogs.some((entry) => entry.action === "LOGIN_REPLACED_EXISTING_SESSION"), true);
    assert.equal(auditLogs.some((entry) => entry.action === "LOGIN_SUCCESS"), true);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/auth/login locks valid accounts after more than three failed password attempts", async () => {
  const { storage, user, auditLogs } = await createLoginStorageDouble();
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    for (const _attempt of [1, 2, 3]) {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: user.username,
          password: "WrongPassword!",
          fingerprint: "fingerprint-login",
          browser: "Mozilla/5.0",
        }),
      });

      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        ok: false,
        message: "Invalid credentials",
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid credentials",
        },
      });
    }

    const lockedResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: user.username,
        password: "WrongPassword!",
        fingerprint: "fingerprint-login",
        browser: "Mozilla/5.0",
      }),
    });

    assert.equal(lockedResponse.status, 423);
    assert.deepEqual(await lockedResponse.json(), {
      ok: false,
      message: "Your account has been locked due to too many incorrect login attempts. Please contact the system administrator.",
      error: {
        code: "ACCOUNT_LOCKED",
        message: "Your account has been locked due to too many incorrect login attempts. Please contact the system administrator.",
      },
      locked: true,
    });
    assert.equal(user.failedLoginAttempts, 4);
    assert.ok(user.lockedAt instanceof Date);
    assert.equal(user.lockedReason, "too_many_failed_password_attempts");
    assert.equal(user.lockedBySystem, true);
    assert.equal(auditLogs.some((entry) => entry.action === "ACCOUNT_LOCKED_TOO_MANY_FAILED_LOGINS"), true);

    const blockedResponse = await fetch(`${baseUrl}/api/auth/login`, {
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

    assert.equal(blockedResponse.status, 423);
    const blockedPayload = await blockedResponse.json();
    assert.equal(blockedPayload.locked, true);
    assert.equal(blockedPayload.error?.code, "ACCOUNT_LOCKED");
    assert.equal(auditLogs.some((entry) => entry.action === "LOGIN_BLOCKED_LOCKED_ACCOUNT"), true);
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

test("POST /api/auth/login returns a 2FA challenge for enabled admin accounts and verifies it", async () => {
  const secret = generateTwoFactorSecret();
  const { storage, user, activity, auditLogs } = await createLoginStorageDouble({
    user: {
      role: "admin",
      twoFactorEnabled: true,
      twoFactorSecretEncrypted: encryptTwoFactorSecret(secret),
      twoFactorConfiguredAt: new Date("2026-03-20T00:00:00.000Z"),
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
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
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

    assert.equal(loginResponse.status, 200);
    const loginPayload = await loginResponse.json();
    assert.equal(loginPayload.ok, true);
    assert.equal(loginPayload.twoFactorRequired, true);
    assert.equal(typeof loginPayload.challengeToken, "string");
    const initialSetCookie = loginResponse.headers.get("set-cookie") || "";
    assert.equal(initialSetCookie.includes("sqr_auth="), false);

    const code = generateCurrentTwoFactorCode(secret);

    const verifyResponse = await fetch(`${baseUrl}/api/auth/verify-two-factor-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        challengeToken: loginPayload.challengeToken,
        code,
      }),
    });

    assert.equal(verifyResponse.status, 200);
    const verifyPayload = await verifyResponse.json();
    assert.equal(verifyPayload.ok, true);
    assert.equal(verifyPayload.activityId, activity.id);
    const setCookie = verifyResponse.headers.get("set-cookie") || "";
    assert.match(setCookie, /sqr_auth=/);
    assert.equal(auditLogs.some((entry) => entry.action === "LOGIN_SECOND_FACTOR_REQUIRED"), true);
    assert.equal(auditLogs.some((entry) => entry.action === "LOGIN_SUCCESS"), true);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/auth/verify-two-factor-login closes older sessions after successful verification", async () => {
  const secret = generateTwoFactorSecret();
  const {
    storage,
    user,
    activity,
    deactivatedSessions,
  } = await createLoginStorageDouble({
    user: {
      role: "admin",
      twoFactorEnabled: true,
      twoFactorSecretEncrypted: encryptTwoFactorSecret(secret),
      twoFactorConfiguredAt: new Date("2026-03-20T00:00:00.000Z"),
    },
    activeSessions: [
      { id: "activity-existing-2fa-1" },
    ],
  });
  const sentPayloads: string[] = [];
  let closedCount = 0;
  const connectedClients = new Map<string, any>([
    ["activity-existing-2fa-1", {
      readyState: 1,
      send: (payload: string) => {
        sentPayloads.push(payload);
      },
      close: () => {
        closedCount += 1;
      },
    }],
  ]);
  const app = createJsonTestApp();

  registerAuthRoutes(app, {
    storage,
    authenticateToken: (_req, _res, next) => next(),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients,
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
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

    assert.equal(loginResponse.status, 200);
    const loginPayload = await loginResponse.json();
    const verifyResponse = await fetch(`${baseUrl}/api/auth/verify-two-factor-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        challengeToken: loginPayload.challengeToken,
        code: generateCurrentTwoFactorCode(secret),
      }),
    });

    assert.equal(verifyResponse.status, 200);
    const verifyPayload = await verifyResponse.json();
    assert.equal(verifyPayload.activityId, activity.id);
    assert.deepEqual(deactivatedSessions, [{
      username: user.username,
      reason: "NEW_SESSION",
    }]);
    assert.equal(closedCount, 1);
    assert.equal(sentPayloads.length, 1);
    assert.ok(sentPayloads[0]?.includes("another browser or device"));
    assert.equal(connectedClients.size, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("authenticated users can set up, enable, and disable 2FA through auth routes", async () => {
  const passwordHash = await hashPassword("Password123!");
  const auditLogs: Array<{ action: string }> = [];
  const user = {
    id: "admin-two-factor-1",
    username: "admin.twofactor",
    fullName: "Admin Two Factor",
    email: "admin.twofactor@example.com",
    role: "admin",
    status: "active",
    passwordHash,
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    createdBy: null,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    passwordChangedAt: new Date("2026-03-01T00:00:00.000Z"),
    activatedAt: new Date("2026-03-01T00:00:00.000Z"),
    lastLoginAt: null,
    isBanned: false,
    twoFactorEnabled: false,
    twoFactorSecretEncrypted: null as string | null,
    twoFactorConfiguredAt: null as Date | null,
  };

  const storage = {
    getUser: async (userId: string) => (userId === user.id ? user : null),
    getUserByUsername: async (username: string) => (username === user.username ? user : null),
    updateUserCredentials: async () => user,
    updateActivitiesUsername: async () => undefined,
    getActiveActivitiesByUsername: async () => [],
    deactivateUserActivities: async () => undefined,
    updateUserAccount: async (params: Record<string, unknown>) => {
      Object.assign(user, {
        twoFactorEnabled: params.twoFactorEnabled ?? user.twoFactorEnabled,
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
    createAuditLog: async (entry: any) => {
      auditLogs.push({ action: String(entry?.action || "") });
      return entry;
    },
  } as unknown as PostgresStorage;

  const app = createJsonTestApp();
  registerAuthRoutes(app, {
    storage,
    authenticateToken: authenticateAs(user),
    requireRole: () => (_req, _res, next) => next(),
    connectedClients: new Map(),
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const setupResponse = await fetch(`${baseUrl}/api/auth/two-factor/setup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "Password123!",
      }),
    });

    assert.equal(setupResponse.status, 200);
    const setupPayload = await setupResponse.json();
    assert.equal(typeof setupPayload.setup.secret, "string");
    assert.equal(user.twoFactorEnabled, false);
    assert.equal(typeof user.twoFactorSecretEncrypted, "string");

    const code = generateCurrentTwoFactorCode(setupPayload.setup.secret);
    const enableResponse = await fetch(`${baseUrl}/api/auth/two-factor/enable`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
      }),
    });

    assert.equal(enableResponse.status, 200);
    assert.equal(user.twoFactorEnabled, true);
    assert.ok(user.twoFactorConfiguredAt instanceof Date);

    const disableResponse = await fetch(`${baseUrl}/api/auth/two-factor/disable`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "Password123!",
        code: generateCurrentTwoFactorCode(setupPayload.setup.secret),
      }),
    });

    assert.equal(disableResponse.status, 200);
    assert.equal(user.twoFactorEnabled, false);
    assert.equal(user.twoFactorSecretEncrypted, null);
    assert.equal(user.twoFactorConfiguredAt, null);
    assert.equal(auditLogs.some((entry) => entry.action === "TWO_FACTOR_SETUP_INITIATED"), true);
    assert.equal(auditLogs.some((entry) => entry.action === "TWO_FACTOR_ENABLED"), true);
    assert.equal(auditLogs.some((entry) => entry.action === "TWO_FACTOR_DISABLED"), true);
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

test("POST /api/auth/validate-password-reset-token accepts database-style UTC timestamps without timezone", async () => {
  const { storage, rawToken } = createPasswordResetStorageDouble({
    resetRecord: {
      expiresAt: "2099-03-30 17:54:00" as any,
      createdAt: "2099-03-30 09:54:00" as any,
      activatedAt: "2099-03-29 09:00:00" as any,
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
