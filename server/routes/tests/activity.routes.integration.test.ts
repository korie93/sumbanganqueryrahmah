import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { WebSocket } from "ws";
import type { RequestHandler } from "express";
import {
  activityListResponseSchema,
  activityPageResponseSchema,
} from "../../../shared/api-contracts";
import { ERROR_CODES } from "../../../shared/error-codes";
import {
  configureSessionRevocationStoreForRuntime,
  isSessionJwtRevoked,
  resetSessionRevocationStoreForTests,
} from "../../auth/session-revocation-store";
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
  targetResource?: string;
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
type ActivityPageParams = Parameters<PostgresStorage["listActivityPage"]>[0];

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
  const activityRetentionCleanupCalls: Array<{
    limit: number;
    securityCutoff: Date;
    standardCutoff: Date;
  }> = [];
  const banVisitorCalls: Array<Record<string, unknown>> = [];
  const deactivateUserActivitiesCalls: Array<{ username: string; reason?: string | undefined }> = [];
  const updateUserBanCalls: Array<{ username: string; isBanned: boolean }> = [];
  const unbanVisitorCalls: string[] = [];
  const filteredActivityCalls: Array<Record<string, unknown>> = [];
  const activityPageCalls: ActivityPageParams[] = [];
  const activityInvestigationPageCalls: Array<{ page: number; pageSize: number }> = [];

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
    getActivityRetentionPolicy: async () => ({
      autoCleanupEnabled: false,
      batchSize: 500,
      securityRetentionDays: 365,
      standardRetentionDays: 90,
    }),
    getActivityRetentionPreview: async (params: {
      securityCutoff: Date;
      standardCutoff: Date;
    }) => {
      let securityEligibleCount = 0;
      let standardEligibleCount = 0;
      for (const activity of activities.values()) {
        if (activity.isActive) continue;
        const activityTime =
          activity.logoutTime?.getTime()
          ?? activity.lastActivityTime?.getTime()
          ?? activity.loginTime?.getTime()
          ?? Number.POSITIVE_INFINITY;
        if (
          activity.logoutReason === "KICKED"
          && activityTime < params.securityCutoff.getTime()
        ) {
          securityEligibleCount += 1;
        } else if (
          activity.logoutReason !== "BANNED"
          && activityTime < params.standardCutoff.getTime()
        ) {
          standardEligibleCount += 1;
        }
      }
      return {
        protectedActiveBanCount: 0,
        securityEligibleCount,
        standardEligibleCount,
        totalEligibleCount: securityEligibleCount + standardEligibleCount,
      };
    },
    cleanupActivityRetention: async (params: {
      limit: number;
      securityCutoff: Date;
      standardCutoff: Date;
    }) => {
      activityRetentionCleanupCalls.push(params);
      const deletedIds: string[] = [];
      let securityDeletedCount = 0;
      let standardDeletedCount = 0;
      for (const [activityId, activity] of activities.entries()) {
        if (deletedIds.length >= params.limit || activity.isActive) {
          continue;
        }
        const activityTime =
          activity.logoutTime?.getTime()
          ?? activity.lastActivityTime?.getTime()
          ?? activity.loginTime?.getTime()
          ?? Number.POSITIVE_INFINITY;
        const securityEligible =
          activity.logoutReason === "KICKED"
          && activityTime < params.securityCutoff.getTime();
        const standardEligible =
          activity.logoutReason !== "BANNED"
          && activity.logoutReason !== "KICKED"
          && activityTime < params.standardCutoff.getTime();
        if (!securityEligible && !standardEligible) {
          continue;
        }
        activities.delete(activityId);
        deletedIds.push(activityId);
        if (securityEligible) {
          securityDeletedCount += 1;
        } else {
          standardDeletedCount += 1;
        }
      }
      return {
        deletedIds,
        lockAcquired: true,
        securityDeletedCount,
        standardDeletedCount,
      };
    },
    deleteActivity: async (activityId: string) => {
      deleteActivityCalls.push(activityId);
      return activities.delete(activityId);
    },
    deleteEndedActivitiesBefore: async () => [],
    getActivityById: async (activityId: string) => activities.get(activityId),
    getActivityInvestigation: async (
      activityId: string,
      relatedPage: { page: number; pageSize: number },
    ) => {
      activityInvestigationPageCalls.push(relatedPage);
      const activity = activities.get(activityId);
      if (!activity) {
        return undefined;
      }
      return {
        activity: {
          ...toStoredActivity(activity, {
            loginTime: new Date("2026-06-12T01:00:00.000Z"),
            lastActivityTime: new Date("2026-06-12T01:05:00.000Z"),
          }),
          status: activity.isActive ? "ONLINE" : "LOGOUT",
        },
        activeBan: null,
        auditEvents: [
          {
            id: "audit-session-1",
            action: "LOGIN_SUCCESS",
            performedBy: activity.username,
            requestId: "request-session-1",
            timestamp: new Date("2026-06-12T01:00:00.000Z"),
          },
        ],
        history: {
          activeConcurrentSessionCount: 0,
          priorMatchingFingerprintCount: 0,
          priorMatchingIpCount: 0,
          priorSessionCount: 0,
          sharedFingerprintAccountCount: 0,
          sharedIpAccountCount: 0,
        },
        relatedSessions: [],
        relatedSessionsPagination: {
          page: relatedPage.page,
          pageSize: relatedPage.pageSize,
          total: 0,
          totalPages: 1,
        },
      };
    },
    getAllActivities: async () => Array.from(activities.values()),
    getFilteredActivities: async (filters: Record<string, unknown>) => {
      filteredActivityCalls.push(filters);
      return Array.from(activities.values());
    },
    listActivityPage: async (params: ActivityPageParams) => {
      activityPageCalls.push(params);
      return {
        activities: [],
        page: params.page,
        pageSize: params.pageSize,
        total: 12,
        totalPages: 2,
        summary: {
          idleCount: 3,
          kickedCount: 1,
          logoutCount: 2,
          onlineCount: 6,
        },
      };
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
    activityRetentionCleanupCalls,
    banVisitorCalls,
    deactivateUserActivitiesCalls,
    updateUserBanCalls,
    unbanVisitorCalls,
    filteredActivityCalls,
    activityPageCalls,
    activityInvestigationPageCalls,
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

test("POST /api/activity/logout revokes the current JWT id for the remaining token lifetime", async () => {
  resetSessionRevocationStoreForTests();
  const token = jwt.sign(
    {
      activityId: "activity-1",
      username: "user.one",
    },
    "activity-route-test-secret",
    {
      algorithm: "HS256",
      expiresIn: "1h",
      jwtid: "logout-route-jti",
    },
  );
  const { app } = createActivityRouteHarness({
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
        Cookie: `sqr_auth=${encodeURIComponent(token)}; sqr_auth_hint=1`,
      },
    });

    assert.equal(response.status, 200);
    assert.equal(await isSessionJwtRevoked("logout-route-jti"), true);
  } finally {
    await stopTestServer(server);
    resetSessionRevocationStoreForTests();
  }
});

