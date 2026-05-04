import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPgSslPoolConfig,
  resolveDatabaseSslConfig,
} from "../../config/database-ssl";

test("resolveDatabaseSslConfig defaults to verified TLS on production-like hosts", () => {
  assert.deepEqual(resolveDatabaseSslConfig(null, { isProductionLike: true }), {
    enabled: true,
    rejectUnauthorized: true,
  });
  assert.deepEqual(buildPgSslPoolConfig(resolveDatabaseSslConfig("true", { isProductionLike: false })), {
    ssl: { rejectUnauthorized: true },
  });
});

test("resolveDatabaseSslConfig keeps local development passwordless Postgres bootable without TLS", () => {
  assert.deepEqual(resolveDatabaseSslConfig(null, { isProductionLike: false }), {
    enabled: false,
    rejectUnauthorized: true,
  });
  assert.deepEqual(buildPgSslPoolConfig(resolveDatabaseSslConfig("0", { isProductionLike: false })), {});
});

test("resolveDatabaseSslConfig rejects explicit TLS disablement on production-like hosts", () => {
  assert.throws(
    () => resolveDatabaseSslConfig("false", { isProductionLike: true }),
    /DATABASE_SSL=false is not allowed on production-like hosts/i,
  );
});
