import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  allImportsAnalysisResponseSchema,
  analyticsLoginTrendsSchema,
  analyticsPeakHoursSchema,
  analyticsRecentLoginActivityListSchema,
  analyticsRecentLoginActivityPageSchema,
  analyticsRoleDistributionSchema,
  analyticsSummarySchema,
  analyticsTopUsersSchema,
  appConfigResponseSchema,
  activityBannedUsersResponseSchema,
  activityBulkDeleteResponseSchema,
  activityCleanupResponseSchema,
  activityHeartbeatResponseSchema,
  activityInvestigationResponseSchema,
  activityListResponseSchema,
  activityMutationSuccessResponseSchema,
  activityPageResponseSchema,
  activityRetentionResponseSchema,
  apiErrorPayloadSchema,
  apiPaginationMetaSchema,
  authActivationTokenResponseSchema,
  authCurrentUserSchema,
  authDevMailOutboxClearResponseSchema,
  authDevMailOutboxDeleteResponseSchema,
  authDevMailOutboxPreviewsResponseSchema,
  authLoginResponseSchema,
  authManagedAccountActivationResponseSchema,
  authManagedAccountPasswordResetResponseSchema,
  authManagedDeliverySchema,
  authManagedUserDeleteResponseSchema,
  authManagedUsersResponseSchema,
  authMessageResponseSchema,
  authPasswordResetTokenResponseSchema,
  authPendingPasswordResetRequestsResponseSchema,
  authRecoveryTokenMetadataSchema,
  authTwoFactorSetupResponseSchema,
  authTwoFactorStatusResponseSchema,
  authUserForceLogoutResponseSchema,
  authUserMutationResponseSchema,
  authUserResponseSchema,
  auditLogRecordSchema,
  collectionMonthlyComparisonResponseSchema,
  collectionMonthlySummaryResponseSchema,
  collectionMonthlyTargetResponseSchema,
  collectionNicknameSummaryResponseSchema,
  collectionPurgeResponseSchema,
  collectionPurgeSummaryResponseSchema,
  importListItemSchema,
  maintenanceStatusResponseSchema,
  normalizeApiPaginationMeta,
  singleImportAnalysisResponseSchema,
} from "@shared/api-contracts";
import { ERROR_CODES } from "@shared/error-codes";
import { PAGE_LIMIT_MIN_ERROR_MESSAGE } from "@shared/pagination-contracts";
import {
  analyzeAll,
  analyzeImport,
  deleteImport,
  getImportData,
  getImports,
  renameImport,
} from "@/lib/api/imports";
import {
  getAnalyticsSummary,
  getLoginTrends,
  getPeakHours,
  getRecentLoginActivity,
  getRecentLoginActivityPage,
  getRoleDistribution,
  getTopActiveUsers,
} from "@/lib/api/analytics";
import {
  activityLogin,
  activityHeartbeat,
  activityHeartbeatLight,
  activityLogout,
  banUser,
  cleanupEndedActivityLogs,
  deleteActivityLog,
  deleteActivityLogsBulk,
  getActivityInvestigation,
  getActivityPage,
  getAllActivity,
  getActivityRetentionStatus,
  getBannedUsers,
  getFilteredActivity,
  kickUser,
  unbanUser,
} from "@/lib/api/activity";
import {
  clearDevMailOutboxPreviews,
  createManagedUserAccount,
  deleteDevMailOutboxPreview,
  deleteManagedUserAccount,
  getDevMailOutboxPreviews,
  getPendingPasswordResetRequests,
  getSuperuserManagedUsers,
  getMe,
  login,
  verifyTwoFactorLogin,
  activateAccount,
  changeMyPassword,
  disableTwoFactor,
  enableTwoFactor,
  getTwoFactorStatus,
  requestPasswordReset,
  resendManagedUserActivation,
  resetManagedUserPassword,
  resetPasswordWithToken,
  updateManagedUserAccount,
  updateManagedUserRole,
  updateManagedUserStatus,
  startTwoFactorSetup,
  updateMyCredentials,
  validateActivationToken,
  validatePasswordResetToken,
} from "@/lib/api/auth";
import { getAuditLogs } from "@/lib/api/audit";
import { advancedSearchData, getSearchColumns, searchData } from "@/lib/api/search";
import {
  getSettings,
  getAppConfig,
  getMaintenanceStatus,
  getTabVisibility,
  updateSetting,
} from "@/lib/api/settings";
import { parseApiJson } from "@/lib/api/contract";

function createEmptyAnalysisContract() {
  return {
    icLelaki: { count: 0, samples: [] },
    icPerempuan: { count: 0, samples: [] },
    noPolis: { count: 0, samples: [] },
    noTentera: { count: 0, samples: [] },
    passportMY: { count: 0, samples: [] },
    passportLuarNegara: { count: 0, samples: [] },
    duplicates: { count: 0, items: [] },
    quality: {
      score: 0,
      grade: "no_data",
      completenessPercent: 0,
      typeConsistencyPercent: 0,
      profiledColumns: 0,
      columnsNeedingReview: 0,
      columnsWithMissingValues: 0,
      mixedTypeColumns: 0,
      limitedCardinalityColumns: 0,
      totalApplicableCells: 0,
      populatedCells: 0,
      emptyCells: 0,
      columnLimitReached: false,
    },
    columns: [],
  } as const;
}

function withMockFetch(mock: typeof fetch): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

test("parseApiJson includes concise Zod issue details without echoing raw payload values", async () => {
  const response = jsonResponse({
    items: [
      {
        id: 123,
        secretValue: "super-secret-token",
      },
    ],
  });

  await assert.rejects(
    () =>
      parseApiJson(
        response,
        z.object({
          items: z.array(z.object({
            id: z.string(),
            secretValue: z.number(),
          })),
        }),
        "/api/example",
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /API contract mismatch for \/api\/example/);
      assert.match(error.message, /items\[0\]\.id: Expected string, received number/);
      assert.match(error.message, /items\[0\]\.secretValue: Expected number, received string/);
      assert.doesNotMatch(error.message, /super-secret-token/);
      return true;
    },
  );
});

test("analytics role distribution contract trims valid roles and rejects blank labels", () => {
  const valid = analyticsRoleDistributionSchema.parse([
    { role: " admin ", count: 3 },
  ]);

  assert.deepEqual(valid, [{ role: "admin", count: 3 }]);
  assert.equal(
    analyticsRoleDistributionSchema.safeParse([
      { role: " \n ", count: 1 },
    ]).success,
    false,
  );
});

test("role distribution API wrapper rejects malformed contract payloads", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);
    if (url === "/api/analytics/role-distribution") {
      return jsonResponse([{ role: "", count: 1 }]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => getRoleDistribution(),
      /API contract mismatch for \/api\/analytics\/role-distribution/,
    );
  } finally {
    restoreFetch();
  }
});

test("analytics top users contract normalizes identities and validates activity fields", () => {
  const valid = analyticsTopUsersSchema.parse([
    {
      username: " operator.one ",
      role: " admin ",
      loginCount: 4,
      lastLogin: "2026-06-24T01:30:00.000Z",
    },
    {
      username: "new.user",
      role: "user",
      loginCount: 0,
      lastLogin: null,
    },
  ]);

  assert.deepEqual(valid, [
    {
      username: "operator.one",
      role: "admin",
      loginCount: 4,
      lastLogin: "2026-06-24T01:30:00.000Z",
    },
    {
      username: "new.user",
      role: "user",
      loginCount: 0,
      lastLogin: null,
    },
  ]);
  assert.equal(
    analyticsTopUsersSchema.safeParse([
      {
        username: "",
        role: "admin",
        loginCount: -1,
        lastLogin: "not-a-date",
      },
    ]).success,
    false,
  );
});

test("top users API wrapper rejects malformed contract payloads", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);
    if (url === "/api/analytics/top-users?pageSize=10") {
      return jsonResponse([
        {
          username: "",
          role: "admin",
          loginCount: 1,
          lastLogin: null,
        },
      ]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => getTopActiveUsers(),
      /API contract mismatch for \/api\/analytics\/top-users/,
    );
  } finally {
    restoreFetch();
  }
});

test("recent login activity contracts accept bounded sanitized activity data", () => {
  const activity = {
    browser: "Chrome 149",
    eventType: "success",
    failureReason: null,
    id: "activity-1",
    ipAddress: "192.168.x.x",
    lastActivityTime: "2026-06-24T02:15:00.000Z",
    loginTime: "2026-06-24T02:00:00.000Z",
    logoutReason: null,
    logoutTime: null,
    platform: "Windows",
    role: " admin ",
    status: "active",
    userAgentSummary: "Chrome 149 on Windows",
    username: " operator.one ",
  } as const;

  const list = analyticsRecentLoginActivityListSchema.parse([activity]);
  assert.equal(list[0]?.role, "admin");
  assert.equal(list[0]?.username, "operator.one");

  const page = analyticsRecentLoginActivityPageSchema.parse({
    activities: [activity],
    filterCounts: {
      active: 1,
      all: 1,
      attention: 0,
      ended: 0,
      failed: 0,
    },
    pagination: {
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    },
  });
  assert.equal(page.activities.length, 1);
  assert.equal(page.pagination.totalItems, 1);
});

test("recent login activity contracts reject invalid status, timestamps, and counts", () => {
  assert.equal(
    analyticsRecentLoginActivityListSchema.safeParse([{
      browser: null,
      id: "",
      ipAddress: null,
      lastActivityTime: "not-a-date",
      loginTime: null,
      logoutReason: null,
      logoutTime: null,
      role: "admin",
      status: "unknown",
      username: "operator.one",
    }]).success,
    false,
  );
  assert.equal(
    analyticsRecentLoginActivityPageSchema.safeParse({
      activities: [],
      filterCounts: {
        active: 0,
        all: -1,
        attention: 0,
        ended: 0,
        failed: 0,
      },
      pagination: {
        page: 0,
        pageSize: 20,
        totalItems: -1,
        totalPages: 0,
      },
    }).success,
    false,
  );
});

