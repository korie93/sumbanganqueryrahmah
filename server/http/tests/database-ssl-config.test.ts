import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

test("resolveDatabaseSslConfig preserves a configured root CA for verified TLS", () => {
  const ca = "-----BEGIN CERTIFICATE-----\nlocal-test-ca\n-----END CERTIFICATE-----";
  assert.deepEqual(buildPgSslPoolConfig(resolveDatabaseSslConfig("true", {
    ca,
    isProductionLike: true,
  })), {
    ssl: {
      ca,
      rejectUnauthorized: true,
    },
  });
});

test("resolveDatabaseSslConfig can read a root CA from DATABASE_SSL_CA_FILE", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-db-ca-"));
  const caPath = path.join(tempDir, "postgres-ca.pem");
  const ca = "-----BEGIN CERTIFICATE-----\nfile-test-ca\n-----END CERTIFICATE-----";

  try {
    await writeFile(caPath, ca, "utf8");
    assert.deepEqual(resolveDatabaseSslConfig("true", {
      caFile: caPath,
      isProductionLike: true,
    }), {
      ca,
      enabled: true,
      rejectUnauthorized: true,
    });
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});
