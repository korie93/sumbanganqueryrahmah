import assert from "node:assert/strict";
import test from "node:test";
import { dbRead } from "../../db-postgres";
import { AnalyticsRepository, serializeAnalyticsTimestamp } from "../analytics.repository";
import {
  maskAnalyticsIpAddress,
  resolveAnalyticsIpAddress,
  sanitizeAnalyticsShortText,
  summarizeAnalyticsBrowser,
} from "../analytics-repository-shared";

test("serializeAnalyticsTimestamp normalizes valid timestamps and rejects invalid ones", () => {
  assert.equal(
    serializeAnalyticsTimestamp(new Date("2026-04-05T03:15:00.000Z")),
    "2026-04-05T03:15:00.000Z",
  );
  assert.equal(
    serializeAnalyticsTimestamp("2026-04-05T03:15:00.000Z"),
    "2026-04-05T03:15:00.000Z",
  );
  assert.equal(serializeAnalyticsTimestamp("not-a-real-date"), null);
  assert.equal(serializeAnalyticsTimestamp(null), null);
});

test("AnalyticsRepository.getTopActiveUsers returns normalized last login timestamps", async () => {
  const repository = new AnalyticsRepository();
  const originalExecute = dbRead.execute;

  (dbRead as unknown as {
    execute: typeof dbRead.execute;
  }).execute = (async () => ({
    rows: [
      {
        username: "super.user",
        role: "superuser",
        loginCount: 9,
        lastLogin: new Date("2026-04-05T03:15:00.000Z"),
      },
    ],
  })) as unknown as typeof dbRead.execute;

  try {
    const result = await repository.getTopActiveUsers(10);
    assert.deepEqual(result, [
      {
        username: "super.user",
        role: "superuser",
        loginCount: 9,
        lastLogin: "2026-04-05T03:15:00.000Z",
      },
    ]);
  } finally {
    (dbRead as unknown as {
      execute: typeof dbRead.execute;
    }).execute = originalExecute;
  }
});

test("analytics activity sanitizers mask network details and browser labels", () => {
  assert.equal(maskAnalyticsIpAddress("10.42.7.9"), "10.42.x.x");
  assert.equal(maskAnalyticsIpAddress("2001:db8::1"), "2001:db8:...");
  assert.equal(maskAnalyticsIpAddress("not an ip"), "Unknown");
  assert.equal(resolveAnalyticsIpAddress("10.42.7.9", true), "10.42.7.9");
  assert.equal(resolveAnalyticsIpAddress("10.42.7.9", false), "10.42.x.x");
  assert.equal(resolveAnalyticsIpAddress("10.42.x.x", true), "10.42.x.x");
  assert.equal(summarizeAnalyticsBrowser("Mozilla/5.0 Chrome/124.0 Safari/537.36"), "Chrome 124");
  assert.equal(summarizeAnalyticsBrowser("Known Browser"), "Known Browser");
  assert.equal(sanitizeAnalyticsShortText("manual logout\r\nSet-Cookie: evil"), "manual logout Set-Cookie: evil");
});

test("AnalyticsRepository.getRecentLoginActivity returns sanitized recent access rows", async () => {
  const repository = new AnalyticsRepository();
  const originalExecute = dbRead.execute;

  (dbRead as unknown as {
    execute: typeof dbRead.execute;
  }).execute = (async () => ({
    rows: [
      {
        browser: "Mozilla/5.0 Firefox/126.0",
        id: "activity-1",
        ipAddress: "192.168.10.25",
        isActive: true,
        lastActivityTime: new Date("2026-04-05T03:20:00.000Z"),
        loginTime: new Date("2026-04-05T03:15:00.000Z"),
        logoutReason: null,
        logoutTime: null,
        role: "superuser",
        username: "super.user",
      },
    ],
  })) as unknown as typeof dbRead.execute;

  try {
    const result = await repository.getRecentLoginActivity(8);
    assert.deepEqual(result, [
      {
        browser: "Firefox 126",
        eventType: "success",
        failureReason: null,
        id: "activity-1",
        ipAddress: "192.168.x.x",
        lastActivityTime: "2026-04-05T03:20:00.000Z",
        loginTime: "2026-04-05T03:15:00.000Z",
        logoutReason: null,
        logoutTime: null,
        platform: null,
        role: "superuser",
        status: "active",
        userAgentSummary: null,
        username: "super.user",
      },
    ]);
  } finally {
    (dbRead as unknown as {
      execute: typeof dbRead.execute;
    }).execute = originalExecute;
  }
});