test("recent login activity API wrappers reject malformed contract payloads", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);
    if (url === "/api/analytics/recent-login-activity?pageSize=8") {
      return jsonResponse([{
        browser: null,
        id: "activity-1",
        ipAddress: null,
        lastActivityTime: null,
        loginTime: null,
        logoutReason: null,
        logoutTime: null,
        role: "admin",
        status: "unknown",
        username: "operator.one",
      }]);
    }
    if (url.startsWith("/api/analytics/recent-login-activity-page?")) {
      return jsonResponse({
        activities: [],
        filterCounts: {
          active: 0,
          all: 0,
          attention: 0,
          ended: 0,
          failed: 0,
        },
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 0,
          totalPages: 0,
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => getRecentLoginActivity(),
      /API contract mismatch for \/api\/analytics\/recent-login-activity/,
    );
    await assert.rejects(
      () => getRecentLoginActivityPage({
        page: 1,
        pageSize: 20,
        status: "all",
      }),
      /API contract mismatch for \/api\/analytics\/recent-login-activity-page/,
    );
  } finally {
    restoreFetch();
  }
});

test("dashboard metric contracts accept complete bounded analytics data", () => {
  const summary = analyticsSummarySchema.parse({
    totalUsers: 12,
    activeSessions: 3,
    loginsToday: 5,
    totalDataRows: 240,
    totalImports: 8,
    bannedUsers: 1,
    collectionRecordVersionConflicts24h: 0,
    loginFailures24h: 2,
    backupActions24h: 4,
  });
  assert.equal(summary.totalDataRows, 240);

  const trends = analyticsLoginTrendsSchema.parse([
    { date: "2026-06-23", logins: 5, logouts: 2 },
    { date: "2026-06-24", logins: 3, logouts: 1 },
  ]);
  assert.equal(trends.length, 2);

  const peakHours = analyticsPeakHoursSchema.parse(
    Array.from({ length: 24 }, (_, hour) => ({ hour, count: hour % 4 })),
  );
  assert.equal(peakHours[23]?.hour, 23);
});

test("dashboard metric contracts reject incomplete, negative, and duplicate chart data", () => {
  assert.equal(
    analyticsSummarySchema.safeParse({
      totalUsers: -1,
    }).success,
    false,
  );
  assert.equal(
    analyticsLoginTrendsSchema.safeParse([
      { date: "24/06/2026", logins: 1, logouts: -1 },
    ]).success,
    false,
  );

  const duplicatePeakHours = Array.from(
    { length: 24 },
    (_, hour) => ({ hour: hour === 23 ? 22 : hour, count: 0 }),
  );
  assert.equal(analyticsPeakHoursSchema.safeParse(duplicatePeakHours).success, false);
  assert.equal(
    analyticsPeakHoursSchema.safeParse([
      { hour: 24, count: 1 },
    ]).success,
    false,
  );
});

test("dashboard metric API wrappers reject malformed contract payloads", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);
    if (url === "/api/analytics/summary") {
      return jsonResponse({
        totalUsers: -1,
      });
    }
    if (url === "/api/analytics/login-trends?days=7") {
      return jsonResponse([
        { date: "not-a-date", logins: 1, logouts: 0 },
      ]);
    }
    if (url === "/api/analytics/peak-hours") {
      return jsonResponse([
        { hour: 9, count: 3 },
      ]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => getAnalyticsSummary(),
      /API contract mismatch for \/api\/analytics\/summary/,
    );
    await assert.rejects(
      () => getLoginTrends(),
      /API contract mismatch for \/api\/analytics\/login-trends/,
    );
    await assert.rejects(
      () => getPeakHours(),
      /API contract mismatch for \/api\/analytics\/peak-hours/,
    );
  } finally {
    restoreFetch();
  }
});

test("runtime configuration contracts enforce operational bounds", () => {
  const config = appConfigResponseSchema.parse({
    systemName: " SQR System ",
    sessionTimeoutMinutes: 30,
    heartbeatIntervalMinutes: 5,
    wsIdleMinutes: 3,
    aiEnabled: true,
    semanticSearchEnabled: true,
    aiTimeoutMs: 10_000,
    searchResultLimit: 200,
    viewerRowsPerPage: 100,
    importUploadLimitBytes: 96 * 1024 * 1024,
  });
  assert.equal(config.systemName, "SQR System");

  assert.equal(
    appConfigResponseSchema.safeParse({
      ...config,
      heartbeatIntervalMinutes: 0,
      importUploadLimitBytes: 513 * 1024 * 1024,
    }).success,
    false,
  );
});

test("maintenance status contract accepts complete state and rejects unsafe timestamps", () => {
  const maintenance = maintenanceStatusResponseSchema.parse({
    maintenance: true,
    message: "Scheduled maintenance",
    type: "hard",
    startTime: "2026-06-24T10:00:00.000Z",
    endTime: null,
  });
  assert.equal(maintenance.type, "hard");

  assert.equal(
    maintenanceStatusResponseSchema.safeParse({
      maintenance: true,
      message: "",
      type: "warning",
      startTime: "tomorrow",
      endTime: null,
    }).success,
    false,
  );
});

test("runtime configuration API wrappers reject malformed contract payloads", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);
    if (url === "/api/app-config") {
      return jsonResponse({
        systemName: "",
        sessionTimeoutMinutes: 0,
      });
    }
    if (url === "/api/maintenance-status") {
      return jsonResponse({
        maintenance: true,
        message: "Maintenance",
        type: "hard",
        startTime: "invalid",
        endTime: null,
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => getAppConfig(),
      /API contract mismatch for \/api\/app-config/,
    );
    await assert.rejects(
      () => getMaintenanceStatus(),
      /API contract mismatch for \/api\/maintenance-status/,
    );
  } finally {
    restoreFetch();
  }
});

function createAuthUserContract() {
  return {
    id: "user-1",
    username: "operator.one",
    fullName: "Operator One",
    email: "operator@example.com",
    role: "admin",
    status: "active",
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    isBanned: false,
    twoFactorEnabled: true,
    twoFactorPendingSetup: false,
    twoFactorConfiguredAt: "2026-06-24T08:00:00.000Z",
    activatedAt: "2026-06-01T08:00:00.000Z",
    passwordChangedAt: null,
    lastLoginAt: "2026-06-24T08:00:00.000Z",
  } as const;
}

test("authentication contracts accept complete session payloads and reject sensitive drift", () => {
  const user = authCurrentUserSchema.parse(createAuthUserContract());
  assert.equal(user.username, "operator.one");

  const loginResponse = authLoginResponseSchema.parse({
    ok: true,
    username: user.username,
    role: user.role,
    activityId: "activity-1",
    mustChangePassword: false,
    status: "active",
    user,
    sessionExpiresAt: "2026-06-25T08:00:00.000Z",
  });
  assert.equal("activityId" in loginResponse && loginResponse.activityId, "activity-1");

  assert.equal(
    authCurrentUserSchema.safeParse({
      ...createAuthUserContract(),
      passwordHash: "must-not-cross-the-wire",
    }).success,
    false,
  );
  assert.equal(
    authLoginResponseSchema.safeParse({
      ok: true,
      username: "operator.one",
      role: "admin",
      activityId: "activity-1",
      mustChangePassword: false,
      status: "active",
      user: createAuthUserContract(),
      sessionExpiresAt: "not-a-timestamp",
    }).success,
    false,
  );
  assert.equal(
    authUserResponseSchema.safeParse({
      ok: true,
      user: {
        ...createAuthUserContract(),
        status: "unknown",
      },
      sessionExpiresAt: null,
    }).success,
    false,
  );
});

test("authentication API wrappers reject malformed success payloads", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);
    if (url === "/api/auth/login") {
      return jsonResponse({
        ok: true,
        username: "operator.one",
        role: "admin",
        activityId: "activity-1",
        mustChangePassword: false,
        status: "active",
        user: createAuthUserContract(),
        sessionExpiresAt: "invalid",
      });
    }
    if (url === "/api/auth/verify-two-factor-login") {
      return jsonResponse({
        ok: true,
        username: "operator.one",
        role: "admin",
        mustChangePassword: false,
        status: "active",
        user: createAuthUserContract(),
        sessionExpiresAt: "2026-06-25T08:00:00.000Z",
      });
    }
    if (url === "/api/me") {
      return jsonResponse({
        ok: true,
        user: {
          ...createAuthUserContract(),
          passwordHash: "must-not-cross-the-wire",
        },
        sessionExpiresAt: "2026-06-25T08:00:00.000Z",
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => login("operator.one", "secret"),
      /API contract mismatch for \/api\/auth\/login/,
    );
    await assert.rejects(
      () => verifyTwoFactorLogin({ challengeToken: "challenge", code: "123456" }),
      /API contract mismatch for \/api\/auth\/verify-two-factor-login/,
    );
    await assert.rejects(
      () => getMe(),
      /API contract mismatch for \/api\/me/,
    );
  } finally {
    restoreFetch();
  }
});