test("POST /api/activity/logout fails closed when JWT revocation cannot be guaranteed", async () => {
  const token = jwt.sign(
    {
      activityId: "activity-1",
      username: "user.one",
    },
    "activity-route-test-secret",
    {
      algorithm: "HS256",
      expiresIn: "1h",
      jwtid: "logout-route-jti-fail",
    },
  );
  const stopRevocationStore = configureSessionRevocationStoreForRuntime({
    isRevoked: async () => false,
    revoke: async () => {
      throw new Error("revocation unavailable");
    },
  });
  const { app } = createActivityRouteHarness({
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
        Cookie: `sqr_auth=${encodeURIComponent(token)}; sqr_auth_hint=1`,
      },
    });

    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.error.code, "SESSION_REVOCATION_UNAVAILABLE");
    assert.match(response.headers.get("set-cookie") || "", /sqr_auth=/);
  } finally {
    await stopTestServer(server);
    stopRevocationStore();
    resetSessionRevocationStoreForTests();
  }
});

test("DELETE /api/activity/logs/bulk-delete deduplicates ids and audits the batch", async () => {
  const { app, auditLogs, deleteActivityCalls, clearNicknameSessionCalls, socketStates } = createActivityRouteHarness({
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
      protectedIds: [],
    });
    assert.deepEqual(deleteActivityCalls, ["activity-2", "activity-3"]);
    assert.deepEqual(clearNicknameSessionCalls, ["activity-2", "activity-3"]);
    assert.equal(socketStates.get("activity-2")?.closeCalls, 1);
    assert.equal(socketStates.get("activity-3")?.closeCalls, 1);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "BULK_DELETE_ACTIVITY_LOGS");
    assert.equal(auditLogs[0].performedBy, "admin.user");
    assert.equal(auditLogs[0].targetUser, undefined);
    const auditDetails = JSON.parse(String(auditLogs[0].details));
    assert.equal(auditDetails.requestedCount, 3);
    assert.equal(auditDetails.deletedCount, 2);
    assert.equal(auditDetails.notFoundCount, 1);
    assert.equal(typeof auditDetails.durationMs, "number");
  } finally {
    await stopTestServer(server);
  }
});

