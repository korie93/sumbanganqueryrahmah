import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDashboardRecentLoginActivityFilterCounts,
  buildDashboardAccessSignals,
  buildDashboardLoginRiskInsights,
  buildDashboardTrendTickDates,
  buildSummaryCards,
  filterDashboardRecentLoginActivities,
  formatDashboardAxisDate,
  formatDashboardRecentLoginTime,
  formatDashboardUserLastLogin,
  isDashboardRecentLoginAttentionActivity,
  resolveDashboardLoginRiskSummary,
  resolveDashboardRecentLoginRiskNote,
  resolveDashboardRecentLoginStatusMeta,
} from "@/pages/dashboard/utils";
import type { RecentLoginActivity } from "@/pages/dashboard/types";

test("buildSummaryCards includes stale conflict monitor value when provided", () => {
  const cards = buildSummaryCards({
    totalUsers: 10,
    activeSessions: 2,
    loginsToday: 5,
    totalDataRows: 100,
    totalImports: 4,
    bannedUsers: 1,
    collectionRecordVersionConflicts24h: 7,
  });

  const staleConflictCard = cards.find((card) => card.title === "Stale Record Conflicts (24h)");
  assert.ok(staleConflictCard);
  assert.equal(staleConflictCard.value, 7);

  const failedLoginCard = cards.find((card) => card.title === "Failed Logins (24h)");
  assert.ok(failedLoginCard);
  assert.equal(failedLoginCard.value, 0);
});

test("buildSummaryCards falls back to zero optional monitor counts", () => {
  const cards = buildSummaryCards({
    totalUsers: 10,
    activeSessions: 2,
    loginsToday: 5,
    totalDataRows: 100,
    totalImports: 4,
    bannedUsers: 1,
  });

  const staleConflictCard = cards.find((card) => card.title === "Stale Record Conflicts (24h)");
  assert.ok(staleConflictCard);
  assert.equal(staleConflictCard.value, 0);

  const failedLoginCard = cards.find((card) => card.title === "Failed Logins (24h)");
  assert.ok(failedLoginCard);
  assert.equal(failedLoginCard.value, 0);

  const backupActionCard = cards.find((card) => card.title === "Backup Actions (24h)");
  assert.ok(backupActionCard);
  assert.equal(backupActionCard.value, 0);
});

test("buildSummaryCards includes optional failed login and backup action counts", () => {
  const cards = buildSummaryCards({
    totalUsers: 10,
    activeSessions: 2,
    loginsToday: 5,
    totalDataRows: 100,
    totalImports: 4,
    bannedUsers: 1,
    backupActions24h: 3,
    loginFailures24h: 12,
  });

  assert.equal(cards.find((card) => card.title === "Failed Logins (24h)")?.value, 12);
  assert.equal(cards.find((card) => card.title === "Backup Actions (24h)")?.value, 3);
});

test("buildDashboardAccessSignals classifies login pressure for operator review", () => {
  const signals = buildDashboardAccessSignals({
    totalUsers: 10,
    activeSessions: 2,
    loginsToday: 5,
    totalDataRows: 100,
    totalImports: 4,
    bannedUsers: 1,
    loginFailures24h: 12,
  });

  assert.equal(signals.find((signal) => signal.title === "Gagal login 24j")?.tone, "danger");
  assert.equal(signals.find((signal) => signal.title === "Akaun disekat")?.tone, "warning");
});

test("buildDashboardLoginRiskInsights escalates failed login and trend pressure", () => {
  const insights = buildDashboardLoginRiskInsights({
    recentLoginActivities: [
      {
        browser: "Chrome",
        ipAddress: "10.42.x.x",
        lastActivityTime: "2026-05-06T02:30:00Z",
        loginTime: "2026-05-06T02:00:00Z",
        logoutReason: null,
        logoutTime: null,
        role: "superuser",
        status: "active",
        username: "super.user",
      },
    ],
    summary: {
      activeSessions: 9,
      bannedUsers: 0,
      loginsToday: 10,
      loginFailures24h: 12,
      totalDataRows: 100,
      totalImports: 4,
      totalUsers: 10,
    },
    trends: [
      { date: "2026-05-04", logins: 2, logouts: 1 },
      { date: "2026-05-05", logins: 3, logouts: 1 },
      { date: "2026-05-06", logins: 10, logouts: 2 },
    ],
  });

  assert.equal(insights.find((insight) => insight.title === "Failed login pressure")?.tone, "danger");
  assert.equal(insights.find((insight) => insight.title === "Active session load")?.tone, "warning");
  assert.equal(insights.find((insight) => insight.title === "Login trend check")?.tone, "warning");
  assert.equal(insights.find((insight) => insight.title === "Recent session state")?.tone, "success");
  assert.equal(resolveDashboardLoginRiskSummary(insights).label, "Attention");
});