test("authentication self-service contracts isolate setup secrets and require mutation state", () => {
  const user = createAuthUserContract();

  const status = authTwoFactorStatusResponseSchema.parse({
    ok: true,
    twoFactor: {
      enabled: true,
      pendingSetup: false,
      configuredAt: "2026-06-24T08:00:00.000Z",
    },
    user,
  });
  assert.equal(status.twoFactor.enabled, true);

  const setup = authTwoFactorSetupResponseSchema.parse({
    ok: true,
    setup: {
      accountName: "operator.one",
      issuer: "SQR",
      otpauthUrl: "otpauth://totp/SQR:operator.one?secret=ABCDEF",
      secret: "ABCDEF",
    },
    user,
  });
  assert.equal(setup.setup.issuer, "SQR");

  assert.equal(
    authUserMutationResponseSchema.safeParse({
      ok: true,
      user,
      setup: { secret: "must-not-leak" },
    }).success,
    false,
  );
  assert.equal(
    authUserForceLogoutResponseSchema.safeParse({
      ok: true,
      forceLogout: "yes",
      user,
    }).success,
    false,
  );
  assert.equal(
    authTwoFactorSetupResponseSchema.safeParse({
      ok: true,
      setup: {
        accountName: "operator.one",
        issuer: "SQR",
        otpauthUrl: "https://example.com/not-an-otp-uri",
        secret: "ABCDEF",
      },
      user,
    }).success,
    false,
  );
});

test("authentication self-service API wrappers reject malformed success payloads", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);
    if (url === "/api/auth/change-password") {
      return jsonResponse({ ok: true, forceLogout: "yes", user: createAuthUserContract() });
    }
    if (url === "/api/auth/two-factor") {
      return jsonResponse({
        ok: true,
        twoFactor: {
          enabled: false,
          pendingSetup: false,
          configuredAt: "invalid",
        },
        user: createAuthUserContract(),
      });
    }
    if (url === "/api/auth/two-factor/setup") {
      return jsonResponse({
        ok: true,
        setup: {
          accountName: "operator.one",
          issuer: "SQR",
          otpauthUrl: "invalid",
          secret: "ABCDEF",
        },
        user: createAuthUserContract(),
      });
    }
    if (url === "/api/auth/two-factor/enable") {
      return jsonResponse({
        ok: true,
        user: createAuthUserContract(),
        secret: "must-not-leak",
      });
    }
    if (url === "/api/auth/two-factor/disable") {
      return jsonResponse({ ok: true, user: null, forceLogout: false });
    }
    if (url === "/api/me/credentials") {
      return jsonResponse({ ok: true, user: createAuthUserContract() });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => changeMyPassword({ currentPassword: "old", newPassword: "new" }),
      /API contract mismatch for \/api\/auth\/change-password/,
    );
    await assert.rejects(
      () => getTwoFactorStatus(),
      /API contract mismatch for \/api\/auth\/two-factor/,
    );
    await assert.rejects(
      () => startTwoFactorSetup({ currentPassword: "old" }),
      /API contract mismatch for \/api\/auth\/two-factor\/setup/,
    );
    await assert.rejects(
      () => enableTwoFactor({ code: "123456" }),
      /API contract mismatch for \/api\/auth\/two-factor\/enable/,
    );
    await assert.rejects(
      () => disableTwoFactor({ currentPassword: "old", code: "123456" }),
      /API contract mismatch for \/api\/auth\/two-factor\/disable/,
    );
    await assert.rejects(
      () => updateMyCredentials({ newUsername: "operator.two" }),
      /API contract mismatch for \/api\/me\/credentials/,
    );
  } finally {
    restoreFetch();
  }
});

test("managed users contract rejects sensitive drift and inconsistent pages", () => {
  const managedUser = {
    id: "user-1",
    username: "manager.one",
    fullName: "Manager One",
    email: "manager.one@example.com",
    role: "manager",
    status: "active",
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    createdBy: "superuser",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:00.000Z",
    activatedAt: "2026-06-01T00:00:00.000Z",
    lastLoginAt: null,
    passwordChangedAt: null,
    isBanned: false,
    failedLoginAttempts: 0,
    lockedAt: null,
    lockedReason: null,
    lockedBySystem: false,
  } as const;
  const validResponse = {
    ok: true,
    users: [managedUser],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  } as const;

  assert.equal(authManagedUsersResponseSchema.safeParse(validResponse).success, true);
  assert.equal(
    authManagedUsersResponseSchema.safeParse({
      ...validResponse,
      users: [{ ...managedUser, passwordHash: "must-not-reach-client" }],
    }).success,
    false,
  );
  assert.equal(
    authManagedUsersResponseSchema.safeParse({
      ...validResponse,
      users: [managedUser, managedUser],
      pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
    }).success,
    false,
  );
  assert.equal(
    authManagedUsersResponseSchema.safeParse({
      ...validResponse,
      pagination: { page: 1, pageSize: 20, total: 21, totalPages: 1 },
    }).success,
    false,
  );
});

test("managed users API wrapper rejects malformed privileged account payloads", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    assert.equal(String(input), "/api/admin/users?page=1&pageSize=20&role=manager");
    return jsonResponse({
      ok: true,
      users: [{
        id: "user-1",
        username: "manager.one",
        role: "manager",
        status: "active",
        passwordHash: "must-not-reach-client",
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => getSuperuserManagedUsers({ page: 1, pageSize: 20, role: "manager" }),
      /API contract mismatch for \/api\/admin\/users/,
    );
  } finally {
    restoreFetch();
  }
});

test("managed account delete contract requires a completed deletion", () => {
  assert.equal(
    authManagedUserDeleteResponseSchema.safeParse({
      ok: true,
      deleted: true,
      user: createAuthUserContract(),
    }).success,
    true,
  );
  assert.equal(
    authManagedUserDeleteResponseSchema.safeParse({
      ok: true,
      deleted: false,
      user: createAuthUserContract(),
    }).success,
    false,
  );
});

test("managed account mutation wrappers reject contradictory success payloads", async () => {
  const requestedUrls: string[] = [];
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url === "/api/admin/users/user%2F1") {
      return jsonResponse({
        ok: true,
        user: createAuthUserContract(),
        sessionExpiresAt: null,
      });
    }
    if (url === "/api/admin/users/user%2F1/role") {
      return jsonResponse({ ok: true, forceLogout: "yes", user: createAuthUserContract() });
    }
    if (url === "/api/admin/users/user%2F1/status") {
      return jsonResponse({ ok: true, forceLogout: false, user: null, passwordHash: "leak" });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => updateManagedUserAccount("user/1", { fullName: "Updated User" }),
      /API contract mismatch for \/api\/admin\/users\/:id/,
    );
    await assert.rejects(
      () => deleteManagedUserAccount("user/1"),
      /API contract mismatch for \/api\/admin\/users\/:id/,
    );
    await assert.rejects(
      () => updateManagedUserRole("user/1", "manager"),
      /API contract mismatch for \/api\/admin\/users\/:id\/role/,
    );
    await assert.rejects(
      () => updateManagedUserStatus("user/1", { isBanned: true }),
      /API contract mismatch for \/api\/admin\/users\/:id\/status/,
    );
    assert.deepEqual(requestedUrls, [
      "/api/admin/users/user%2F1",
      "/api/admin/users/user%2F1",
      "/api/admin/users/user%2F1/role",
      "/api/admin/users/user%2F1/status",
    ]);
  } finally {
    restoreFetch();
  }
});

test("managed account delivery contracts allow safe previews and consistent failure states", () => {
  const devDelivery = {
    deliveryMode: "dev_outbox",
    errorCode: null,
    errorMessage: null,
    expiresAt: "2026-06-30T10:00:00.000Z",
    previewUrl: "/dev/mail-preview/message-1",
    recipientEmail: "user@example.com",
    sent: true,
  } as const;
  const failedDelivery = {
    deliveryMode: "smtp",
    errorCode: "MAIL_SEND_FAILED",
    errorMessage: "Mail transport unavailable",
    expiresAt: "2026-06-30T10:00:00.000Z",
    previewUrl: null,
    recipientEmail: "user@example.com",
    sent: false,
  } as const;

  assert.equal(authManagedDeliverySchema.safeParse(devDelivery).success, true);
  assert.equal(authManagedDeliverySchema.safeParse(failedDelivery).success, true);
  assert.equal(
    authManagedDeliverySchema.safeParse({
      ...devDelivery,
      previewUrl: "javascript:alert(1)",
    }).success,
    false,
  );
  assert.equal(
    authManagedDeliverySchema.safeParse({
      ...devDelivery,
      previewUrl: "/\\attacker.example/preview",
    }).success,
    false,
  );
  assert.equal(
    authManagedDeliverySchema.safeParse({
      ...devDelivery,
      previewUrl: "//attacker.example/preview",
    }).success,
    false,
  );
  assert.equal(
    authManagedDeliverySchema.safeParse({
      ...failedDelivery,
      errorCode: null,
    }).success,
    false,
  );
  assert.equal(
    authManagedAccountActivationResponseSchema.safeParse({
      ok: true,
      user: createAuthUserContract(),
      activation: devDelivery,
    }).success,
    true,
  );
  assert.equal(
    authManagedAccountPasswordResetResponseSchema.safeParse({
      ok: true,
      forceLogout: true,
      user: createAuthUserContract(),
      reset: failedDelivery,
    }).success,
    true,
  );
});

test("managed recovery wrappers reject unsafe delivery metadata", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);
    const unsafeDelivery = {
      deliveryMode: "dev_outbox",
      errorCode: null,
      errorMessage: null,
      expiresAt: "2026-06-30T10:00:00.000Z",
      previewUrl: "javascript:alert(1)",
      recipientEmail: "user@example.com",
      sent: true,
    };
    if (url === "/api/admin/users") {
      return jsonResponse({ ok: true, user: createAuthUserContract(), activation: unsafeDelivery });
    }
    if (url === "/api/admin/users/user%2F1/reset-password") {
      return jsonResponse({
        ok: true,
        forceLogout: true,
        user: createAuthUserContract(),
        reset: unsafeDelivery,
      });
    }
    if (url === "/api/admin/users/user%2F1/resend-activation") {
      return jsonResponse({ ok: true, user: createAuthUserContract(), activation: unsafeDelivery });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => createManagedUserAccount({ username: "user.one", role: "user" }),
      /API contract mismatch for \/api\/admin\/users/,
    );
    await assert.rejects(
      () => resetManagedUserPassword("user/1"),
      /API contract mismatch for \/api\/admin\/users\/:id\/reset-password/,
    );
    await assert.rejects(
      () => resendManagedUserActivation("user/1"),
      /API contract mismatch for \/api\/admin\/users\/:id\/resend-activation/,
    );
  } finally {
    restoreFetch();
  }
});

