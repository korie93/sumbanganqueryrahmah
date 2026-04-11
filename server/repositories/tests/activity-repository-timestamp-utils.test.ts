import assert from "node:assert/strict";
import test from "node:test";
import type { InsertUserActivity, UserActivity } from "../../../shared/schema-postgres";
import {
  buildCreateActivityValues,
  buildUpdateActivityValues,
  createCurrentTimestampSql,
  shouldUseDatabaseCurrentTimestamp,
} from "../activity-repository-timestamp-utils";

function isCurrentTimestampSql(value: unknown) {
  const chunks = (value as { queryChunks?: Array<{ value?: string[] }> })?.queryChunks;
  return Array.isArray(chunks) && chunks.some((chunk) => chunk?.value?.includes("CURRENT_TIMESTAMP"));
}

function createActivityInsert(overrides: Partial<InsertUserActivity> = {}): InsertUserActivity {
  return {
    userId: "user-1",
    username: "superuser",
    role: "superuser",
    pcName: "PC-1",
    browser: "Chrome",
    fingerprint: "fp-1",
    ipAddress: "127.0.0.1",
    ...overrides,
  };
}

function createActivityRecord(overrides: Partial<UserActivity> = {}): UserActivity {
  return {
    id: "activity-1",
    userId: "user-1",
    username: "superuser",
    role: "superuser",
    pcName: "PC-1",
    browser: "Chrome",
    fingerprint: "fp-1",
    ipAddress: "127.0.0.1",
    loginTime: new Date("2026-04-10T12:00:00.000Z"),
    logoutTime: null,
    lastActivityTime: new Date("2026-04-10T12:00:00.000Z"),
    isActive: true,
    logoutReason: null,
    ...overrides,
  } as UserActivity;
}

test("createCurrentTimestampSql builds a reusable CURRENT_TIMESTAMP expression", () => {
  assert.equal(isCurrentTimestampSql(createCurrentTimestampSql()), true);
});

test("shouldUseDatabaseCurrentTimestamp only opts into near-now timestamps", () => {
  const referenceNowMs = Date.parse("2026-04-10T15:55:00.000Z");

  assert.equal(
    shouldUseDatabaseCurrentTimestamp(new Date("2026-04-10T15:55:10.000Z"), referenceNowMs),
    true,
  );
  assert.equal(
    shouldUseDatabaseCurrentTimestamp(new Date("2026-04-10T15:53:00.000Z"), referenceNowMs),
    false,
  );
  assert.equal(
    shouldUseDatabaseCurrentTimestamp("2026-04-10T15:55:20.000Z", referenceNowMs),
    true,
  );
});

test("buildCreateActivityValues delegates login and heartbeat timestamps to PostgreSQL", () => {
  const values = buildCreateActivityValues(createActivityInsert(), "activity-123");

  assert.equal(values.id, "activity-123");
  assert.equal(values.userId, "user-1");
  assert.equal(values.username, "superuser");
  assert.equal(values.role, "superuser");
  assert.equal(values.logoutTime, null);
  assert.equal(values.isActive, true);
  assert.equal(values.logoutReason, null);
  assert.equal(isCurrentTimestampSql(values.loginTime), true);
  assert.equal(isCurrentTimestampSql(values.lastActivityTime), true);
});

test("buildUpdateActivityValues uses PostgreSQL current time for near-now activity writes", () => {
  const referenceNowMs = Date.parse("2026-04-10T15:55:00.000Z");
  const values = buildUpdateActivityValues(
    createActivityRecord({
      isActive: false,
      logoutReason: "USER_LOGOUT",
      logoutTime: new Date("2026-04-10T15:55:01.000Z"),
      lastActivityTime: new Date("2026-04-10T15:55:02.000Z"),
    }),
    referenceNowMs,
  );

  assert.equal(values.isActive, false);
  assert.equal(values.logoutReason, "USER_LOGOUT");
  assert.equal(isCurrentTimestampSql(values.logoutTime), true);
  assert.equal(isCurrentTimestampSql(values.lastActivityTime), true);
});

test("buildUpdateActivityValues preserves explicit historical timestamps and null clears", () => {
  const historicalLogout = new Date("2026-04-10T10:00:00.000Z");
  const historicalLastActivity = new Date("2026-04-10T10:05:00.000Z");
  const values = buildUpdateActivityValues(
    createActivityRecord({
      isActive: false,
      logoutTime: historicalLogout,
      lastActivityTime: historicalLastActivity,
      logoutReason: null,
    }),
    Date.parse("2026-04-10T15:55:00.000Z"),
  );
  const clearedValues = buildUpdateActivityValues({
    logoutTime: null,
    lastActivityTime: null,
  } as Partial<UserActivity>);

  assert.equal(values.logoutTime, historicalLogout);
  assert.equal(values.lastActivityTime, historicalLastActivity);
  assert.equal(values.logoutReason, null);
  assert.equal(clearedValues.logoutTime, null);
  assert.equal(clearedValues.lastActivityTime, null);
});
