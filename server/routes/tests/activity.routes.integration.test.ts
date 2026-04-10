import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";
import type { RequestHandler } from "express";
import { ERROR_CODES } from "../../../shared/error-codes";
import { registerActivityRoutes } from "../activity.routes";
import type { PostgresStorage } from "../../storage-postgres";
import {
  allowAllTabs,
  createJsonTestApp,
  createTestAuthenticateToken,
  createTestRequireRole,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

type AuditEntry = {
  action: string;
  performedBy?: string;
  targetUser?: string;
  details?: string;
};

type ActivityRecord = {
  id: string;
  userId?: string;
  username: string;
  role: string;
  isActive: boolean;
  loginTime?: Date | null;
  logoutTime: Date | null;
  logoutReason?: string | null;
  fingerprint?: string | null;
  ipAddress?: string | null;
  browser?: string | null;
  pcName?: string | null;
  lastActivityTime?: Date | null;
};

type StoredActivityRecord = NonNullable<Awaited<ReturnType<PostgresStorage["getActivityById"]>>>;
type StoredActivityFeedRecord = Awaited<ReturnType<PostgresStorage["getAllActivities"]>>[number] & {
  status?: string;
};

type UserRecord = {
  id: string;
  username: string;
  role: string;
  isBanned?: boolean | null;
};

type BannedSessionRecord = {
  banId: string;
  username: string;
  role: string;
  fingerprint: string | null;
  ipAddress: string | null;
  browser: string | null;
  bannedAt: Date | null;
};

type SocketState = {
  closeCalls: number;
  sentMessages: string[];
};

function createMockSocket(): { socket: WebSocket; state: SocketState } {
  const state: SocketState = {
    closeCalls: 0,
    sentMessages: [],
  };

  const rawSocket: {
    readyState: number;
    send: (payload: string) => void;
    close: () => void;
  } = {
    readyState: WebSocket.OPEN,
    send(payload: string) {
      state.sentMessages.push(String(payload));
    },
    close() {
      state.closeCalls += 1;
      rawSocket.readyState = WebSocket.CLOSED;
    },
  };

  return {
    socket: rawSocket as unknown as WebSocket,
    state,
  };
}

function toStoredActivity(
  activity: ActivityRecord | undefined,
  overrides: Partial<StoredActivityRecord> = {},
): StoredActivityRecord {
  if (!activity) {
    throw new Error("Expected activity record to exist in test harness.");
  }

  return {
    id: activity.id,
    userId: activity.userId ?? "",
    username: activity.username,
    role: activity.role,
    fingerprint: activity.fingerprint ?? null,
    ipAddress: activity.ipAddress ?? null,
    browser: activity.browser ?? null,
    isActive: activity.isActive,
    pcName: activity.pcName ?? null,
    loginTime: activity.loginTime ?? null,
    logoutTime: activity.logoutTime ?? null,
    lastActivityTime: activity.lastActivityTime ?? null,
    logoutReason: activity.logoutReason ?? null,
    ...overrides,
  };
}

function createActivityRouteHarness(options?: {
  authenticateToken?: RequestHandler;
  adminActionRateLimiter?: RequestHandler;
  adminDestructiveActionRateLimiter?: RequestHandler;
  storageOverrides?: Partial<PostgresStorage>;
}) {
  const auditLogs: AuditEntry[] = [];
  const clearNicknameSessionCalls: string[] = [];
  const deleteActivityCalls: string[] = [];
  const banVisitorCalls: Array<Record<string, unknown>> = [];
  const deactivateUserActivitiesCalls: Array<{ username: string; reason?: string | undefined }> = [];
  const updateUserBanCalls: Array<{ username: string; isBanned: boolean }> = [];
  const unbanVisitorCalls: string[] = [];
  const filteredActivityCalls: Array<Record<string, unknown>> = [];

  const users = new Map<string, UserRecord>([
    ["user.one", { id: "user-1", username: "user.one", role: "user", isBanned: false }],
    ["regular.user", { id: "user-2", username: "regular.user", role: "user", isBanned: false }],
    ["super.root", { id: "user-3", username: "super.root", role: "superuser", isBanned: false }],
  ]);

  const activities = new Map<string, ActivityRecord>([
    [
      "activity-1",
      {
        id: "activity-1",
        userId: "user-1",
        username: "user.one",
        role: "user",
        isActive: true,
        logoutTime: null,
        fingerprint: "fp-1",
        ipAddress: "127.0.0.1",
        browser: "Chrome",
        pcName: "PC-1",
      },
    ],
    [
      "activity-2",
      {
        id: "activity-2",
        userId: "user-2",
        username: "regular.user",
        role: "user",
        isActive: true,
        logoutTime: null,
        fingerprint: "fp-2",
        ipAddress: "127.0.0.2",
        browser: "Edge",
        pcName: "PC-2",
      },
    ],
    [
      "activity-3",
      {
        id: "activity-3",
        userId: "user-2",
        username: "regular.user",
        role: "user",
        isActive: true,
        logoutTime: null,
        fingerprint: "fp-3",
        ipAddress: "127.0.0.3",
        browser: "Firefox",
        pcName: "PC-3",
      },
    ],
    [
      "activity-super",
      {
        id: "activity-super",
        userId: "user-3",
        username: "super.root",
        role: "superuser",
        isActive: true,
        logoutTime: null,
        fingerprint: "fp-super",
        ipAddress: "127.0.0.9",
        browser: "Safari",
        pcName: "PC-SUPER",
      },
    ],
  ]);

  const bannedSessions: BannedSessionRecord[] = [
    {
      banId: "ban-1",
      username: "regular.user",
      role: "user",
      fingerprint: "fp-ban",
      ipAddress: "10.0.0.1",
      browser: "Chrome",
      bannedAt: new Date("2026-03-19T00:00:00.000Z"),
    },
  ];

  const connectedClients = new Map<string, WebSocket>();
  const socketStates = new Map<string, SocketState>();
  for (const activityId of ["activity-1", "activity-2", "activity-3", "activity-super"]) {
    const { socket, state } = createMockSocket();
    connectedClients.set(activityId, socket);
    socketStates.set(activityId, state);
  }

  const defaultStorage = {
    clearCollectionNicknameSessionByActivity: async (activityId: string) => {
      clearNicknameSessionCalls.push(activityId);
    },
    createAuditLog: async (entry: AuditEntry) => {
      auditLogs.push(entry);
      return { id: `audit-${auditLogs.length}`, ...entry };
    },
    deleteActivity: async (activityId: string) => {
      deleteActivityCalls.push(activityId);
      return activities.delete(activityId);
    },
    getActivityById: async (activityId: string) => activities.get(activityId),
    getAllActivities: async () => Array.from(activities.values()),
    getFilteredActivities: async (filters: Record<string, unknown>) => {
      filteredActivityCalls.push(filters);
      return Array.from(activities.values());
    },
    getActiveActivities: async () => Array.from(activities.values()).filter((activity) => activity.isActive),
    getActiveActivitiesByUsername: async (username: string) =>
      Array.from(activities.values()).filter((activity) => activity.username === username && activity.isActive),
    getUserByUsername: async (username: string) => users.get(username),
    updateActivity: async (activityId: string, patch: Partial<ActivityRecord>) => {
      const current = activities.get(activityId);
      if (!current) {
        return undefined;
      }
      const updated = {
        ...current,
        ...patch,
      };
      activities.set(activityId, updated);
      return updated;
    },
    banVisitor: async (params: Record<string, unknown>) => {
      banVisitorCalls.push(params);
    },
    deactivateUserActivities: async (username: string, reason?: string) => {
      deactivateUserActivitiesCalls.push({ username, reason });
      for (const [activityId, activity] of activities.entries()) {
        if (activity.username !== username) {
          continue;
        }
        activities.set(activityId, {
          ...activity,
          isActive: false,
          logoutReason: reason ?? activity.logoutReason ?? null,
        });
      }
    },
    updateUserBan: async (username: string, isBanned: boolean) => {
      updateUserBanCalls.push({ username, isBanned });
      const user = users.get(username);
      if (!user) {
        return undefined;
      }
      const updated = {
        ...user,
        isBanned,
      };
      users.set(username, updated);
      return updated;
    },
    unbanVisitor: async (banId: string) => {
      unbanVisitorCalls.push(banId);
    },
    getBannedSessions: async () => bannedSessions,
  };

  const storage = {
    ...defaultStorage,
    ...(options?.storageOverrides ?? {}),
  } as unknown as PostgresStorage;

  const app = createJsonTestApp();
  registerActivityRoutes(app, {
    storage,
    authenticateToken: options?.authenticateToken ?? createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "superuser",
      activityId: "activity-1",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => allowAllTabs(),
    connectedClients,
    rateLimiters: {
      adminAction: options?.adminActionRateLimiter ?? ((_req, _res, next) => next()),
      adminDestructiveAction:
        options?.adminDestructiveActionRateLimiter ?? ((_req, _res, next) => next()),
    },
  });

  return {
    app,
    auditLogs,
    clearNicknameSessionCalls,
    deleteActivityCalls,
    banVisitorCalls,
    deactivateUserActivitiesCalls,
    updateUserBanCalls,
    unbanVisitorCalls,
    filteredActivityCalls,
    activities,
    connectedClients,
    socketStates,
  };
}

test("POST /api/activity/kick respects the dedicated admin action rate limiter", async () => {
  const { app, auditLogs, socketStates, connectedClients, activities } = createActivityRouteHarness({
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
      activityId: "activity-1",
    }),
    adminActionRateLimiter: (_req, res) => {
      res.status(429).json({
        ok: false,
        error: {
          code: ERROR_CODES.ADMIN_ACTION_RATE_LIMITED,
          message: "Too many admin account actions. Please slow down and try again.",
        },
      });
    },
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/activity/kick`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        activityId: "activity-2",
      }),
    });

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: {
        code: ERROR_CODES.ADMIN_ACTION_RATE_LIMITED,
        message: "Too many admin account actions. Please slow down and try again.",
      },
    });
    assert.equal(activities.get("activity-2")?.isActive, true);
    assert.equal(connectedClients.has("activity-2"), true);
    assert.equal(socketStates.get("activity-2")?.closeCalls, 0);
    assert.equal(auditLogs.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("DELETE /api/activity/:id respects the destructive admin action rate limiter", async () => {
  const { app } = createActivityRouteHarness({
    adminDestructiveActionRateLimiter: (_req, res) => {
      res.status(429).json({
        ok: false,
        error: {
          code: ERROR_CODES.ADMIN_ACTION_RATE_LIMITED,
          message: "Too many destructive admin actions. Please slow down and try again.",
        },
      });
    },
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/activity/activity-1`, {
      method: "DELETE",
    });

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: {
        code: ERROR_CODES.ADMIN_ACTION_RATE_LIMITED,
        message: "Too many destructive admin actions. Please slow down and try again.",
      },
    });
  } finally {
    await stopTestServer(server);
  }
});