test("privileged recovery list contracts reject sensitive drift and unsafe preview links", () => {
  const resetRequest = {
    id: "reset-1",
    userId: "user-1",
    username: "user.one",
    fullName: "User One",
    email: "user.one@example.com",
    role: "user",
    status: "active",
    isBanned: false,
    requestedByUser: "user.one",
    approvedBy: null,
    resetType: "email_link",
    createdAt: "2026-06-29T10:00:00.000Z",
    expiresAt: "2026-06-29T14:00:00.000Z",
    usedAt: null,
  } as const;
  const preview = {
    createdAt: "2026-06-29T10:00:00.000Z",
    id: "1782730000000-0123456789abcdef",
    previewUrl: "/dev/mail-preview/1782730000000-0123456789abcdef",
    subject: "Account activation",
    to: "user.one@example.com",
  } as const;

  assert.equal(
    authPendingPasswordResetRequestsResponseSchema.safeParse({
      ok: true,
      requests: [resetRequest],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    }).success,
    true,
  );
  assert.equal(
    authPendingPasswordResetRequestsResponseSchema.safeParse({
      ok: true,
      requests: [{ ...resetRequest, tokenHash: "must-not-reach-client" }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    }).success,
    false,
  );
  assert.equal(
    authDevMailOutboxPreviewsResponseSchema.safeParse({
      ok: true,
      enabled: true,
      previews: [preview],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    }).success,
    true,
  );
  assert.equal(
    authDevMailOutboxPreviewsResponseSchema.safeParse({
      ok: true,
      enabled: true,
      previews: [{ ...preview, previewUrl: "javascript:alert(1)" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    }).success,
    false,
  );
  assert.equal(
    authDevMailOutboxPreviewsResponseSchema.safeParse({
      ok: true,
      enabled: false,
      previews: [preview],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    }).success,
    false,
  );
  assert.equal(
    authDevMailOutboxDeleteResponseSchema.safeParse({ ok: true, deleted: false }).success,
    false,
  );
  assert.equal(
    authDevMailOutboxClearResponseSchema.safeParse({ ok: true, deletedCount: -1 }).success,
    false,
  );
});

test("privileged recovery list wrappers reject malformed response payloads", async () => {
  const restoreFetch = withMockFetch((async (input, init) => {
    const url = String(input);
    const method = String(init?.method || "GET").toUpperCase();
    if (url === "/api/admin/password-reset-requests" && method === "GET") {
      return jsonResponse({
        ok: true,
        requests: [{
          id: "reset-1",
          userId: "user-1",
          username: "user.one",
          fullName: null,
          email: "user.one@example.com",
          role: "user",
          status: "active",
          isBanned: false,
          requestedByUser: "user.one",
          approvedBy: null,
          resetType: "email_link",
          createdAt: "2026-06-29T10:00:00.000Z",
          expiresAt: null,
          usedAt: null,
          tokenHash: "must-not-reach-client",
        }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });
    }
    if (url === "/api/admin/dev-mail-outbox" && method === "GET") {
      return jsonResponse({
        ok: true,
        enabled: true,
        previews: [{
          createdAt: "2026-06-29T10:00:00.000Z",
          id: "mail-1",
          previewUrl: "javascript:alert(1)",
          subject: "Reset password",
          to: "user.one@example.com",
        }],
        pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
      });
    }
    if (url === "/api/admin/dev-mail-outbox/mail%2F1" && method === "DELETE") {
      return jsonResponse({ ok: true, deleted: false });
    }
    if (url === "/api/admin/dev-mail-outbox" && method === "DELETE") {
      return jsonResponse({ ok: true, deletedCount: -1 });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => getPendingPasswordResetRequests(),
      /API contract mismatch for \/api\/admin\/password-reset-requests/,
    );
    await assert.rejects(
      () => getDevMailOutboxPreviews(),
      /API contract mismatch for \/api\/admin\/dev-mail-outbox/,
    );
    await assert.rejects(
      () => deleteDevMailOutboxPreview("mail/1"),
      /API contract mismatch for \/api\/admin\/dev-mail-outbox\/:previewId/,
    );
    await assert.rejects(
      () => clearDevMailOutboxPreviews(),
      /API contract mismatch for \/api\/admin\/dev-mail-outbox/,
    );
  } finally {
    restoreFetch();
  }
});

test("authentication recovery contracts expose only bounded public token metadata", () => {
  const metadata = authRecoveryTokenMetadataSchema.parse({
    email: "operator@example.com",
    expiresAt: "2026-06-25T08:00:00.000Z",
    fullName: "Operator One",
    role: "user",
    username: "operator.one",
  });
  assert.equal(metadata.username, "operator.one");

  assert.equal(
    authActivationTokenResponseSchema.safeParse({
      ok: true,
      activation: {
        ...metadata,
        tokenHash: "must-not-cross-the-wire",
      },
    }).success,
    false,
  );
  assert.equal(
    authPasswordResetTokenResponseSchema.safeParse({
      ok: true,
      reset: {
        ...metadata,
        expiresAt: "not-a-timestamp",
      },
    }).success,
    false,
  );
  assert.equal(
    authMessageResponseSchema.safeParse({
      ok: true,
      message: "   ",
    }).success,
    false,
  );
});

test("authentication recovery API wrappers reject malformed success payloads", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);
    if (url === "/api/auth/validate-activation-token") {
      return jsonResponse({
        ok: true,
        activation: {
          email: "operator@example.com",
          expiresAt: "invalid",
          fullName: "Operator One",
          role: "user",
          username: "operator.one",
        },
      });
    }
    if (url === "/api/auth/activate-account") {
      return jsonResponse({
        ok: true,
        user: createAuthUserContract(),
        tokenHash: "must-not-cross-the-wire",
      });
    }
    if (url === "/api/auth/request-password-reset") {
      return jsonResponse({ ok: true, message: "" });
    }
    if (url === "/api/auth/validate-password-reset-token") {
      return jsonResponse({
        ok: true,
        reset: {
          email: null,
          expiresAt: "2026-06-25T08:00:00.000Z",
          fullName: null,
          role: "",
          username: "operator.one",
        },
      });
    }
    if (url === "/api/auth/reset-password-with-token") {
      return jsonResponse({ ok: true });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => validateActivationToken({ token: "token" }),
      /API contract mismatch for \/api\/auth\/validate-activation-token/,
    );
    await assert.rejects(
      () => activateAccount({
        token: "token",
        newPassword: "StrongPassword123!",
        confirmPassword: "StrongPassword123!",
      }),
      /API contract mismatch for \/api\/auth\/activate-account/,
    );
    await assert.rejects(
      () => requestPasswordReset({ identifier: "operator.one" }),
      /API contract mismatch for \/api\/auth\/request-password-reset/,
    );
    await assert.rejects(
      () => validatePasswordResetToken({ token: "token" }),
      /API contract mismatch for \/api\/auth\/validate-password-reset-token/,
    );
    await assert.rejects(
      () => resetPasswordWithToken({
        token: "token",
        newPassword: "StrongPassword123!",
        confirmPassword: "StrongPassword123!",
      }),
      /API contract mismatch for \/api\/auth\/reset-password-with-token/,
    );
  } finally {
    restoreFetch();
  }
});

test("activity feed contracts normalize nullable device fields and preserve audit facts", () => {
  const activity = {
    id: "activity-1",
    username: " operator.one ",
    role: " admin ",
    status: "ONLINE",
    pcName: null,
    browser: "Chrome 149",
    deviceType: "desktop",
    platform: "Windows 10/11",
    fingerprint: null,
    ipAddress: "203.0.113.88",
    loginTime: "2026-06-24T08:00:00.000Z",
    logoutTime: null,
    lastActivityTime: "2026-06-24T08:05:00.000Z",
    isActive: true,
    logoutReason: null,
  } as const;

  const list = activityListResponseSchema.parse({ activities: [activity] });
  assert.equal(list.activities[0]?.username, "operator.one");
  assert.equal(list.activities[0]?.role, "admin");
  assert.equal(list.activities[0]?.pcName, undefined);

  const page = activityPageResponseSchema.parse({
    activities: [activity],
    summary: {
      idleCount: 0,
      kickedCount: 0,
      logoutCount: 0,
      onlineCount: 1,
    },
    pagination: {
      mode: "offset",
      page: 1,
      pageSize: 20,
      limit: 20,
      offset: 0,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  });
  assert.equal(page.pagination.total, 1);
});

test("activity feed contracts reject unknown states, malformed timestamps, and invalid counts", () => {
  assert.equal(
    activityListResponseSchema.safeParse({
      activities: [{
        id: "",
        username: "operator.one",
        role: "admin",
        status: "UNKNOWN",
        loginTime: "not-a-date",
        isActive: true,
      }],
    }).success,
    false,
  );
  assert.equal(
    activityPageResponseSchema.safeParse({
      activities: [],
      summary: {
        idleCount: -1,
        kickedCount: 0,
        logoutCount: 0,
        onlineCount: 0,
      },
      pagination: {
        mode: "offset",
        page: 0,
        pageSize: 20,
        limit: 20,
        offset: 0,
        total: -1,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    }).success,
    false,
  );
});

test("activity mutation contracts accept valid responses and reject malformed cleanup facts", () => {
  assert.deepEqual(
    activityMutationSuccessResponseSchema.parse({ ok: true, success: true }),
    { ok: true, success: true },
  );

  const validCleanup = {
    ok: true,
    success: true,
    cutoff: "2026-05-25T08:00:00.000Z",
    deletedCount: 2,
    limit: 500,
    lockAcquired: true,
    olderThanDays: 30,
    protectedActiveBanCount: 1,
    reason: null,
    securityCutoff: "2025-06-24T08:00:00.000Z",
    securityDeletedCount: 0,
    securityRetentionDays: 365,
    skipped: false,
    standardDeletedCount: 2,
    standardRetentionDays: 30,
  } as const;

  assert.equal(activityCleanupResponseSchema.safeParse(validCleanup).success, true);
  assert.equal(
    activityCleanupResponseSchema.safeParse({
      ...validCleanup,
      deletedCount: "2",
    }).success,
    false,
  );
  assert.equal(
    activityCleanupResponseSchema.safeParse({
      ...validCleanup,
      securityCutoff: "not-a-date",
    }).success,
    false,
  );
});

test("activity session contracts require a verified online heartbeat", () => {
  assert.deepEqual(
    activityHeartbeatResponseSchema.parse({
      ok: true,
      status: "ONLINE",
      lastActivityTime: "2026-06-29T05:30:00.000Z",
    }),
    {
      ok: true,
      status: "ONLINE",
      lastActivityTime: "2026-06-29T05:30:00.000Z",
    },
  );
  assert.equal(
    activityHeartbeatResponseSchema.safeParse({
      ok: true,
      status: "IDLE",
      lastActivityTime: "2026-06-29T05:30:00.000Z",
    }).success,
    false,
  );
  assert.equal(
    activityHeartbeatResponseSchema.safeParse({
      ok: true,
      status: "ONLINE",
      lastActivityTime: "not-a-date",
    }).success,
    false,
  );
});

test("activity session wrappers reject false logout and malformed heartbeat success", async () => {
  let heartbeatCalls = 0;
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);
    if (url === "/api/activity/login") {
      return jsonResponse({ ok: true, success: "true" });
    }
    if (url === "/api/activity/logout") {
      return jsonResponse({ ok: true, success: "true" });
    }
    if (url === "/api/activity/heartbeat") {
      heartbeatCalls += 1;
      return jsonResponse({
        ok: true,
        status: heartbeatCalls === 1 ? "IDLE" : "ONLINE",
        lastActivityTime: heartbeatCalls === 1
          ? "2026-06-29T05:30:00.000Z"
          : "not-a-date",
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => activityLogin({ username: "operator.one", role: "admin" }),
      /API contract mismatch for \/api\/activity\/login/,
    );
    await assert.rejects(
      () => activityLogout("activity-1"),
      /API contract mismatch for \/api\/activity\/logout/,
    );
    await assert.rejects(
      () => activityHeartbeat({ activityId: "activity-1" }),
      /API contract mismatch for \/api\/activity\/heartbeat/,
    );
    await assert.rejects(
      () => activityHeartbeatLight(),
      /API contract mismatch for \/api\/activity\/heartbeat/,
    );
  } finally {
    restoreFetch();
  }
});

test("activity retention contract enforces policy and preview invariants", () => {
  const validResponse = {
    ok: true,
    success: true,
    retention: {
      policy: {
        autoCleanupEnabled: true,
        batchSize: 500,
        securityRetentionDays: 365,
        standardRetentionDays: 90,
      },
      preview: {
        protectedActiveBanCount: 2,
        securityEligibleCount: 3,
        standardEligibleCount: 4,
        totalEligibleCount: 7,
      },
      securityCutoff: "2025-06-24T08:00:00.000Z",
      standardCutoff: "2026-03-26T08:00:00.000Z",
    },
  } as const;

  assert.equal(activityRetentionResponseSchema.safeParse(validResponse).success, true);
  assert.equal(
    activityRetentionResponseSchema.safeParse({
      ...validResponse,
      retention: {
        ...validResponse.retention,
        policy: {
          ...validResponse.retention.policy,
          securityRetentionDays: 30,
        },
      },
    }).success,
    false,
  );
  assert.equal(
    activityRetentionResponseSchema.safeParse({
      ...validResponse,
      retention: {
        ...validResponse.retention,
        preview: {
          ...validResponse.retention.preview,
          totalEligibleCount: 8,
        },
      },
    }).success,
    false,
  );
});

test("activity banned user contract blocks identity mismatches and unexpected fields", () => {
  const bannedUser = {
    visitorId: "ban-1",
    banId: "ban-1",
    username: "operator.one",
    role: "user",
    banInfo: {
      ipAddress: "203.0.113.9",
      browser: "Chrome 149",
      bannedAt: "2026-06-24T08:00:00.000Z",
    },
  } as const;

  assert.equal(
    activityBannedUsersResponseSchema.safeParse({ users: [bannedUser] }).success,
    true,
  );
  assert.equal(
    activityBannedUsersResponseSchema.safeParse({
      users: [{ ...bannedUser, banId: "ban-2" }],
    }).success,
    false,
  );
  assert.equal(
    activityBannedUsersResponseSchema.safeParse({
      users: [{ ...bannedUser, passwordHash: "must-not-reach-client" }],
    }).success,
    false,
  );
});

test("activity moderation and policy wrappers reject malformed response payloads", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);
    if (url === "/api/activity/retention") {
      return jsonResponse({
        ok: true,
        success: true,
        retention: {
          policy: {
            autoCleanupEnabled: true,
            batchSize: 500,
            securityRetentionDays: 30,
            standardRetentionDays: 90,
          },
          preview: {
            protectedActiveBanCount: 0,
            securityEligibleCount: 0,
            standardEligibleCount: 0,
            totalEligibleCount: 0,
          },
          securityCutoff: "2026-05-25T08:00:00.000Z",
          standardCutoff: "2026-03-26T08:00:00.000Z",
        },
      });
    }
    if (url === "/api/users/banned") {
      return jsonResponse({
        users: [{
          visitorId: "ban-1",
          banId: "ban-2",
          username: "operator.one",
          role: "user",
          banInfo: { ipAddress: null, browser: null, bannedAt: null },
        }],
      });
    }
    if (["/api/activity/kick", "/api/activity/ban", "/api/admin/unban"].includes(url)) {
      return jsonResponse({ ok: true, success: "true" });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => getActivityRetentionStatus(),
      /API contract mismatch for \/api\/activity\/retention/,
    );
    await assert.rejects(
      () => getBannedUsers(),
      /API contract mismatch for \/api\/users\/banned/,
    );
    await assert.rejects(() => kickUser("activity-1"), /API contract mismatch/);
    await assert.rejects(() => banUser("activity-1"), /API contract mismatch/);
    await assert.rejects(() => unbanUser("ban-1"), /API contract mismatch/);
  } finally {
    restoreFetch();
  }
});

test("activity bulk delete contract enforces complete unique outcomes", () => {
  const validResponse = {
    ok: true,
    success: true,
    requestedCount: 4,
    deletedCount: 2,
    notFoundIds: ["missing-1"],
    protectedIds: ["protected-1"],
  } as const;

  assert.equal(activityBulkDeleteResponseSchema.safeParse(validResponse).success, true);
  assert.equal(
    activityBulkDeleteResponseSchema.safeParse({
      ...validResponse,
      requestedCount: 5,
    }).success,
    false,
  );
  assert.equal(
    activityBulkDeleteResponseSchema.safeParse({
      ...validResponse,
      notFoundIds: ["duplicate-id"],
      protectedIds: ["duplicate-id"],
    }).success,
    false,
  );
});

test("activity bulk delete API wrapper rejects contradictory response counts", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    assert.equal(String(input), "/api/activity/logs/bulk-delete");
    return jsonResponse({
      ok: true,
      success: true,
      requestedCount: 3,
      deletedCount: 3,
      notFoundIds: ["missing-1"],
      protectedIds: [],
    });
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => deleteActivityLogsBulk(["activity-1", "activity-2", "missing-1"]),
      /API contract mismatch for \/api\/activity\/logs\/bulk-delete/,
    );
  } finally {
    restoreFetch();
  }
});

