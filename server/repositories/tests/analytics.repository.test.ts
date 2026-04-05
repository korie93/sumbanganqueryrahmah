import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../../db-postgres";
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
  const originalExecute = db.execute;

  (db as unknown as {
    execute: typeof db.execute;
  }).execute = (async () => ({
    rows: [
      {
        username: "super.user",
        role: "superuser",
        loginCount: 9,
        lastLogin: new Date("2026-04-05T03:15:00.000Z"),
      },
    ],
  })) as unknown as typeof db.execute;

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
    (db as unknown as {
      execute: typeof db.execute;
    }).execute = originalExecute;
  }
});
