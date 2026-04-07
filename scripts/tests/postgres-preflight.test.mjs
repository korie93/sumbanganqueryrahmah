import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPostgresConnection,
  buildPostgresPreflightConfig,
} from "../lib/postgres-preflight.mjs";

test("buildPostgresPreflightConfig normalizes PG env without exposing secrets", () => {
  assert.deepEqual(
    buildPostgresPreflightConfig({
      PG_DATABASE: " sqr_db ",
      PG_HOST: " db.local ",
      PG_PASSWORD: " secret ",
      PG_PORT: "6543",
      PG_USER: " postgres ",
    }),
    {
      database: "sqr_db",
      host: "db.local",
      password: "secret",
      port: 6543,
      user: "postgres",
    },
  );
});

test("assertPostgresConnection rejects missing required PG identity fields", async () => {
  await assert.rejects(
    assertPostgresConnection(
      {
        PG_DATABASE: "",
        PG_USER: "",
      },
      { context: "Release readiness" },
    ),
    /Release readiness requires PG_USER and PG_DATABASE/,
  );
});

test("assertPostgresConnection does not include PG_PASSWORD in failure messages", async () => {
  class FailingPool {
    async query() {
      throw new Error("password authentication failed");
    }

    async end() {}
  }

  await assert.rejects(
    assertPostgresConnection(
      {
        PG_DATABASE: "sqr_db",
        PG_HOST: "127.0.0.1",
        PG_PASSWORD: "super-secret-password",
        PG_PORT: "5432",
        PG_USER: "postgres",
      },
      {
        context: "Release readiness",
        PoolImpl: FailingPool,
      },
    ),
    (error) => {
      assert.match(error.message, /Release readiness requires PostgreSQL/);
      assert.match(error.message, /password authentication failed/);
      assert.doesNotMatch(error.message, /super-secret-password/);
      return true;
    },
  );
});