test("activity mutation API wrappers encode ids and reject malformed response payloads", async () => {
  const requestedUrls: string[] = [];
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url === "/api/activity/session%2Fwith%3Fquery") {
      return jsonResponse({ ok: true, success: "true" });
    }
    if (url === "/api/activity/logs/cleanup-ended") {
      return jsonResponse({
        ok: true,
        success: true,
        cutoff: "2026-05-25T08:00:00.000Z",
        deletedCount: "2",
        limit: 500,
        lockAcquired: true,
        olderThanDays: 30,
        protectedActiveBanCount: 0,
        reason: null,
        securityCutoff: "2025-06-24T08:00:00.000Z",
        securityDeletedCount: 0,
        securityRetentionDays: 365,
        skipped: false,
        standardDeletedCount: 2,
        standardRetentionDays: 30,
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => deleteActivityLog("session/with?query"),
      /API contract mismatch for \/api\/activity\/:id/,
    );
    await assert.rejects(
      () => cleanupEndedActivityLogs(),
      /API contract mismatch for \/api\/activity\/logs\/cleanup-ended/,
    );
    assert.deepEqual(requestedUrls, [
      "/api/activity/session%2Fwith%3Fquery",
      "/api/activity/logs/cleanup-ended",
    ]);
  } finally {
    restoreFetch();
  }
});

