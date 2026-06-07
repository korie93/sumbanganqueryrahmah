import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDashboardActionQueueItems,
  buildDashboardRecentLoginActivityFilterCounts,
  buildDashboardAccessSignals,
  buildDashboardLoginHealthScore,
  buildDashboardLoginPatternSummary,
  buildDashboardLoginRiskExplanation,
  buildDashboardLoginRiskInsights,
  buildDashboardSessionHealthItems,
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

test("buildDashboardLoginHealthScore summarizes elevated login risk into one operator score", () => {
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
  const score = buildDashboardLoginHealthScore(insights);

  assert.equal(score.score, 44);
  assert.equal(score.label, "Attention");
  assert.equal(score.tone, "danger");
  assert.deepEqual(score.deductions, [
    "-32 Failed login pressure: 12",
    "-12 Active session load: 9 / 10",
    "-12 Login trend check: 10 latest day",
  ]);
});

test("buildDashboardLoginHealthScore keeps watch and healthy states easy to distinguish", () => {
  const watchInsights = buildDashboardLoginRiskInsights({
    recentLoginActivities: [],
    summary: {
      activeSessions: 2,
      bannedUsers: 0,
      loginsToday: 4,
      loginFailures24h: 2,
      totalDataRows: 100,
      totalImports: 4,
      totalUsers: 10,
    },
    trends: [
      { date: "2026-05-04", logins: 4, logouts: 1 },
      { date: "2026-05-05", logins: 4, logouts: 1 },
      { date: "2026-05-06", logins: 4, logouts: 1 },
    ],
  });
  const healthyInsights = buildDashboardLoginRiskInsights({
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

  const watchScore = buildDashboardLoginHealthScore(watchInsights);
  const healthyScore = buildDashboardLoginHealthScore(healthyInsights);

  assert.equal(watchScore.score, 88);
  assert.equal(watchScore.label, "Watch");
  assert.deepEqual(watchScore.deductions, ["-12 Failed login pressure: 2"]);
  assert.equal(healthyScore.score, 100);
  assert.equal(healthyScore.label, "Healthy");
  assert.deepEqual(healthyScore.deductions, []);
});

test("buildDashboardLoginRiskExplanation focuses operators on elevated signals first", () => {
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
  const summary = resolveDashboardLoginRiskSummary(insights);
  const explanation = buildDashboardLoginRiskExplanation({ insights, summary });

  assert.equal(explanation.headline, "Status Attention kerana sekurang-kurangnya satu signal login berada pada tahap bahaya.");
  assert.deepEqual(
    explanation.items.map((item) => item.title),
    ["Failed login pressure", "Active session load", "Login trend check"],
  );
  assert.match(explanation.footer, /sebelum sekat atau reset akaun/);
});

test("buildDashboardLoginRiskExplanation keeps calm states complete for routine review", () => {
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
  const summary = resolveDashboardLoginRiskSummary(insights);
  const explanation = buildDashboardLoginRiskExplanation({ insights, summary });

  assert.equal(explanation.headline, "Status Normal kerana signal login utama berada dalam julat operasi biasa.");
  assert.equal(explanation.items.length, insights.length);
  assert.match(explanation.footer, /pemantauan rutin/);
});

test("buildDashboardActionQueueItems prioritizes concrete login review actions", () => {
  const actions = buildDashboardActionQueueItems({
    recentLoginActivities: [
      {
        browser: "Chrome",
        ipAddress: "10.42.x.x",
        lastActivityTime: "2026-05-06T02:30:00Z",
        loginTime: "2026-05-06T02:00:00Z",
        logoutReason: "ACCOUNT_LOCKED",
        logoutTime: "2026-05-06T03:00:00Z",
        role: "admin",
        status: "ended",
        username: "locked.user",
      },
      {
        browser: "Edge",
        ipAddress: "10.43.x.x",
        lastActivityTime: "2026-05-06T04:30:00Z",
        loginTime: "2026-05-06T04:00:00Z",
        logoutReason: "FORCED_LOGOUT",
        logoutTime: "2026-05-06T05:00:00Z",
        role: "user",
        status: "ended",
        username: "forced.user",
      },
      {
        browser: "Firefox",
        ipAddress: "10.44.x.x",
        lastActivityTime: "2026-05-06T05:30:00Z",
        loginTime: "2026-05-06T05:00:00Z",
        logoutReason: "IDLE_TIMEOUT",
        logoutTime: "2026-05-06T06:00:00Z",
        role: "user",
        status: "ended",
        username: "timeout.one",
      },
      {
        browser: "Safari",
        ipAddress: "10.45.x.x",
        lastActivityTime: "2026-05-06T06:30:00Z",
        loginTime: "2026-05-06T06:00:00Z",
        logoutReason: "SESSION_EXPIRED",
        logoutTime: "2026-05-06T07:00:00Z",
        role: "user",
        status: "ended",
        username: "timeout.two",
      },
    ],
    summary: {
      activeSessions: 8,
      bannedUsers: 1,
      loginsToday: 12,
      loginFailures24h: 15,
      totalDataRows: 100,
      totalImports: 4,
      totalUsers: 10,
    },
    trends: [
      { date: "2026-05-04", logins: 2, logouts: 1 },
      { date: "2026-05-05", logins: 3, logouts: 1 },
      { date: "2026-05-06", logins: 12, logouts: 2 },
    ],
  });

  assert.deepEqual(actions.map((action) => action.id), [
    "failed-login-pressure",
    "restricted-account-review",
    "forced-session-review",
    "repeated-timeout-review",
  ]);
  assert.equal(actions[0]?.priority, "high");
  assert.equal(actions[0]?.targetHref, "/monitor?section=activity");
  assert.equal(actions[1]?.targetHref, "/monitor?section=audit");
});

test("buildDashboardActionQueueItems returns no work when login signals are calm", () => {
  const actions = buildDashboardActionQueueItems({
    recentLoginActivities: [],
    summary: {
      activeSessions: 0,
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

  assert.deepEqual(actions, []);
});

test("buildDashboardSessionHealthItems groups active freshness and timeout endings", () => {
  const nowMs = Date.parse("2026-05-06T07:00:00Z");
  const healthItems = buildDashboardSessionHealthItems(
    [
      {
        browser: "Chrome",
        ipAddress: "10.42.x.x",
        lastActivityTime: "2026-05-06T06:50:00Z",
        loginTime: "2026-05-06T06:00:00Z",
        logoutReason: null,
        logoutTime: null,
        role: "admin",
        status: "active",
        username: "fresh.user",
      },
      {
        browser: "Edge",
        ipAddress: "10.43.x.x",
        lastActivityTime: "2026-05-06T06:30:00Z",
        loginTime: "2026-05-06T05:40:00Z",
        logoutReason: null,
        logoutTime: null,
        role: "user",
        status: "active",
        username: "idle.user",
      },
      {
        browser: "Firefox",
        ipAddress: "10.44.x.x",
        lastActivityTime: "2026-05-06T05:30:00Z",
        loginTime: "2026-05-06T04:40:00Z",
        logoutReason: null,
        logoutTime: null,
        role: "user",
        status: "active",
        username: "stale.user",
      },
      {
        browser: "Safari",
        ipAddress: "10.45.x.x",
        lastActivityTime: null,
        loginTime: "2026-05-06T06:30:00Z",
        logoutReason: null,
        logoutTime: null,
        role: "user",
        status: "active",
        username: "unknown.user",
      },
      {
        browser: "Chrome",
        ipAddress: "10.46.x.x",
        lastActivityTime: "2026-05-06T04:45:00Z",
        loginTime: "2026-05-06T04:00:00Z",
        logoutReason: "IDLE_TIMEOUT",
        logoutTime: "2026-05-06T05:00:00Z",
        role: "user",
        status: "ended",
        username: "timeout.user",
      },
      {
        browser: "Chrome",
        ipAddress: "10.47.x.x",
        lastActivityTime: "2026-05-06T03:45:00Z",
        loginTime: "2026-05-06T03:00:00Z",
        logoutReason: "USER_LOGOUT",
        logoutTime: "2026-05-06T04:00:00Z",
        role: "user",
        status: "ended",
        username: "normal.user",
      },
    ],
    nowMs,
  );

  assert.equal(healthItems.find((item) => item.id === "active")?.value, 4);
  assert.equal(healthItems.find((item) => item.id === "fresh")?.value, 1);
  assert.equal(healthItems.find((item) => item.id === "idle-watch")?.value, 1);
  assert.equal(healthItems.find((item) => item.id === "stale")?.value, 2);
  assert.equal(healthItems.find((item) => item.id === "timeout-ended")?.value, 1);
  assert.equal(healthItems.find((item) => item.id === "idle-watch")?.tone, "warning");
  assert.equal(healthItems.find((item) => item.id === "stale")?.tone, "danger");
});

test("buildDashboardSessionHealthItems keeps an empty activity feed healthy", () => {
  const healthItems = buildDashboardSessionHealthItems([], Date.parse("2026-05-06T07:00:00Z"));

  assert.deepEqual(healthItems.map((item) => item.value), [0, 0, 0, 0, 0]);
  assert.equal(healthItems.find((item) => item.id === "active")?.tone, "success");
  assert.equal(healthItems.find((item) => item.id === "stale")?.tone, "success");
});

test("buildDashboardLoginPatternSummary highlights the strongest login patterns", () => {
  const pattern = buildDashboardLoginPatternSummary({
    peakHours: [
      { hour: 8, count: 2 },
      { hour: 9, count: 12 },
      { hour: 10, count: 5 },
    ],
    recentLoginActivities: [
      {
        browser: "Chrome",
        ipAddress: "10.42.x.x",
        lastActivityTime: "2026-05-06T06:50:00Z",
        loginTime: "2026-05-06T06:00:00Z",
        logoutReason: null,
        logoutTime: null,
        role: "admin",
        status: "active",
        username: "active.user",
      },
      {
        browser: "Chrome",
        ipAddress: "10.43.x.x",
        lastActivityTime: "2026-05-06T05:45:00Z",
        loginTime: "2026-05-06T05:00:00Z",
        logoutReason: "IDLE_TIMEOUT",
        logoutTime: "2026-05-06T06:00:00Z",
        role: "user",
        status: "ended",
        username: "timeout.one",
      },
      {
        browser: "Edge",
        ipAddress: "10.44.x.x",
        lastActivityTime: "2026-05-06T04:45:00Z",
        loginTime: "2026-05-06T04:00:00Z",
        logoutReason: "IDLE_TIMEOUT",
        logoutTime: "2026-05-06T05:00:00Z",
        role: "user",
        status: "ended",
        username: "timeout.two",
      },
      {
        browser: "Chrome",
        ipAddress: "10.45.x.x",
        lastActivityTime: "2026-05-06T03:45:00Z",
        loginTime: "2026-05-06T03:00:00Z",
        logoutReason: "ACCOUNT_LOCKED",
        logoutTime: "2026-05-06T04:00:00Z",
        role: "user",
        status: "ended",
        username: "locked.user",
      },
    ],
    summary: {
      activeSessions: 4,
      bannedUsers: 0,
      loginsToday: 15,
      loginFailures24h: 3,
      totalDataRows: 100,
      totalImports: 4,
      totalUsers: 10,
    },
    topUsers: [
      { lastLogin: "2026-05-06T02:00:00Z", loginCount: 4, role: "user", username: "beta" },
      { lastLogin: "2026-05-06T03:00:00Z", loginCount: 8, role: "admin", username: "alpha" },
    ],
  });

  assert.equal(pattern.statusLabel, "Attention");
  assert.equal(pattern.statusTone, "danger");
  assert.equal(pattern.facts.find((fact) => fact.id === "top-account")?.value, "alpha");
  assert.equal(pattern.facts.find((fact) => fact.id === "common-browser")?.value, "Chrome");
  assert.equal(pattern.facts.find((fact) => fact.id === "peak-window")?.value, "9 AM");
  assert.equal(pattern.facts.find((fact) => fact.id === "attention-reason")?.value, "Idle Timeout");
});

test("buildDashboardLoginPatternSummary stays calm when pattern data is not ready", () => {
  const pattern = buildDashboardLoginPatternSummary({
    peakHours: [],
    recentLoginActivities: [],
    summary: {
      activeSessions: 0,
      bannedUsers: 0,
      loginsToday: 0,
      loginFailures24h: 0,
      totalDataRows: 0,
      totalImports: 0,
      totalUsers: 0,
    },
    topUsers: [],
  });

  assert.equal(pattern.statusLabel, "Learning");
  assert.equal(pattern.statusTone, "info");
  assert.equal(pattern.facts.find((fact) => fact.id === "top-account")?.value, "Not enough data");
  assert.equal(pattern.facts.find((fact) => fact.id === "common-browser")?.value, "Not enough data");
  assert.equal(pattern.facts.find((fact) => fact.id === "attention-reason")?.value, "No flagged reason");
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