test("DELETE /api/activity/:id refuses to remove a log linked to an active ban", async () => {
  const { app, clearNicknameSessionCalls } = createActivityRouteHarness({
    storageOverrides: {
      deleteActivity: async () => false,
    },
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/activity/activity-2`, {
      method: "DELETE",
    });

    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.message, "Activity logs linked to an active ban cannot be deleted.");
    assert.deepEqual(clearNicknameSessionCalls, []);
  } finally {
    await stopTestServer(server);
  }
});

test("DELETE /api/activity/logs/bulk-delete audits failed batch delete attempts", async () => {
  const { app, auditLogs } = createActivityRouteHarness({
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
      activityId: "activity-1",
    }),
    storageOverrides: {
      deleteActivity: async () => {
        throw new Error("delete failed");
      },
    },
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/activity/logs/bulk-delete`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        activityIds: ["activity-2"],
      }),
    });

    assert.equal(response.status, 500);
    assert.equal(auditLogs.length, 1);
    assert.equal(auditLogs[0].action, "BULK_DELETE_ACTIVITY_LOGS_FAILED");
    assert.equal(auditLogs[0].performedBy, "admin.user");
    const auditDetails = JSON.parse(String(auditLogs[0].details));
    assert.equal(auditDetails.requestedCount, 1);
    assert.equal(auditDetails.errorType, "Error");
    assert.equal(typeof auditDetails.durationMs, "number");
  } finally {
    await stopTestServer(server);
  }
});

