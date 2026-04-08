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
    getPeakHours: async () => peakHours,
    getRoleDistribution: async () => roleDistribution,
  };
  const service = new OperationsAnalyticsService(analyticsRepository);

  assert.deepEqual(await service.getDashboardSummary(), summary);
  assert.deepEqual(await service.getPeakHours(), peakHours);
  assert.deepEqual(await service.getRoleDistribution(), roleDistribution);
});

test("OperationsAnalyticsService clamps login-trend days and active-user limits", async () => {
  const loginTrendCalls: number[] = [];
  const topUserCalls: number[] = [];
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
    getPeakHours: async () => [],
    getRoleDistribution: async () => [],
  };
  const service = new OperationsAnalyticsService(analyticsRepository);

  const loginTrends = await service.getLoginTrends(0);
  const topUsers = await service.getTopActiveUsers(0);

  assert.deepEqual(loginTrendCalls, [1]);
  assert.deepEqual(topUserCalls, [1]);
  assert.equal(loginTrends[0].logins, 1);
  assert.equal(topUsers[0].loginCount, 1);
});
