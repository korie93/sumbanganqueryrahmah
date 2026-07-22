import assert from "node:assert/strict";
import test from "node:test";
import { OperationsAnalyticsService } from "../operations-analytics.service";

type OperationsAnalyticsRepository = ConstructorParameters<typeof OperationsAnalyticsService>[0];

test("OperationsAnalyticsService proxies summary and distribution reads", async () => {
  const summary = {
    totalUsers: 3,
    activeSessions: 1,
    loginsToday: 2,
    totalDataRows: 10,
    totalImports: 2,
    bannedUsers: 0,
    collectionRecordVersionConflicts24h: 1,
    loginFailures24h: 0,
    backupActions24h: 0,
  };
  const peakHours = [{ hour: 9, count: 4 }];
  const roleDistribution = [{ role: "superuser", count: 1 }];

  const analyticsRepository: OperationsAnalyticsRepository = {
    getDashboardSummary: async () => summary,
    getLoginTrends: async () => [],
    getTopActiveUsers: async () => [],
    getRecentLoginActivity: async () => [],
    getRecentLoginActivityPage: async (options) => ({
      activities: [],
      filterCounts: { active: 0, all: 0, attention: 0, ended: 0, failed: 0 },
      pagination: {
        page: options.page,
        pageSize: options.pageSize,
        totalItems: 0,
        totalPages: 1,
      },
    }),
    getPeakHours: async () => peakHours,
    getRoleDistribution: async () => roleDistribution,
  };
  const service = new OperationsAnalyticsService(analyticsRepository);

  assert.deepEqual(await service.getDashboardSummary(), summary);
  assert.deepEqual(await service.getPeakHours(), peakHours);
  assert.deepEqual(await service.getRoleDistribution(), roleDistribution);
});

test("OperationsAnalyticsService clamps login-trend days and validates active-user limits", async () => {
  const loginTrendCalls: number[] = [];
  const topUserCalls: number[] = [];
  const recentLoginActivityCalls: number[] = [];
  const recentLoginActivityPageCalls: Array<
    Parameters<OperationsAnalyticsRepository["getRecentLoginActivityPage"]>[0]
  > = [];
  const analyticsRepository: OperationsAnalyticsRepository = {
    getDashboardSummary: async () => ({
      totalUsers: 0,
      activeSessions: 0,
      loginsToday: 0,
      totalDataRows: 0,
      totalImports: 0,
      bannedUsers: 0,
      collectionRecordVersionConflicts24h: 0,
      loginFailures24h: 0,
      backupActions24h: 0,
    }),
    getLoginTrends: async (days: number) => {
      loginTrendCalls.push(days);
      return [{ date: "2026-03-20", logins: days, logouts: 0 }];
    },
    getTopActiveUsers: async (limit: number) => {
      topUserCalls.push(limit);
      return [{ username: "super.user", role: "superuser", loginCount: limit, lastLogin: null }];
    },
    getRecentLoginActivity: async (limit: number) => {
      recentLoginActivityCalls.push(limit);
      return [{
        browser: "Chrome",
        id: "activity-1",
        ipAddress: "127.0.x.x",
        lastActivityTime: null,
        loginTime: null,
        logoutReason: null,
        logoutTime: null,
        role: "superuser",
        status: "active",
        username: "super.user",
      }];
    },
    getRecentLoginActivityPage: async (options) => {
      recentLoginActivityPageCalls.push(options);
      return {
        activities: [],
        filterCounts: { active: 0, all: 0, attention: 0, ended: 0, failed: 0 },
        pagination: {
          page: options.page,
          pageSize: options.pageSize,
          totalItems: 0,
          totalPages: 1,
        },
      };
    },
    getPeakHours: async () => [],
    getRoleDistribution: async () => [],
  };
  const service = new OperationsAnalyticsService(analyticsRepository);

  const loginTrends = await service.getLoginTrends(0);
  const topUsers = await service.getTopActiveUsers(1);
  const recentLoginActivity = await service.getRecentLoginActivity(2);
  const recentLoginActivityPage = await service.getRecentLoginActivityPage({
    dateFrom: "2026-05-01",
    dateTo: "2026-05-31",
    page: "2",
    pageSize: "100",
    search: "  super.user  ",
    status: "ENDED",
  });

  assert.deepEqual(loginTrendCalls, [1]);
  assert.deepEqual(topUserCalls, [1]);
  assert.deepEqual(recentLoginActivityCalls, [2]);
  assert.deepEqual(recentLoginActivityPageCalls, [{
    dateFrom: "2026-05-01",
    dateTo: "2026-05-31",
    includeExactIpAddress: false,
    includeInternalReason: false,
    page: 2,
    pageSize: 25,
    search: "super.user",
    sortBy: "eventTime",
    sortOrder: "desc",
    status: "ended",
  }]);
  assert.equal(loginTrends[0].logins, 1);
  assert.equal(topUsers[0].loginCount, 1);
  assert.equal(recentLoginActivity[0].username, "super.user");
  assert.equal(recentLoginActivityPage.pagination.pageSize, 25);

  await assert.rejects(
    () => service.getTopActiveUsers(0),
    /Page limit must be at least 1/,
  );
  await assert.rejects(
    () => service.getRecentLoginActivity(0),
    /Page limit must be at least 1/,
  );
  await assert.rejects(
    () => service.getRecentLoginActivityPage({ status: "unknown" }),
    /status must be one of/,
  );
  await assert.rejects(
    () => service.getRecentLoginActivityPage({ dateFrom: "2026-02-30" }),
    /valid calendar date/,
  );
  await assert.rejects(
    () => service.getRecentLoginActivityPage({
      dateFrom: "2026-06-02",
      dateTo: "2026-06-01",
    }),
    /dateFrom must be before or equal to dateTo/,
  );
  await assert.rejects(
    () => service.getRecentLoginActivityPage({ pageSize: 0 }),
    /Page limit must be at least 1/,
  );
  await assert.rejects(
    () => service.getRecentLoginActivityPage({ role: "root" }),
    /role filter is invalid/,
  );
  await assert.rejects(
    () => service.getRecentLoginActivityPage({ sortBy: "details" }),
    /sortBy must be one of/,
  );
  await assert.rejects(
    () => service.getRecentLoginActivityPage({ sortOrder: "sideways" }),
    /sortOrder must be asc or desc/,
  );
});