test("activity investigation contract rejects raw fingerprints and malformed audit timestamps", () => {
  const investigationResponse = {
    ok: true,
    success: true,
    investigation: {
      session: {
        id: "activity-1",
        username: "operator.one",
        role: "admin",
        status: "ONLINE",
        isActive: true,
        loginTime: "2026-06-24T08:00:00.000Z",
        logoutTime: null,
        lastActivityTime: "2026-06-24T08:05:00.000Z",
        logoutReason: null,
        durationMs: 300_000,
        device: {
          browser: "Chrome 149",
          deviceType: "desktop",
          fingerprintHint: "masked-fp",
          ipAddress: "203.0.113.88",
          pcName: "ops-terminal",
          platform: "Windows 10/11",
        },
      },
      security: {
        activeBan: null,
        riskLevel: "normal",
        reasons: [],
        signals: [{
          code: "no_elevated_risk",
          description: "No elevated risk detected.",
          label: "Normal session",
          severity: "info",
        }],
      },
      relatedSessions: [],
      relatedSessionsPagination: {
        mode: "offset",
        page: 1,
        pageSize: 5,
        limit: 5,
        offset: 0,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      timeline: [],
      auditEvents: [{
        id: "audit-1",
        action: "LOGIN_SUCCESS",
        performedBy: "operator.one",
        requestId: "request-1",
        timestamp: "2026-06-24T08:00:00.000Z",
      }],
    },
  } as const;

  assert.equal(activityInvestigationResponseSchema.safeParse(investigationResponse).success, true);
  assert.equal(
    activityInvestigationResponseSchema.safeParse({
      ...investigationResponse,
      investigation: {
        ...investigationResponse.investigation,
        session: {
          ...investigationResponse.investigation.session,
          fingerprint: "raw-fingerprint",
        },
      },
    }).success,
    false,
  );
  assert.equal(
    activityInvestigationResponseSchema.safeParse({
      ...investigationResponse,
      investigation: {
        ...investigationResponse.investigation,
        auditEvents: [{
          ...investigationResponse.investigation.auditEvents[0],
          timestamp: "not-a-date",
        }],
      },
    }).success,
    false,
  );
});

test("activity investigation API wrapper rejects incomplete sensitive payloads", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    assert.equal(
      String(input),
      "/api/activity/activity%2F1/investigation?relatedPage=1&relatedPageSize=5",
    );
    return jsonResponse({
      ok: true,
      success: true,
      investigation: {
        session: {
          id: "activity/1",
          fingerprint: "raw-fingerprint",
        },
      },
    });
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => getActivityInvestigation("activity/1"),
      /API contract mismatch for \/api\/activity\/:id\/investigation/,
    );
  } finally {
    restoreFetch();
  }
});

test("activity feed API wrappers reject malformed contract payloads", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);
    if (url === "/api/activity/all") {
      return jsonResponse({
        activities: [{
          id: "activity-1",
          username: "operator.one",
          role: "admin",
          status: "UNKNOWN",
          loginTime: "2026-06-24T08:00:00.000Z",
          isActive: true,
        }],
      });
    }
    if (url === "/api/activity/filter") {
      return jsonResponse({ activities: "not-an-array" });
    }
    if (
      url
      === "/api/activity/page?page=1&pageSize=20&sortBy=loginTime&sortOrder=desc"
    ) {
      return jsonResponse({
        activities: [],
        summary: {
          idleCount: 0,
          kickedCount: 0,
          logoutCount: 0,
          onlineCount: 0,
        },
        pagination: {
          mode: "offset",
          page: 1,
          pageSize: 20,
          limit: 20,
          offset: 0,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => getAllActivity(),
      /API contract mismatch for \/api\/activity\/all/,
    );
    await assert.rejects(
      () => getFilteredActivity({}),
      /API contract mismatch for \/api\/activity\/filter/,
    );
    await assert.rejects(
      () => getActivityPage({
        page: 1,
        pageSize: 20,
        sortBy: "loginTime",
        sortOrder: "desc",
      }),
      /API contract mismatch for \/api\/activity\/page/,
    );
  } finally {
    restoreFetch();
  }
});

test("shared API contracts accept nullish actor fields without widening required fields", () => {
  const importRecord = importListItemSchema.safeParse({
    id: "import-123",
    name: "March Import",
    filename: "march.csv",
    createdAt: "2026-03-26T00:00:00.000Z",
    isDeleted: false,
    createdBy: null,
    rowCount: 12,
  });
  assert.equal(importRecord.success, true);

  const auditRecord = auditLogRecordSchema.safeParse({
    id: "audit-1",
    action: "LOGIN",
    performedBy: "admin.user",
    timestamp: "2026-03-26T00:00:00.000Z",
  });
  assert.equal(auditRecord.success, true);

  const malformedAuditRecord = auditLogRecordSchema.safeParse({
    id: "audit-1",
    action: "LOGIN",
    performedBy: "admin.user",
  });
  assert.equal(malformedAuditRecord.success, false);
});

test("shared API error payload contract accepts only enumerated API error codes", () => {
  const sharedCodePayload = apiErrorPayloadSchema.safeParse({
    ok: false,
    message: "Forbidden",
    code: ERROR_CODES.PERMISSION_DENIED,
  });
  assert.equal(sharedCodePayload.success, true);

  const domainCodePayload = apiErrorPayloadSchema.safeParse({
    ok: false,
    message: "Conflict",
    error: {
      code: ERROR_CODES.USERNAME_TAKEN,
      message: "Username already exists.",
    },
  });
  assert.equal(domainCodePayload.success, true);

  const typoUppercaseCodePayload = apiErrorPayloadSchema.safeParse({
    ok: false,
    message: "Bad request",
    code: "PERMISSION_DENIEDD",
  });
  assert.equal(typoUppercaseCodePayload.success, false);

  const malformedCodePayload = apiErrorPayloadSchema.safeParse({
    ok: false,
    message: "Bad request",
    code: "permission_denied",
  });
  assert.equal(malformedCodePayload.success, false);
});

test("analysis API contracts require quality and bounded column profile metadata", () => {
  const single = singleImportAnalysisResponseSchema.safeParse({
    import: {
      id: "import-1",
      name: "June",
      filename: "june.csv",
    },
    totalRows: 0,
    analysis: createEmptyAnalysisContract(),
  });
  const all = allImportsAnalysisResponseSchema.safeParse({
    totalImports: 0,
    totalRows: 0,
    imports: [],
    analysis: createEmptyAnalysisContract(),
  });

  assert.equal(single.success, true);
  assert.equal(all.success, true);
  assert.equal(singleImportAnalysisResponseSchema.safeParse({
    import: { id: "import-1", name: "June", filename: "june.csv" },
    totalRows: 0,
    analysis: {},
  }).success, false);
});

test("analysis API wrappers validate their response contracts", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);
    if (url === "/api/imports/import-1/analyze") {
      return jsonResponse({
        import: { id: "import-1", name: "June", filename: "june.csv" },
        totalRows: 0,
        analysis: createEmptyAnalysisContract(),
      });
    }
    if (url === "/api/analyze/all") {
      return jsonResponse({
        totalImports: 0,
        totalRows: 0,
        imports: [],
        analysis: createEmptyAnalysisContract(),
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    assert.equal((await analyzeImport("import-1")).analysis.quality.grade, "no_data");
    assert.equal((await analyzeAll()).analysis.columns.length, 0);
  } finally {
    restoreFetch();
  }
});

test("shared API error payload contract allows known control fields and rejects unexpected extras", () => {
  const knownControlPayload = apiErrorPayloadSchema.safeParse({
    ok: false,
    message: "Maintenance mode is active.",
    requestId: "req-123",
    code: ERROR_CODES.MAINTENANCE_ACTIVE,
    status: 503,
    limit: 8,
    maintenance: true,
    type: "hard",
    mode: "PROTECTION",
    protection: true,
    reason: "db_latency_high",
    startTime: null,
    endTime: "2026-05-24T10:00:00.000Z",
    retryAfterMs: 1_000,
    forceLogout: true,
    forcePasswordChange: true,
    banned: false,
    locked: false,
    requiresConfirmation: true,
    fieldErrors: {
      password: "Password is required.",
    },
  });
  assert.equal(knownControlPayload.success, true);

  const unexpectedTopLevelPayload = apiErrorPayloadSchema.safeParse({
    ok: false,
    message: "Bad request",
    stack: "internal stack",
  });
  assert.equal(unexpectedTopLevelPayload.success, false);

  const unexpectedNestedPayload = apiErrorPayloadSchema.safeParse({
    ok: false,
    message: "Bad request",
    error: {
      message: "Bad request",
      stack: "internal stack",
    },
  });
  assert.equal(unexpectedNestedPayload.success, false);
});

test("shared pagination metadata can be normalized without changing wire contracts", () => {
  assert.equal(apiPaginationMetaSchema.safeParse({
    mode: "offset",
    page: 2,
    pageSize: 25,
    limit: 25,
    offset: 25,
    total: 40,
    totalPages: 2,
    hasNextPage: false,
    hasPreviousPage: true,
  }).success, true);

  assert.deepEqual(
    normalizeApiPaginationMeta({
      mode: "cursor",
      limit: 100,
      nextCursor: "cursor-2",
      hasMore: true,
      total: 250,
    }),
    {
      mode: "cursor",
      page: null,
      pageSize: 100,
      limit: 100,
      offset: null,
      total: 250,
      totalPages: null,
      nextCursor: "cursor-2",
      hasNextPage: true,
      hasPreviousPage: false,
      hasMore: true,
    },
  );

  assert.deepEqual(
    normalizeApiPaginationMeta({
      mode: "hybrid",
      page: 3,
      pageSize: 50,
      limit: 50,
      offset: 100,
      total: 151,
      totalPages: 4,
      nextCursor: "cursor-4",
      hasNextPage: false,
      hasPreviousPage: true,
    }),
    {
      mode: "hybrid",
      page: 3,
      pageSize: 50,
      limit: 50,
      offset: 100,
      total: 151,
      totalPages: 4,
      nextCursor: "cursor-4",
      hasNextPage: false,
      hasPreviousPage: true,
      hasMore: true,
    },
  );
});

