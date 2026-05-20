import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPostgresConnection,
  buildPostgresPoolConfig,
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
      connectionString: null,
      database: "sqr_db",
      host: "db.local",
      password: "secret",
      port: 6543,
      user: "postgres",
    },
  );
});

test("buildPostgresPreflightConfig falls back to DATABASE_URL when PG identity fields are omitted", () => {
  assert.deepEqual(
    buildPostgresPreflightConfig({
      DATABASE_URL: "postgres://db_user:db_pass@db.internal:6544/sqr_prod",
    }),
    {
      connectionString: "postgres://db_user:db_pass@db.internal:6544/sqr_prod",
      database: "sqr_prod",
      host: "db.internal",
      password: "db_pass",
      port: 6544,
      user: "db_user",
    },
  );
});

test("buildPostgresPreflightConfig accepts standard PostgreSQL env aliases", () => {
  assert.deepEqual(
    buildPostgresPreflightConfig({
      PGDATABASE: " sqr_alias_db ",
      PGHOST: " db.alias.local ",
      PGPASSWORD: " alias-secret ",
      PGPORT: "6545",
      PGUSER: " sqr_alias ",
    }),
    {
      connectionString: null,
      database: "sqr_alias_db",
      host: "db.alias.local",
      password: "alias-secret",
      port: 6545,
      user: "sqr_alias",
    },
  );
});

test("buildPostgresPoolConfig carries SSL and search_path into script connections", () => {
  const poolConfig = buildPostgresPoolConfig(
    {
      DATABASE_URL: "postgres://db_user:db_pass@db.internal:6544/sqr_prod",
      DATABASE_SSL: "1",
      DATABASE_SSL_CA: "-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----",
      PG_SEARCH_PATH: "public",
    },
    {
      connectionTimeoutMillis: 2_500,
      max: 2,
    },
  );

  assert.deepEqual(poolConfig, {
    connectionString: "postgres://db_user:db_pass@db.internal:6544/sqr_prod",
    connectionTimeoutMillis: 2_500,
    max: 2,
    options: "-c search_path=public",
    ssl: {
      ca: "-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----",
      rejectUnauthorized: true,
    },
  });
});

test("buildPostgresPoolConfig rejects unsafe search_path input", () => {
  assert.throws(
    () => buildPostgresPoolConfig({
      PG_DATABASE: "sqr_db",
      PG_SEARCH_PATH: "public;drop schema public",
      PG_USER: "postgres",
    }),
    /PG_SEARCH_PATH must be a comma-separated list/i,
  );
});

test("buildPostgresPoolConfig defaults to SSL on production-like script runs", () => {
  const poolConfig = buildPostgresPoolConfig({
    NODE_ENV: "production",
    PG_DATABASE: "sqr_db",
    PG_HOST: "db.internal",
    PG_USER: "sqr_user",
  });

  assert.deepEqual(poolConfig.ssl, { rejectUnauthorized: true });
});

test("buildPostgresPoolConfig rejects explicit SSL disablement on production-like script runs", () => {
  assert.throws(
    () => buildPostgresPoolConfig({
      DATABASE_SSL: "0",
      NODE_ENV: "production",
      PG_DATABASE: "sqr_db",
      PG_HOST: "db.internal",
      PG_USER: "sqr_user",
    }),
    /DATABASE_SSL=false is not allowed on production-like hosts/i,
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
    /Release readiness requires PG_USER and PG_DATABASE to be set, or a DATABASE_URL/,
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
      assert.match(error.message, /DATABASE_URL or PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, and PG_DATABASE/);
      assert.doesNotMatch(error.message, /super-secret-password/);
      return true;
    },
  );
});