test("OperationsAnalyticsService exposes exact IPs only to admins and superusers", async () => {
  const calls: Array<
    Parameters<OperationsAnalyticsRepository["getRecentLoginActivityPage"]>[0]
  > = [];
  const analyticsRepository = {
    getDashboardSummary: async () => ({
      totalUsers: 0,
      activeSessions: 0,
      loginsToday: 0,
      totalDataRows: 0,
      totalImports: 0,
      bannedUsers: 0,
      collectionRecordVersionConflicts24h: 0,
      loginFailures24h: 0,
      backupActions24h: 0,
    }),
    getLoginTrends: async () => [],
    getTopActiveUsers: async () => [],
    getRecentLoginActivity: async () => [],
    getRecentLoginActivityPage: async (
      options: Parameters<OperationsAnalyticsRepository["getRecentLoginActivityPage"]>[0],
    ) => {
      calls.push(options);
      return {
        activities: [],
        filterCounts: { active: 0, all: 0, attention: 0, ended: 0, failed: 0 },
        pagination: {
          page: options.page,
          pageSize: options.pageSize,
          totalItems: 0,
          totalPages: 1,
        },
      };
    },
    getPeakHours: async () => [],
    getRoleDistribution: async () => [],
  } satisfies OperationsAnalyticsRepository;
  const service = new OperationsAnalyticsService(analyticsRepository);

  await service.getRecentLoginActivityPage({
    role: "manager",
    sortBy: "username",
    sortOrder: "asc",
    status: "failed",
  }, "manager");
  await service.getRecentLoginActivityPage({ status: "failed" }, "admin");
  await service.getRecentLoginActivityPage({ status: "failed" }, "superuser");

  assert.equal(calls[0]?.includeExactIpAddress, false);
  assert.equal(calls[0]?.includeInternalReason, false);
  assert.equal(calls[0]?.role, "manager");
  assert.equal(calls[0]?.sortBy, "username");
  assert.equal(calls[0]?.sortOrder, "asc");
  assert.equal(calls[1]?.includeExactIpAddress, true);
  assert.equal(calls[1]?.includeInternalReason, false);
  assert.equal(calls[2]?.includeExactIpAddress, true);
  assert.equal(calls[2]?.includeInternalReason, true);
});
