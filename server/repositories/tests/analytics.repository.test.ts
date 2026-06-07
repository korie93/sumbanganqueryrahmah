import assert from "node:assert/strict";
import test from "node:test";
import { dbRead } from "../../db-postgres";
import { AnalyticsRepository, serializeAnalyticsTimestamp } from "../analytics.repository";
import {
  maskAnalyticsIpAddress,
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
  assert.equal(summarizeAnalyticsBrowser("Mozilla/5.0 Chrome/124.0 Safari/537.36"), "Chrome");
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
        browser: "Firefox",
        id: "activity-1",
        ipAddress: "192.168.x.x",
        lastActivityTime: "2026-04-05T03:20:00.000Z",
        loginTime: "2026-04-05T03:15:00.000Z",
        logoutReason: null,
        logoutTime: null,
        role: "superuser",
        status: "active",
        username: "super.user",
      },
    ]);
  } finally {
    (dbRead as unknown as {
      execute: typeof dbRead.execute;
    }).execute = originalExecute;
  }
});
