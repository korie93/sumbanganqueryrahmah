import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPostgresMigrationAdvisoryLockQueries,
  withPostgresMigrationAdvisoryLock,
} from "../lib/postgres-migration-lock.mjs";

function createFakePool() {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
    },
    release() {
      calls.push({ release: true });
    },
  };

  return {
    calls,
    pool: {
      async connect() {
        calls.push({ connect: true });
        return client;
      },
    },
  };
}

test("postgres migration lock uses advisory lock and unlock statements", () => {
  const queries = buildPostgresMigrationAdvisoryLockQueries();

  assert.match(queries.lock, /pg_advisory_lock/);
  assert.match(queries.unlock, /pg_advisory_unlock/);
  assert.equal(queries.values.length, 2);
});

test("withPostgresMigrationAdvisoryLock releases the lock after successful migrations", async () => {
  const fake = createFakePool();
  const result = await withPostgresMigrationAdvisoryLock(
    fake.pool,
    async () => "migrated",
    { log: () => undefined },
  );

  assert.equal(result, "migrated");
  assert.deepEqual(fake.calls.map((call) => call.sql || Object.keys(call)[0]), [
    "connect",
    "SELECT pg_advisory_lock($1, $2)",
    "SELECT pg_advisory_unlock($1, $2)",
    "release",
  ]);
});

test("withPostgresMigrationAdvisoryLock releases the client when migration fails", async () => {
  const fake = createFakePool();

  await assert.rejects(
    () =>
      withPostgresMigrationAdvisoryLock(
        fake.pool,
        async () => {
          throw new Error("migration failed");
        },
        { log: () => undefined },
      ),
    /migration failed/,
  );

  assert.deepEqual(fake.calls.map((call) => call.sql || Object.keys(call)[0]), [
    "connect",
    "SELECT pg_advisory_lock($1, $2)",
    "SELECT pg_advisory_unlock($1, $2)",
    "release",
  ]);
});