test("buildDashboardLoginRiskInsights stays calm for normal login signals", () => {
  const insights = buildDashboardLoginRiskInsights({
    recentLoginActivities: [],
    summary: {
      activeSessions: 1,
      bannedUsers: 0,
      loginsToday: 2,
      loginFailures24h: 0,
      totalDataRows: 100,
      totalImports: 4,
      totalUsers: 10,
    },
    trends: [
      { date: "2026-05-04", logins: 2, logouts: 1 },
      { date: "2026-05-05", logins: 2, logouts: 1 },
      { date: "2026-05-06", logins: 2, logouts: 1 },
    ],
  });

  assert.equal(insights.find((insight) => insight.title === "Failed login pressure")?.tone, "success");
  assert.equal(insights.find((insight) => insight.title === "Active session load")?.tone, "success");
  assert.equal(insights.find((insight) => insight.title === "Login trend check")?.tone, "success");
  assert.equal(insights.find((insight) => insight.title === "Recent session state")?.tone, "info");
  assert.equal(resolveDashboardLoginRiskSummary(insights).label, "Normal");
});

test("formatDashboardUserLastLogin keeps login timestamps in operational timezone", () => {
  assert.equal(
    formatDashboardUserLastLogin("2026-04-02T10:27:00.000Z"),
    "02/04/2026, 6:27 PM",
  );
});

test("formatDashboardUserLastLogin falls back safely when missing", () => {
  assert.equal(formatDashboardUserLastLogin(null), "Unknown");
});

test("recent login utilities keep timestamps readable and status labels explicit", () => {
  assert.equal(
    formatDashboardRecentLoginTime("2026-04-02T10:27:00.000Z"),
    "02/04/2026, 6:27 PM",
  );
  assert.equal(formatDashboardRecentLoginTime(null), "Unknown");
  assert.equal(resolveDashboardRecentLoginStatusMeta("active").label, "Active");
  assert.equal(resolveDashboardRecentLoginStatusMeta("ended").label, "Ended");
});

test("recent login activity filters count active, ended, and attention rows", () => {
  const activities: RecentLoginActivity[] = [
    {
      browser: "Chrome",
      ipAddress: "10.42.x.x",
      lastActivityTime: "2026-05-06T02:30:00Z",
      loginTime: "2026-05-06T02:00:00Z",
      logoutReason: null,
      logoutTime: null,
      role: "superuser",
      status: "active",
      username: "active.user",
    },
    {
      browser: "Edge",
      ipAddress: "10.43.x.x",
      lastActivityTime: "2026-05-06T03:30:00Z",
      loginTime: "2026-05-06T03:00:00Z",
      logoutReason: "USER_LOGOUT",
      logoutTime: "2026-05-06T04:00:00Z",
      role: "admin",
      status: "ended",
      username: "ended.user",
    },
    {
      browser: "Firefox",
      ipAddress: "10.44.x.x",
      lastActivityTime: "2026-05-06T04:30:00Z",
      loginTime: "2026-05-06T04:00:00Z",
      logoutReason: "IDLE_TIMEOUT",
      logoutTime: "2026-05-06T05:00:00Z",
      role: "user",
      status: "ended",
      username: "attention.user",
    },
  ];

  assert.equal(isDashboardRecentLoginAttentionActivity(activities[2]!), true);
  assert.deepEqual(buildDashboardRecentLoginActivityFilterCounts(activities), {
    active: 1,
    all: 3,
    attention: 1,
    ended: 2,
  });
  assert.deepEqual(
    filterDashboardRecentLoginActivities(activities, "attention").map((activity) => activity.username),
    ["attention.user"],
  );
  assert.deepEqual(
    filterDashboardRecentLoginActivities(activities, "active").map((activity) => activity.username),
    ["active.user"],
  );
  assert.equal(resolveDashboardRecentLoginRiskNote(activities[0]!).label, "Active session");
  assert.equal(resolveDashboardRecentLoginRiskNote(activities[1]!).label, "Normal session end");
  assert.equal(resolveDashboardRecentLoginRiskNote(activities[2]!).label, "Timeout session");
});

test("formatDashboardAxisDate keeps dashboard x-axis labels compact", () => {
  assert.equal(formatDashboardAxisDate("2026-04-12"), "12/04");
});

test("buildDashboardTrendTickDates keeps first and last dates while reducing crowded labels", () => {
  const trends = Array.from({ length: 30 }, (_, index) => ({
    date: `2026-04-${String(index + 1).padStart(2, "0")}`,
    logins: index,
    logouts: index,
  }));

  const tickDates = buildDashboardTrendTickDates(trends, 6);

  assert.deepEqual(tickDates, [
    "2026-04-01",
    "2026-04-07",
    "2026-04-13",
    "2026-04-18",
    "2026-04-24",
    "2026-04-30",
  ]);
});

test("buildDashboardTrendTickDates returns every date when the range is already short", () => {
  const trends = [
    { date: "2026-04-10", logins: 2, logouts: 1 },
    { date: "2026-04-11", logins: 3, logouts: 2 },
    { date: "2026-04-12", logins: 4, logouts: 3 },
  ];

  assert.deepEqual(buildDashboardTrendTickDates(trends, 6), [
    "2026-04-10",
    "2026-04-11",
    "2026-04-12",
  ]);
});
