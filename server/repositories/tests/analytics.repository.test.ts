import assert from "node:assert/strict";
import test from "node:test";
import { dbRead } from "../../db-postgres";
import { AnalyticsRepository, serializeAnalyticsTimestamp } from "../analytics.repository";

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