test("shared pagination metadata rejects page limits below one consistently", () => {
  const valid = apiPaginationMetaSchema.safeParse({
    mode: "offset",
    page: 1,
    pageSize: 1,
    limit: 1,
    offset: 0,
    total: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  assert.equal(valid.success, true);

  for (const limit of [0, -1]) {
    const parsed = apiPaginationMetaSchema.safeParse({
      mode: "offset",
      page: 1,
      pageSize: limit,
      limit,
      offset: 0,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(parsed.error.issues[0]?.message, PAGE_LIMIT_MIN_ERROR_MESSAGE);
    }
  }
});

test("collection monthly comparison contract accepts bounded monthly analytics payloads", () => {
  const parsed = collectionMonthlyComparisonResponseSchema.safeParse({
    ok: true,
    nickname: "Collector Alpha",
    startMonth: "2026-04",
    endMonth: "2026-05",
    months: [
      {
        month: "2026-04",
        label: "Apr 2026",
        totalCollection: 70450,
        recordCount: 123,
        averagePerRecord: 572.76,
      },
      {
        month: "2026-05",
        label: "May 2026",
        totalCollection: 82900,
        recordCount: 146,
        averagePerRecord: 567.81,
      },
    ],
    comparison: {
      baseMonth: "2026-04",
      targetMonth: "2026-05",
      baseLabel: "Apr 2026",
      targetLabel: "May 2026",
      baseTotal: 70450,
      targetTotal: 82900,
      difference: 12450,
      percentageChange: 17.67,
      direction: "increase",
      summary: "Collection increased by RM12,450.00 (+17.67%) compared to Apr 2026.",
    },
    freshness: {
      status: "fresh",
      pendingCount: 0,
      runningCount: 0,
      retryCount: 0,
      oldestPendingAgeMs: 0,
      message: "Fresh: report rollups are up to date.",
    },
  });

  assert.equal(parsed.success, true);
});

test("collection monthly summary contract bounds reports to calendar months", () => {
  const summary = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    monthName: `Month ${index + 1}`,
    totalRecords: index,
    totalAmount: index * 100,
  }));

  assert.equal(collectionMonthlySummaryResponseSchema.safeParse({
    ok: true,
    year: 2026,
    summary,
  }).success, true);

  assert.equal(collectionMonthlySummaryResponseSchema.safeParse({
    ok: true,
    year: 2026,
    summary: [...summary, {
      month: 13,
      monthName: "Month 13",
      totalRecords: 0,
      totalAmount: 0,
    }],
  }).success, false);
});

test("collection monthly target contract accepts configured and missing targets", () => {
  const configured = collectionMonthlyTargetResponseSchema.safeParse({
    ok: true,
    nickname: "Collector Alpha",
    month: {
      key: "2026-05",
      year: 2026,
      month: 5,
    },
    monthlyTarget: 80000,
    configured: true,
    source: "configured",
  });
  assert.equal(configured.success, true);

  const missing = collectionMonthlyTargetResponseSchema.safeParse({
    ok: true,
    nickname: "Collector Alpha",
    month: {
      key: "2026-06",
      year: 2026,
      month: 6,
    },
    monthlyTarget: 0,
    configured: false,
    source: "missing",
  });
  assert.equal(missing.success, true);
});

test("collection purge contracts reject negative counts and malformed dates", () => {
  const sharedPayload = {
    ok: true,
    retentionMonths: 6,
    cutoffDate: "2025-12-27",
    totalAmount: 450.75,
  };

  assert.equal(collectionPurgeSummaryResponseSchema.safeParse({
    ...sharedPayload,
    eligibleRecords: 2,
  }).success, true);
  assert.equal(collectionPurgeResponseSchema.safeParse({
    ...sharedPayload,
    deletedRecords: 2,
  }).success, true);
  assert.equal(collectionPurgeResponseSchema.safeParse({
    ...sharedPayload,
    cutoffDate: "27-12-2025",
    deletedRecords: -1,
  }).success, false);
});

test("collection nickname summary contract accepts target-aware bounded summaries", () => {
  const parsed = collectionNicknameSummaryResponseSchema.safeParse({
    ok: true,
    nicknames: ["Collector Alpha"],
    totalRecords: 3,
    totalAmount: 450.5,
    page: 1,
    pageSize: 250,
    limit: 250,
    offset: 0,
    nicknameTotals: [{
      nickname: "Collector Alpha",
      totalRecords: 3,
      totalAmount: 450.5,
      targetBenchmark: {
        amount: 62000,
        configuredMonths: 1,
        latestUpdatedAt: "2026-03-15T06:30:00.000Z",
        latestUpdatedBy: "superuser",
        missingMonths: 0,
        months: [{
          amount: 62000,
          configured: true,
          month: "2026-03",
          updatedAt: "2026-03-15T06:30:00.000Z",
          updatedBy: "superuser",
        }],
        requestedMonths: 1,
      },
    }],
    records: [{
      id: "collection-1",
      customerName: "Alice Tan",
      icNumber: "900101015555",
      customerPhone: "0123456789",
      accountNumber: "ACC-1001",
      batch: "P10",
      paymentDate: "2026-03-01",
      amount: "120.50",
      receiptFile: null,
      receipts: [{
        id: "receipt-1",
        collectionRecordId: "collection-1",
        storagePath: "collection-receipts/receipt-1.pdf",
        originalFileName: "receipt.pdf",
        originalMimeType: "application/pdf",
        originalExtension: ".pdf",
        fileSize: 2048,
        receiptAmount: "120.50",
        extractedAmount: "120.50",
        extractionStatus: "suggested",
        extractionConfidence: 0.98,
        receiptDate: "2026-03-01",
        receiptReference: "PAY-1001",
        fileHash: "sha256-example",
        createdAt: "2026-03-01T09:00:00.000Z",
        deletedAt: null,
      }],
      archivedReceipts: [],
      receiptTotalAmount: "120.50",
      receiptValidationStatus: "matched",
      receiptValidationMessage: null,
      receiptCount: 1,
      duplicateReceiptFlag: false,
      createdByLogin: "staff.user",
      collectionStaffNickname: "Collector Alpha",
      createdAt: "2026-03-01T09:00:00.000Z",
      updatedAt: "2026-03-01T09:10:00.000Z",
    }],
    pagination: {
      mode: "hybrid",
      page: 1,
      pageSize: 250,
      total: 3,
      totalPages: 1,
      limit: 250,
      offset: 0,
      nextCursor: null,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  });

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.records[0]?.receipts[0]?.originalFileName, "receipt.pdf");
    assert.equal(
      parsed.data.nicknameTotals[0]?.targetBenchmark?.latestUpdatedBy,
      "superuser",
    );
    assert.equal(
      parsed.data.nicknameTotals[0]?.targetBenchmark?.months?.[0]?.month,
      "2026-03",
    );
  }
});

test("collection nickname summary contract rejects oversized record pages", () => {
  const validRecord = {
    id: "collection-1",
    customerName: "Alice Tan",
    icNumber: "900101015555",
    customerPhone: "0123456789",
    accountNumber: "ACC-1001",
    batch: "P10",
    paymentDate: "2026-03-01",
    amount: "1.00",
    receiptFile: null,
    receipts: [],
    archivedReceipts: [],
    receiptTotalAmount: "0.00",
    receiptValidationStatus: "unverified",
    receiptValidationMessage: null,
    receiptCount: 0,
    duplicateReceiptFlag: false,
    createdByLogin: "staff.user",
    collectionStaffNickname: "Collector Alpha",
    createdAt: "2026-03-01T09:00:00.000Z",
    updatedAt: "2026-03-01T09:10:00.000Z",
  };
  const parsed = collectionNicknameSummaryResponseSchema.safeParse({
    ok: true,
    nicknames: ["Collector Alpha"],
    totalRecords: 251,
    totalAmount: 251,
    page: 1,
    pageSize: 250,
    limit: 250,
    offset: 0,
    nicknameTotals: [],
    records: Array.from({ length: 251 }, () => validRecord),
    pagination: {
      mode: "hybrid",
      page: 1,
      pageSize: 250,
      total: 251,
      totalPages: 2,
      limit: 250,
      offset: 0,
      nextCursor: null,
      hasNextPage: true,
      hasPreviousPage: false,
    },
  });

  assert.equal(parsed.success, false);
});