test("AnalyticsRepository.getRecentLoginActivityPage returns bounded page metadata and sanitized rows", async () => {
  const repository = new AnalyticsRepository();
  const originalExecute = dbRead.execute;
  let executeCallCount = 0;

  (dbRead as unknown as {
    execute: typeof dbRead.execute;
  }).execute = (async () => {
    executeCallCount += 1;
    if (executeCallCount === 1) {
      return {
        rows: [{
          activeCount: 2,
          allCount: 7,
          attentionCount: 1,
          endedCount: 5,
        }],
      };
    }
    return {
      rows: [{
        browser: "Mozilla/5.0 Edg/125.0",
        id: "activity-page-1",
        ipAddress: "10.42.7.9",
        isActive: false,
        lastActivityTime: new Date("2026-05-05T03:20:00.000Z"),
        loginTime: new Date("2026-05-05T03:15:00.000Z"),
        logoutReason: "IDLE_TIMEOUT",
        logoutTime: new Date("2026-05-05T03:25:00.000Z"),
        role: "admin",
        username: "watch.user",
      }],
    };
  }) as unknown as typeof dbRead.execute;

  try {
    const result = await repository.getRecentLoginActivityPage({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      page: 9,
      pageSize: 4,
      search: "watch%_user",
      includeExactIpAddress: true,
      sortBy: "eventTime",
      sortOrder: "desc",
      status: "ended",
    });

    assert.equal(executeCallCount, 2);
    assert.deepEqual(result, {
      activities: [{
        browser: "Edge 125",
        eventType: "success",
        failureReason: null,
        id: "activity-page-1",
        ipAddress: "10.42.7.9",
        lastActivityTime: "2026-05-05T03:20:00.000Z",
        loginTime: "2026-05-05T03:15:00.000Z",
        logoutReason: "IDLE_TIMEOUT",
        logoutTime: "2026-05-05T03:25:00.000Z",
        platform: null,
        role: "admin",
        status: "ended",
        userAgentSummary: null,
        username: "watch.user",
      }],
      filterCounts: { active: 2, all: 7, attention: 1, ended: 5, failed: 0 },
      pagination: {
        page: 2,
        pageSize: 4,
        totalItems: 5,
        totalPages: 2,
      },
    });
  } finally {
    (dbRead as unknown as {
      execute: typeof dbRead.execute;
    }).execute = originalExecute;
  }
});

test("AnalyticsRepository.getRecentLoginActivityPage maps failed attempts and redacts internal reasons", async () => {
  const repository = new AnalyticsRepository();
  const originalExecute = dbRead.execute;
  let executeCallCount = 0;

  (dbRead as unknown as {
    execute: typeof dbRead.execute;
  }).execute = (async () => {
    executeCallCount += 1;
    if (executeCallCount % 2 === 1) {
      return {
        rows: [{
          activeCount: 0,
          allCount: 1,
          attentionCount: 1,
          endedCount: 0,
          failedCount: 1,
        }],
      };
    }
    return {
      rows: [{
        browser: "Chrome 149",
        eventType: "failure",
        failureReason: "invalid_password",
        id: "audit:failure-1",
        ipAddress: "203.0.113.42",
        isActive: false,
        lastActivityTime: null,
        loginTime: new Date("2026-06-11T06:10:00.000Z"),
        logoutReason: null,
        logoutTime: null,
        platform: "Windows 10/11",
        role: "manager",
        status: "failed",
        userAgentSummary: "Chrome 149 on Windows 10/11",
        username: "manager.user",
      }],
    };
  }) as unknown as typeof dbRead.execute;

  const baseOptions = {
    page: 1,
    pageSize: 4,
    sortBy: "eventTime" as const,
    sortOrder: "desc" as const,
    status: "failed" as const,
  };

  try {
    const managerResult = await repository.getRecentLoginActivityPage({
      ...baseOptions,
      includeExactIpAddress: false,
      includeInternalReason: false,
    });
    const superuserResult = await repository.getRecentLoginActivityPage({
      ...baseOptions,
      includeExactIpAddress: true,
      includeInternalReason: true,
    });

    assert.equal(managerResult.activities[0]?.status, "failed");
    assert.equal(managerResult.activities[0]?.failureReason, null);
    assert.equal(managerResult.activities[0]?.ipAddress, "203.0.x.x");
    assert.equal(managerResult.activities[0]?.platform, "Windows 10/11");
    assert.equal(
      managerResult.activities[0]?.userAgentSummary,
      "Chrome 149 on Windows 10/11",
    );
    assert.equal(superuserResult.activities[0]?.failureReason, "invalid_password");
    assert.equal(superuserResult.activities[0]?.ipAddress, "203.0.113.42");
    assert.equal(superuserResult.filterCounts.failed, 1);
    assert.equal(superuserResult.filterCounts.attention, 1);
  } finally {
    (dbRead as unknown as {
      execute: typeof dbRead.execute;
    }).execute = originalExecute;
  }
});