test("DELETE /api/activity/logs/bulk-delete respects the destructive admin action rate limiter", async () => {
  const { app } = createActivityRouteHarness({
    adminDestructiveActionRateLimiter: (_req, res) => {
      res.status(429).json({
        ok: false,
        error: {
          code: ERROR_CODES.ADMIN_ACTION_RATE_LIMITED,
          message: "Too many destructive admin actions. Please slow down and try again.",
        },
      });
    },
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/activity/logs/bulk-delete`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ activityIds: ["activity-1"] }),
    });

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: {
        code: ERROR_CODES.ADMIN_ACTION_RATE_LIMITED,
        message: "Too many destructive admin actions. Please slow down and try again.",
      },
    });
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/activity/logout clears the auth cookie and returns 401 when the request has no authenticated user", async () => {
  const { app } = createActivityRouteHarness({
    authenticateToken: (_req, _res, next) => next(),
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/activity/logout`, {
      method: "POST",
      headers: {
        Cookie: "sqr_auth=test-token; sqr_auth_hint=1",
      },
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      ok: false,
    });
    const setCookie = response.headers.get("set-cookie") || "";
    assert.match(setCookie, /sqr_auth=/);
    assert.match(setCookie, /Max-Age=0/i);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/activity/logout logs out the session, closes the socket, and audits the action", async () => {
  const { app, auditLogs, clearNicknameSessionCalls, connectedClients, socketStates, activities } = createActivityRouteHarness({
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "user.one",
      role: "user",
      activityId: "activity-1",
    }),
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/activity/logout`, {
      method: "POST",
      headers: {
        Cookie: "sqr_auth=test-token; sqr_auth_hint=1",
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      success: true,
    });
    assert.equal(activities.get("activity-1")?.isActive, false);
    assert.equal(activities.get("activity-1")?.logoutReason, "USER_LOGOUT");
    assert.equal(connectedClients.has("activity-1"), false);
    assert.deepEqual(clearNicknameSessionCalls, ["activity-1"]);
    assert.equal(socketStates.get("activity-1")?.closeCalls, 1);
    assert.equal(socketStates.get("activity-1")?.sentMessages.length, 0);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "LOGOUT");
    assert.equal(auditLogs[0].performedBy, "user.one");
    const setCookie = response.headers.get("set-cookie") || "";
    assert.match(setCookie, /sqr_auth=/);
    assert.match(setCookie, /Max-Age=0/i);
  } finally {
    await stopTestServer(server);
  }
});

test("DELETE /api/activity/logs/bulk-delete deduplicates ids and reports missing activity ids", async () => {
  const { app, deleteActivityCalls, clearNicknameSessionCalls, socketStates } = createActivityRouteHarness({
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
      activityId: "activity-1",
    }),
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/activity/logs/bulk-delete`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        activityIds: ["activity-2", "missing-activity", "activity-3", "activity-2"],
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      success: true,
      requestedCount: 3,
      deletedCount: 2,
      notFoundIds: ["missing-activity"],
    });
    assert.deepEqual(deleteActivityCalls, ["activity-2", "activity-3"]);
    assert.deepEqual(clearNicknameSessionCalls, ["activity-2", "activity-3"]);
    assert.equal(socketStates.get("activity-2")?.closeCalls, 1);
    assert.equal(socketStates.get("activity-3")?.closeCalls, 1);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/activity/kick returns 404 when the activity does not exist", async () => {
  const { app, auditLogs } = createActivityRouteHarness({
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
      activityId: "activity-1",
    }),
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/activity/kick`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        activityId: "missing-activity",
      }),
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: "Activity not found",
    });
    assert.equal(auditLogs.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/activity/kick closes the target socket and writes an audit log", async () => {
  const { app, auditLogs, socketStates, activities, clearNicknameSessionCalls, connectedClients } = createActivityRouteHarness({
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
      activityId: "activity-1",
    }),
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/activity/kick`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        activityId: "activity-2",
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      success: true,
    });
    assert.equal(activities.get("activity-2")?.isActive, false);
    assert.equal(activities.get("activity-2")?.logoutReason, "KICKED");
    assert.equal(connectedClients.has("activity-2"), false);
    assert.deepEqual(clearNicknameSessionCalls, ["activity-2"]);
    assert.equal(socketStates.get("activity-2")?.closeCalls, 1);
    assert.match(String(socketStates.get("activity-2")?.sentMessages[0]), /"type":"kicked"/);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "KICK_USER");
    assert.equal(auditLogs[0].targetUser, "regular.user");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/activity/ban rejects attempts to ban a superuser session", async () => {
  const { app, auditLogs, banVisitorCalls } = createActivityRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/activity/ban`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        activityId: "activity-super",
      }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: "Cannot ban a superuser",
    });
    assert.equal(auditLogs.length, 0);
    assert.equal(banVisitorCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/admin/ban bans the account, deactivates active sessions, and audits the action", async () => {
  const { app, auditLogs, updateUserBanCalls, deactivateUserActivitiesCalls, clearNicknameSessionCalls, socketStates, connectedClients } = createActivityRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/admin/ban`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "regular.user",
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      success: true,
    });
    assert.deepEqual(updateUserBanCalls, [{
      username: "regular.user",
      isBanned: true,
    }]);
    assert.deepEqual(deactivateUserActivitiesCalls, [{
      username: "regular.user",
      reason: "BANNED",
    }]);
    assert.deepEqual(clearNicknameSessionCalls, ["activity-2", "activity-3"]);
    assert.equal(connectedClients.has("activity-2"), false);
    assert.equal(connectedClients.has("activity-3"), false);
    assert.equal(socketStates.get("activity-2")?.closeCalls, 1);
    assert.equal(socketStates.get("activity-3")?.closeCalls, 1);
    assert.match(String(socketStates.get("activity-2")?.sentMessages[0]), /"type":"banned"/);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "BAN_USER");
    assert.equal(auditLogs[0].targetUser, "regular.user");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/users/banned returns mapped banned session data", async () => {
  const { app } = createActivityRouteHarness({
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
      activityId: "activity-1",
    }),
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/users/banned`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.deepEqual(payload, {
      users: [
        {
          visitorId: "ban-1",
          banId: "ban-1",
          username: "regular.user",
          role: "user",
          banInfo: {
            ipAddress: "10.0.0.1",
            browser: "Chrome",
            bannedAt: "2026-03-19T00:00:00.000Z",
          },
        },
      ],
    });
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/activity/all keeps the requesting active session online when the stored feed is stale", async () => {
  const { app, activities } = createActivityRouteHarness({
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "user.one",
      role: "user",
      activityId: "activity-1",
    }),
    storageOverrides: {
      getAllActivities: async () => [
        {
          ...toStoredActivity(activities.get("activity-1"), {
          loginTime: new Date("2026-04-10T06:05:00.000Z"),
          lastActivityTime: new Date(Date.now() - 10 * 60_000),
          }),
          status: "IDLE",
        } as StoredActivityFeedRecord,
      ],
      getActivityById: async (activityId: string) =>
        activities.has(activityId)
          ? toStoredActivity(activities.get(activityId), {
          loginTime: new Date("2026-04-10T06:05:00.000Z"),
          lastActivityTime: new Date(Date.now() - 10 * 60_000),
          })
          : undefined,
    },
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/activity/all`, {
      headers: {
        "x-test-username": "user.one",
        "x-test-role": "user",
        "x-test-activityid": "activity-1",
      },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.activities.length, 1);
    assert.equal(payload.activities[0]?.id, "activity-1");
    assert.equal(payload.activities[0]?.status, "ONLINE");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/activity/filter removes the requesting session from IDLE results once it is reconciled online", async () => {
  const { app, activities } = createActivityRouteHarness({
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "user.one",
      role: "user",
      activityId: "activity-1",
    }),
    storageOverrides: {
      getFilteredActivities: async () => [
        {
          ...toStoredActivity(activities.get("activity-1"), {
          loginTime: new Date("2026-04-10T06:05:00.000Z"),
          lastActivityTime: new Date(Date.now() - 10 * 60_000),
          }),
          status: "IDLE",
        } as StoredActivityFeedRecord,
      ],
      getActivityById: async (activityId: string) =>
        activities.has(activityId)
          ? toStoredActivity(activities.get(activityId), {
          loginTime: new Date("2026-04-10T06:05:00.000Z"),
          lastActivityTime: new Date(Date.now() - 10 * 60_000),
          })
          : undefined,
    },
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/activity/filter?status=IDLE`, {
      headers: {
        "x-test-username": "user.one",
        "x-test-role": "user",
        "x-test-activityid": "activity-1",
      },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload, {
      activities: [],
    });
  } finally {
    await stopTestServer(server);
  }
});