test("imports API wrappers accept payloads that match the shared contract", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);

    if (url.startsWith("/api/imports/import-123/data")) {
      return jsonResponse({
        rows: [
          {
            id: "row-1",
            importId: "import-123",
            jsonDataJsonb: { name: "Alice" },
          },
        ],
        headers: ["name", "email"],
        total: 1,
        page: 1,
        limit: 50,
        pageSize: 50,
        offset: 0,
        nextCursor: null,
        pagination: {
          mode: "hybrid",
          page: 1,
          pageSize: 50,
          limit: 50,
          offset: 0,
          total: 1,
          totalPages: 1,
          nextCursor: null,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    }

    if (url === "/api/imports") {
      return jsonResponse({
        imports: [
          {
            id: "import-123",
            name: "March Import",
            filename: "march.csv",
            createdAt: "2026-03-26T00:00:00.000Z",
            isDeleted: false,
            createdBy: "admin.user",
            rowCount: 12,
          },
        ],
        pagination: {
          mode: "cursor",
          limit: 100,
          pageSize: 100,
          nextCursor: null,
          hasMore: false,
          total: 1,
        },
      });
    }

    if (url === "/api/imports/import-123/rename") {
      return jsonResponse({
        id: "import-123",
        name: "Renamed Import",
        filename: "march.csv",
        createdAt: "2026-03-26T00:00:00.000Z",
        isDeleted: false,
        createdBy: "admin.user",
      });
    }

    if (url === "/api/imports/import-123") {
      return jsonResponse({
        ok: true,
        success: true,
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    const imports = await getImports();
    const importPage = await getImportData("import-123", 1, 50);
    const renamed = await renameImport("import-123", "Renamed Import");
    const deleted = await deleteImport("import-123");

    assert.equal(imports.imports[0]?.rowCount, 12);
    assert.equal(imports.pagination.mode, "cursor");
    assert.equal(importPage.rows[0]?.jsonDataJsonb?.name, "Alice");
    assert.deepEqual(importPage.headers, ["name", "email"]);
    assert.equal(importPage.pagination.mode, "hybrid");
    assert.equal(renamed.name, "Renamed Import");
    assert.equal(deleted.success, true);
  } finally {
    restoreFetch();
  }
});

test("search and audit API wrappers accept payloads that match the shared contract", async () => {
  const restoreFetch = withMockFetch((async (input, init) => {
    const url = String(input);
    const method = String(init?.method || "GET").toUpperCase();

    if (url === "/api/search/global?q=alice&page=2&pageSize=25") {
      return jsonResponse({
        columns: ["name", "Source File"],
        rows: [{ name: "Alice", "Source File": "march.csv" }],
        results: [{ name: "Alice", "Source File": "march.csv" }],
        total: 40,
        page: 2,
        limit: 25,
        pageSize: 25,
        offset: 25,
        pagination: {
          mode: "offset",
          page: 2,
          pageSize: 25,
          limit: 25,
          offset: 25,
          total: 40,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      });
    }

    if (url === "/api/search/advanced" && method === "POST") {
      return jsonResponse({
        results: [{ name: "Alice", "Source File": "march.csv" }],
        headers: ["name", "Source File"],
        total: 40,
        page: 2,
        limit: 25,
        pageSize: 25,
        offset: 25,
        pagination: {
          mode: "offset",
          page: 2,
          pageSize: 25,
          limit: 25,
          offset: 25,
          total: 40,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      });
    }

    if (url === "/api/search/columns") {
      return jsonResponse(["name", "phone"]);
    }

    if (url === "/api/audit-logs?page=2&pageSize=25") {
      return jsonResponse({
        logs: [
          {
            id: "audit-1",
            action: "LOGIN",
            performedBy: "admin.user",
            requestId: null,
            targetUser: "alice",
            targetResource: "auth:login",
            details: "Successful login",
            timestamp: "2026-03-26T00:00:00.000Z",
          },
        ],
        pagination: {
          mode: "offset",
          page: 2,
          pageSize: 25,
          limit: 25,
          offset: 25,
          total: 26,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    const global = await searchData("alice", 2, 25);
    const advanced = await advancedSearchData(
      [{ field: "name", operator: "contains", value: "alice" }],
      "AND",
      2,
      25,
    );
    const columns = await getSearchColumns();
    const audit = await getAuditLogs({ page: 2, pageSize: 25 });

    assert.equal(global.pagination.mode, "offset");
    assert.equal(global.pagination.offset, 25);
    assert.equal(advanced.pagination.totalPages, 2);
    assert.deepEqual(columns, ["name", "phone"]);
    assert.equal(audit.pagination.mode, "offset");
    assert.equal(audit.logs[0]?.action, "LOGIN");
  } finally {
    restoreFetch();
  }
});

test("search and audit API wrappers reject malformed contract payloads", async () => {
  const restoreFetch = withMockFetch((async (input, init) => {
    const url = String(input);
    const method = String(init?.method || "GET").toUpperCase();

    if (url.startsWith("/api/search/global?")) {
      return jsonResponse({ results: [], total: 0 });
    }

    if (url === "/api/search/advanced" && method === "POST") {
      return jsonResponse({ results: [], total: 0 });
    }

    if (url === "/api/search/columns") {
      return jsonResponse([""]);
    }

    if (url.startsWith("/api/audit-logs?")) {
      return jsonResponse({ logs: [] });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(() => searchData("alice", 1, 25), /API contract mismatch for \/api\/search\/global/);
    await assert.rejects(
      () => advancedSearchData([{ field: "name", operator: "contains", value: "alice" }], "AND", 1, 25),
      /API contract mismatch for \/api\/search\/advanced/,
    );
    await assert.rejects(() => getSearchColumns(), /API contract mismatch for \/api\/search\/columns/);
    await assert.rejects(() => getAuditLogs({ page: 1, pageSize: 25 }), /API contract mismatch for \/api\/audit-logs/);
  } finally {
    restoreFetch();
  }
});

test("imports API wrappers reject malformed contract payloads", async () => {
  const restoreFetch = withMockFetch((async (input) => {
    const url = String(input);

    if (url === "/api/imports") {
      return jsonResponse({
        ok: true,
      });
    }

    if (url.startsWith("/api/imports/import-123/data")) {
      return jsonResponse({
        rows: [],
        total: 0,
      });
    }

    return jsonResponse({});
  }) as typeof fetch);

  try {
    await assert.rejects(() => getImports(), /API contract mismatch for \/api\/imports/);
    await assert.rejects(
      () => getImportData("import-123", 1, 50),
      /API contract mismatch for \/api\/imports\/import-123\/data/,
    );
  } finally {
    restoreFetch();
  }
});

test("API wrappers reject non-object JSON rows for import and search payloads", async () => {
  const restoreFetch = withMockFetch((async (input, init) => {
    const url = String(input);
    const method = String(init?.method || "GET").toUpperCase();

    if (url.startsWith("/api/imports/import-123/data")) {
      return jsonResponse({
        rows: [
          {
            id: "row-1",
            importId: "import-123",
            jsonDataJsonb: ["unexpected-array"],
          },
        ],
        headers: ["name"],
        total: 1,
        page: 1,
        limit: 50,
        pageSize: 50,
        offset: 0,
        nextCursor: null,
        pagination: {
          mode: "hybrid",
          page: 1,
          pageSize: 50,
          limit: 50,
          offset: 0,
          total: 1,
          totalPages: 1,
          nextCursor: null,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    }

    if (url.startsWith("/api/search/global?")) {
      return jsonResponse({
        columns: ["name"],
        rows: [["unexpected-array"]],
        results: [["unexpected-array"]],
        total: 1,
        page: 1,
        limit: 25,
        pageSize: 25,
        offset: 0,
        pagination: {
          mode: "offset",
          page: 1,
          pageSize: 25,
          limit: 25,
          offset: 0,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    }

    if (url === "/api/search/advanced" && method === "POST") {
      return jsonResponse({
        results: [["unexpected-array"]],
        headers: ["name"],
        total: 1,
        page: 1,
        limit: 25,
        pageSize: 25,
        offset: 0,
        pagination: {
          mode: "offset",
          page: 1,
          pageSize: 25,
          limit: 25,
          offset: 0,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    await assert.rejects(
      () => getImportData("import-123", 1, 50),
      /API contract mismatch for \/api\/imports\/import-123\/data/,
    );
    await assert.rejects(() => searchData("alice", 1, 25), /API contract mismatch for \/api\/search\/global/);
    await assert.rejects(
      () => advancedSearchData([{ field: "name", operator: "contains", value: "alice" }], "AND", 1, 25),
      /API contract mismatch for \/api\/search\/advanced/,
    );
  } finally {
    restoreFetch();
  }
});

test("settings API wrappers accept payloads that match the shared contract", async () => {
  const restoreFetch = withMockFetch((async (input, init) => {
    const url = String(input);
    const method = String(init?.method || "GET").toUpperCase();

    if (url === "/api/settings" && method === "GET") {
      return jsonResponse({
        categories: [
          {
            id: "general",
            name: "General",
            description: null,
            settings: [
              {
                key: "system_name",
                label: "System Name",
                description: null,
                type: "text",
                value: "SQR",
                defaultValue: "SQR",
                isCritical: false,
                updatedAt: "2026-03-26T00:00:00.000Z",
                permission: {
                  canView: true,
                  canEdit: true,
                },
                options: [],
              },
            ],
          },
        ],
      });
    }

    if (url === "/api/settings" && method === "PATCH") {
      return jsonResponse({
        ok: true,
        success: true,
        status: "updated",
        message: "Updated.",
        setting: {
          key: "system_name",
          label: "System Name",
          description: null,
          type: "text",
          value: "SQR Next",
          defaultValue: "SQR",
          isCritical: false,
          updatedAt: "2026-03-26T00:00:00.000Z",
          permission: {
            canView: true,
            canEdit: true,
          },
          options: [],
        },
      });
    }

    if (url === "/api/settings/tab-visibility") {
      return jsonResponse({
        role: "admin",
        tabs: {
          settings: true,
          home: true,
        },
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch);

  try {
    const settings = await getSettings();
    const tabVisibility = await getTabVisibility();
    const updated = await updateSetting({ key: "system_name", value: "SQR Next" });

    assert.equal(settings.categories[0]?.settings[0]?.key, "system_name");
    assert.equal(tabVisibility.tabs.settings, true);
    assert.equal(updated.status, "updated");
  } finally {
    restoreFetch();
  }
});

test("updateSetting rejects malformed success payloads", async () => {
  const restoreFetch = withMockFetch((async () =>
    jsonResponse({
      success: true,
      message: "Updated.",
    })) as typeof fetch);

  try {
    await assert.rejects(
      () => updateSetting({ key: "system_name", value: "SQR Next" }),
      /API contract mismatch for \/api\/settings/,
    );
  } finally {
    restoreFetch();
  }
});