test("DELETE /api/activity/logs/cleanup-ended removes only old ended login logs", async () => {
  const {
    app,
    activities,
    auditLogs,
    activityRetentionCleanupCalls,
    clearNicknameSessionCalls,
  } = createActivityRouteHarness({
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
      activityId: "activity-1",
    }),
  });
  activities.set("ended-old", {
    id: "ended-old",
    userId: "user-2",
    username: "regular.user",
    role: "user",
    isActive: false,
    loginTime: new Date("2026-01-01T00:00:00.000Z"),
    lastActivityTime: new Date("2026-01-01T00:05:00.000Z"),
    logoutTime: new Date("2026-01-01T00:10:00.000Z"),
    logoutReason: "USER_LOGOUT",
  });
  activities.set("ended-new", {
    id: "ended-new",
    userId: "user-2",
    username: "regular.user",
    role: "user",
    isActive: false,
    loginTime: new Date(),
    lastActivityTime: new Date(),
    logoutTime: new Date(),
    logoutReason: "USER_LOGOUT",
  });
  activities.set("active-old", {
    id: "active-old",
    userId: "user-2",
    username: "regular.user",
    role: "user",
    isActive: true,
    loginTime: new Date("2026-01-01T00:00:00.000Z"),
    lastActivityTime: new Date("2026-01-01T00:05:00.000Z"),
    logoutTime: null,
    logoutReason: null,
  });
  activities.set("banned-old", {
    id: "banned-old",
    userId: "user-2",
    username: "regular.user",
    role: "user",
    isActive: false,
    loginTime: new Date("2025-01-01T00:00:00.000Z"),
    lastActivityTime: new Date("2025-01-01T00:05:00.000Z"),
    logoutTime: new Date("2025-01-01T00:10:00.000Z"),
    logoutReason: "BANNED",
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/activity/logs/cleanup-ended`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        limit: 10,
        olderThanDays: 30,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.success, true);
    assert.equal(payload.deletedCount, 1);
    assert.equal(payload.limit, 10);
    assert.equal(payload.olderThanDays, 30);
    assert.match(String(payload.cutoff), /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(activities.has("ended-old"), false);
    assert.equal(activities.has("ended-new"), true);
    assert.equal(activities.has("active-old"), true);
    assert.equal(activities.has("banned-old"), true);
    assert.equal(activityRetentionCleanupCalls.length, 1);
    assert.equal(activityRetentionCleanupCalls[0]?.limit, 10);
    assert.deepEqual(clearNicknameSessionCalls, ["ended-old"]);
    const lastAuditLog = auditLogs[auditLogs.length - 1];
    assert.equal(lastAuditLog?.action, "DELETE_OLD_ACTIVITY_LOGS");
    assert.equal(lastAuditLog?.performedBy, "admin.user");
    const auditDetails = JSON.parse(String(lastAuditLog?.details));
    assert.equal(auditDetails.deletedCount, 1);
    assert.equal(auditDetails.limit, 10);
    assert.equal(auditDetails.standardRetentionDays, 30);
    assert.equal(auditDetails.securityRetentionDays, 365);
    assert.equal(auditDetails.source, "manual");
  } finally {
    await stopTestServer(server);
  }
});

test("DELETE /api/activity/logs/cleanup-ended rejects invalid retention bounds", async () => {
  const { app, activityRetentionCleanupCalls } = createActivityRouteHarness({
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
      activityId: "activity-1",
    }),
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/activity/logs/cleanup-ended`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        olderThanDays: 0,
      }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: "olderThanDays must be an integer between 1 and 3650",
    });
    assert.deepEqual(activityRetentionCleanupCalls, []);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/activity/retention returns policy preview for moderators", async () => {
  const { app } = createActivityRouteHarness({
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
      activityId: "activity-1",
    }),
    storageOverrides: {
      getActivityRetentionPolicy: async () => ({
        autoCleanupEnabled: true,
        batchSize: 250,
        securityRetentionDays: 365,
        standardRetentionDays: 90,
      }),
      getActivityRetentionPreview: async () => ({
        protectedActiveBanCount: 2,
        securityEligibleCount: 3,
        standardEligibleCount: 4,
        totalEligibleCount: 7,
      }),
    },
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/activity/retention`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.success, true);
    assert.equal(payload.retention.policy.autoCleanupEnabled, true);
    assert.equal(payload.retention.policy.batchSize, 250);
    assert.equal(payload.retention.preview.protectedActiveBanCount, 2);
    assert.equal(payload.retention.preview.totalEligibleCount, 7);
    assert.match(payload.retention.standardCutoff, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(payload.retention.securityCutoff, /^\d{4}-\d{2}-\d{2}T/);
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
    assert.equal(auditLogs[0].targetResource, "activity:activity-2");
    assert.deepEqual(JSON.parse(String(auditLogs[0].details)), {
      activityId: "activity-2",
      outcome: "kicked",
    });
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

test("GET /api/activity/page validates and forwards pagination, sorting, and filters", async () => {
  const { app, activityPageCalls } = createActivityRouteHarness({
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "user.one",
      role: "user",
      activityId: "activity-1",
    }),
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(
      `${baseUrl}/api/activity/page`
      + "?page=2&pageSize=10&sortBy=username&sortOrder=asc"
      + "&status=ONLINE%2CIDLE%2CONLINE&username=user.one"
      + "&dateFrom=2026-06-01&dateTo=2026-06-12",
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.doesNotThrow(() => activityPageResponseSchema.parse(payload));
    assert.deepEqual(payload, {
      activities: [],
      summary: {
        idleCount: 3,
        kickedCount: 1,
        logoutCount: 2,
        onlineCount: 6,
      },
      pagination: {
        mode: "offset",
        page: 2,
        pageSize: 10,
        limit: 10,
        offset: 10,
        total: 12,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });
    assert.equal(activityPageCalls.length, 1);
    assert.deepEqual(activityPageCalls[0], {
      page: 2,
      pageSize: 10,
      sortBy: "username",
      sortOrder: "asc",
      currentActivityId: "activity-1",
      filters: {
        status: ["ONLINE", "IDLE"],
        username: "user.one",
        ipAddress: "",
        browser: "",
        dateFrom: new Date("2026-06-01T00:00:00.000Z"),
        dateTo: new Date("2026-06-12T00:00:00.000Z"),
      },
    });
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/activity/page limits exact network audit data to moderators", async () => {
  const listActivityPage = async (params: ActivityPageParams) => ({
    activities: [
      {
        id: "activity-network-audit",
        userId: "user-2",
        username: "regular.user",
        role: "user",
        fingerprint: "fp-network",
        ipAddress: "203.0.113.88",
        browser: "Chrome 149",
        deviceType: "desktop",
        platform: "Windows 10/11",
        isActive: true,
        pcName: null,
        loginTime: new Date("2026-06-13T01:00:00.000Z"),
        logoutTime: null,
        lastActivityTime: new Date("2026-06-13T01:01:00.000Z"),
        logoutReason: null,
        status: "ONLINE",
      },
    ],
    page: params.page,
    pageSize: params.pageSize,
    total: 1,
    totalPages: 1,
    summary: {
      idleCount: 0,
      kickedCount: 0,
      logoutCount: 0,
      onlineCount: 1,
    },
  });
  const userHarness = createActivityRouteHarness({
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "user.one",
      role: "user",
      activityId: "activity-1",
    }),
    storageOverrides: {
      listActivityPage,
    },
  });
  const adminHarness = createActivityRouteHarness({
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
      activityId: "activity-1",
    }),
    storageOverrides: {
      listActivityPage,
    },
  });
  const userServer = await startTestServer(userHarness.app);
  const adminServer = await startTestServer(adminHarness.app);

  try {
    const [userResponse, adminResponse] = await Promise.all([
      fetch(`${userServer.baseUrl}/api/activity/page?page=1&pageSize=20`),
      fetch(`${adminServer.baseUrl}/api/activity/page?page=1&pageSize=20`),
    ]);
    const userPayload = await userResponse.json();
    const adminPayload = await adminResponse.json();

    assert.equal(userPayload.activities[0]?.ipAddress, "203.0.113.x");
    assert.equal(adminPayload.activities[0]?.ipAddress, "203.0.113.88");
    assert.equal(adminPayload.activities[0]?.deviceType, "desktop");
    assert.equal(adminPayload.activities[0]?.platform, "Windows 10/11");
    assert.equal(adminPayload.activities[0]?.fingerprint, undefined);
    assert.equal(adminPayload.activities[0]?.userId, undefined);
  } finally {
    await Promise.all([
      stopTestServer(userServer.server),
      stopTestServer(adminServer.server),
    ]);
  }
});

test("GET /api/activity/page rejects invalid pagination, sorting, and status values", async () => {
  const { app, activityPageCalls } = createActivityRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const urls = [
      `${baseUrl}/api/activity/page?pageSize=0`,
      `${baseUrl}/api/activity/page?sortBy=details`,
      `${baseUrl}/api/activity/page?sortOrder=sideways`,
      `${baseUrl}/api/activity/page?status=ONLINE%2CUNKNOWN`,
    ];

    for (const url of urls) {
      const response = await fetch(url);
      assert.equal(response.status, 400);
    }
    assert.equal(activityPageCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/activity/:id/investigation returns sanitized session facts for administrators", async () => {
  const { app, activityInvestigationPageCalls } = createActivityRouteHarness({
    authenticateToken: createTestAuthenticateToken({
      userId: "admin-1",
      username: "admin.user",
      role: "admin",
      activityId: "activity-1",
    }),
  });
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(
      `${baseUrl}/api/activity/activity-2/investigation?relatedPage=1&relatedPageSize=10`,
    );
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.ok, true);
    assert.equal(payload.investigation.session.id, "activity-2");
    assert.equal(payload.investigation.session.device.fingerprintHint, "••••fp-2");
    assert.equal(payload.investigation.session.fingerprint, undefined);
    assert.equal(payload.investigation.auditEvents[0].requestId, "request-session-1");
    assert.equal(payload.investigation.auditEvents[0].details, undefined);
    assert.deepEqual(payload.investigation.relatedSessions, []);
    assert.equal(payload.investigation.relatedSessionsPagination.pageSize, 10);
    assert.deepEqual(activityInvestigationPageCalls, [{ page: 1, pageSize: 10 }]);
    assert.equal(payload.investigation.security.signals[0].code, "no_elevated_risk");
  } finally {
    await stopTestServer(server);
  }
});

test("DELETE /api/activity/:id closes an active session and audits the deletion", async () => {
  const {
    activities,
    app,
    auditLogs,
    clearNicknameSessionCalls,
    connectedClients,
    socketStates,
  } = createActivityRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/activity/activity-2`, {
      method: "DELETE",
    });
    assert.equal(response.status, 200);
    assert.equal(activities.has("activity-2"), false);
    assert.equal(connectedClients.has("activity-2"), false);
    assert.equal(socketStates.get("activity-2")?.closeCalls, 1);
    assert.deepEqual(clearNicknameSessionCalls, ["activity-2"]);
    const deletionAudit = auditLogs[auditLogs.length - 1];
    assert.equal(deletionAudit?.action, "DELETE_ACTIVITY_LOG");
    assert.equal(deletionAudit?.performedBy, "admin.user");
    assert.equal(deletionAudit?.targetResource, "activity:activity-2");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/activity/:id/investigation rejects invalid related-session pagination", async () => {
  const { app, activityInvestigationPageCalls } = createActivityRouteHarness();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(
      `${baseUrl}/api/activity/activity-2/investigation?relatedPageSize=21`,
    );
    assert.equal(response.status, 400);
    assert.equal(activityInvestigationPageCalls.length, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/activity/:id/investigation rejects non-moderators and missing activities", async () => {
  const userHarness = createActivityRouteHarness({
    authenticateToken: createTestAuthenticateToken({
      userId: "user-1",
      username: "user.one",
      role: "user",
      activityId: "activity-1",
    }),
  });
  const userServer = await startTestServer(userHarness.app);

  try {
    const response = await fetch(`${userServer.baseUrl}/api/activity/activity-2/investigation`);
    assert.equal(response.status, 403);
  } finally {
    await stopTestServer(userServer.server);
  }

  const adminHarness = createActivityRouteHarness();
  const adminServer = await startTestServer(adminHarness.app);
  try {
    const response = await fetch(`${adminServer.baseUrl}/api/activity/missing/investigation`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: "Activity not found",
    });
  } finally {
    await stopTestServer(adminServer.server);
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
    assert.doesNotThrow(() => activityListResponseSchema.parse(payload));
    assert.equal(payload.activities.length, 1);
    assert.equal(payload.activities[0]?.id, "activity-1");
    assert.equal(payload.activities[0]?.status, "ONLINE");
    assert.equal(payload.activities[0]?.loginTime, "2026-04-10T06:05:00.000Z");
    assert.match(String(payload.activities[0]?.lastActivityTime || ""), /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(payload.activities[0]?.fingerprint, undefined);
    assert.equal(payload.activities[0]?.userId, undefined);
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
    assert.doesNotThrow(() => activityListResponseSchema.parse(payload));
    assert.deepEqual(payload, {
      activities: [],
    });
  } finally {
    await stopTestServer(server);
  }
});
