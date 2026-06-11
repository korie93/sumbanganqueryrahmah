import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const runtimeModuleUrl = pathToFileURL(
  path.resolve(process.cwd(), "server", "config", "runtime.ts"),
).href;

function importRuntimeFresh() {
  return import(`${runtimeModuleUrl}?t=${Date.now()}-${Math.random()}`);
}

const PROD_SESSION_SECRET = "prod-session-secret-minimum-32-characters-001";
const PROD_LIKE_SESSION_SECRET = "prod-like-session-secret-minimum-32-characters-001";
const PROD_PREVIOUS_SESSION_SECRET = "prod-previous-session-secret-minimum-32-characters-001";
const PROD_OLDER_SESSION_SECRET = "prod-older-session-secret-minimum-32-characters-001";

async function withEnv<T>(
  overrides: Record<string, string | null>,
  fn: () => Promise<T>,
): Promise<T> {
  const previousValues = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previousValues.set(key, process.env[key]);
    if (value === null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, previousValue] of previousValues.entries()) {
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  }
}

const productionBaseOverrides: Record<string, string | null> = {
  NODE_ENV: "production",
  SESSION_SECRET: PROD_SESSION_SECRET,
  SQR_AUDIT_HMAC_KEY: "prod-audit-hmac-key-minimum-32-characters-001",
  SESSION_JWT_PRIVATE_KEY: "test-private-key-present-for-runtime-preflight",
  SESSION_JWT_PUBLIC_KEY: "test-public-key-present-for-runtime-preflight",
  COLLECTION_NICKNAME_TEMP_PASSWORD: "ProdTempPass12345",
  COLLECTION_PII_ENCRYPTION_KEY: "C".repeat(32),
  TWO_FACTOR_ENCRYPTION_KEY: "T".repeat(32),
  PGHOST: null,
  PGPORT: null,
  PGUSER: null,
  PG_PASSWORD: "prod-db-password",
  PGPASSWORD: null,
  PGDATABASE: null,
  BACKUP_ENCRYPTION_KEY: null,
  BACKUP_ENCRYPTION_KEYS: null,
  BACKUP_FEATURE_ENABLED: "1",
  SEED_DEFAULT_USERS: "0",
  LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
  MAIL_DEV_OUTBOX_ENABLED: "0",
  SQR_ALLOW_RUNTIME_DB_BOOTSTRAP_IN_PRODUCTION: null,
  SQR_RATE_LIMIT_STORE: "redis",
  SQR_REDIS_RATE_LIMIT_URL: "rediss://redis.internal:6380/0",
  SQR_WS_SHARED_BUS: null,
  SQR_REDIS_WS_URL: null,
  COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED: "1",
  COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND: "clamdscan",
  COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON: "[\"--fdpass\",\"--no-summary\",\"--infected\",\"{file}\"]",
  COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED: "1",
};

const productionLikeDevelopmentBaseOverrides: Record<string, string | null> = {
  NODE_ENV: "development",
  HOST: "0.0.0.0",
  PUBLIC_APP_URL: "http://10.10.10.10:5000",
  SESSION_SECRET: PROD_LIKE_SESSION_SECRET,
  SQR_AUDIT_HMAC_KEY: "prod-like-audit-hmac-key-minimum-32-characters-001",
  COLLECTION_NICKNAME_TEMP_PASSWORD: "ProdLikeTempPass12345",
  COLLECTION_PII_ENCRYPTION_KEY: "C".repeat(32),
  TWO_FACTOR_ENCRYPTION_KEY: "T".repeat(32),
  PGHOST: null,
  PGPORT: null,
  PGUSER: null,
  PG_PASSWORD: "prod-like-db-password",
  PGPASSWORD: null,
  PGDATABASE: null,
  BACKUP_ENCRYPTION_KEY: "A".repeat(32),
  BACKUP_ENCRYPTION_KEYS: null,
  BACKUP_FEATURE_ENABLED: "1",
  SEED_DEFAULT_USERS: "0",
  LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
  MAIL_DEV_OUTBOX_ENABLED: "0",
  SQR_ALLOW_RUNTIME_DB_BOOTSTRAP_IN_PRODUCTION: null,
  SQR_RATE_LIMIT_STORE: "redis",
  SQR_REDIS_RATE_LIMIT_URL: "rediss://redis.internal:6380/0",
  SQR_WS_SHARED_BUS: null,
  SQR_REDIS_WS_URL: null,
  COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED: "1",
  COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND: "clamdscan",
  COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON: "[\"--fdpass\",\"--no-summary\",\"--infected\",\"{file}\"]",
  COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED: "1",
};

test("runtime config does not persist seed passwords in the global config object", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SEED_DEFAULT_USERS: "1",
      SEED_SUPERUSER_PASSWORD: "local-superuser-seed-password",
      SEED_ADMIN_PASSWORD: "local-admin-seed-password",
      SEED_USER_PASSWORD: "local-user-seed-password",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.bootstrap.users.superuser.password, "");
      assert.equal(runtimeModule.runtimeConfig.bootstrap.users.admin.password, "");
      assert.equal(runtimeModule.runtimeConfig.bootstrap.users.user.password, "");
      assert.equal(runtimeModule.runtimeConfig.bootstrap.freshLocalSuperuser.password, "");
    },
  );
});

test("runtime config rejects production startup when backup encryption keys are missing", async () => {
  await withEnv(
    productionBaseOverrides,
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /FATAL: Missing required production environment variables:[\s\S]*BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEYS/i,
      );
    },
  );
});

test("runtime config rejects production startup without an explicit audit HMAC key", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      SQR_AUDIT_HMAC_KEY: null,
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /SQR_AUDIT_HMAC_KEY is required on production-like hosts/i,
      );
    },
  );
});

test("runtime config rejects production audit HMAC key reuse of the session secret", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      SQR_AUDIT_HMAC_KEY: PROD_SESSION_SECRET,
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /SQR_AUDIT_HMAC_KEY must be distinct from SESSION_SECRET/i,
      );
    },
  );
});

test("runtime config rejects production startup when backup encryption key material is weak", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      BACKUP_ENCRYPTION_KEY: "short-backup-key",
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEYS must be a unique random secret of at least 32 characters/i,
      );
    },
  );
});

test("runtime config rejects production startup without backup keys even when backups are disabled", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "0",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEYS/i,
      );
    },
  );
});

test("runtime config rejects production startup with a complete missing-env list", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      SESSION_JWT_PRIVATE_KEY: null,
      SESSION_JWT_PUBLIC_KEY: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      TWO_FACTOR_ENCRYPTION_KEY: null,
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /FATAL: Missing required production environment variables:[\s\S]*SESSION_JWT_PRIVATE_KEY[\s\S]*SESSION_JWT_PUBLIC_KEY[\s\S]*BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEYS[\s\S]*COLLECTION_PII_ENCRYPTION_KEY[\s\S]*TWO_FACTOR_ENCRYPTION_KEY/i,
      );
    },
  );
});

test("runtime config rejects production startup when collection PII encryption key is missing", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /FATAL: Missing required production environment variables:[\s\S]*COLLECTION_PII_ENCRYPTION_KEY/i,
      );
    },
  );
});

test("runtime config rejects production startup when the two-factor encryption key is missing", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      TWO_FACTOR_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /FATAL: Missing required production environment variables:[\s\S]*TWO_FACTOR_ENCRYPTION_KEY/i,
      );
    },
  );
});

test("runtime config rejects production startup when previous collection PII keys include the active key", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      COLLECTION_PII_ENCRYPTION_KEY: "C".repeat(32),
      COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS: "C".repeat(32),
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS must not include the active COLLECTION_PII_ENCRYPTION_KEY value/i,
      );
    },
  );
});

test("runtime config accepts production startup when previous collection PII keys are configured for compatibility", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      COLLECTION_PII_ENCRYPTION_KEY: "C".repeat(32),
      COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS: "D".repeat(32),
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.app.nodeEnv, "production");
    },
  );
});

test("runtime config accepts production startup when previous two-factor keys are configured for compatibility", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      TWO_FACTOR_ENCRYPTION_KEY: "T".repeat(32),
      TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS: "U".repeat(32),
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.app.nodeEnv, "production");
    },
  );
});

test("runtime config accepts production startup when required hardening env vars are configured", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      BACKUP_FEATURE_ENABLED: "1",
      DEBUG_LOGS: "1",
      AI_DEBUG: "1",
      LOG_LEVEL: "debug",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.app.nodeEnv, "production");
      assert.equal(runtimeModule.runtimeConfig.auth.seedDefaultUsers, false);
      assert.equal(runtimeModule.runtimeConfig.app.debugLogs, false);
      assert.equal(runtimeModule.runtimeConfig.ai.debugLogs, false);
      assert.equal(runtimeModule.runtimeConfig.ai.debugEnabled, false);
      assert.equal(runtimeModule.runtimeConfig.app.logLevel, "info");
      assert.deepEqual(runtimeModule.runtimeConfig.database.ssl, {
        enabled: true,
        rejectUnauthorized: true,
      });
    },
  );
});

test("runtime config preserves explicit debug logging only in strict local development", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      DEBUG_LOGS: "1",
      AI_DEBUG: "1",
      LOG_LEVEL: "debug",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.app.debugLogs, true);
      assert.equal(runtimeModule.runtimeConfig.ai.debugLogs, true);
      assert.equal(runtimeModule.runtimeConfig.ai.debugEnabled, true);
      assert.equal(runtimeModule.runtimeConfig.app.logLevel, "debug");
    },
  );
});

test("runtime config rejects production-like startup when database SSL is explicitly disabled", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      DATABASE_SSL: "false",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /DATABASE_SSL=false is not allowed on production-like hosts/i,
      );
    },
  );
});

test("runtime config disables operations debug routes by default on production-like hosts", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      OPERATIONS_DEBUG_ROUTES_ENABLED: null,
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.app.operationsDebugRoutesEnabled, false);
    },
  );
});

test("runtime config keeps operations debug routes disabled by default in local development", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
      OPERATIONS_DEBUG_ROUTES_ENABLED: null,
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.app.operationsDebugRoutesEnabled, false);
    },
  );
});

test("runtime config rejects operations debug route enablement on production-like hosts", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      OPERATIONS_DEBUG_ROUTES_ENABLED: "1",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /OPERATIONS_DEBUG_ROUTES_ENABLED is not allowed on production-like hosts/i,
      );
    },
  );
});

test("runtime config defaults database bootstrap to migration on production-like hosts", async (t) => {
  const localBase = {
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PUBLIC_APP_URL: "http://127.0.0.1:5000",
    SESSION_SECRET: null,
    COLLECTION_NICKNAME_TEMP_PASSWORD: null,
    COLLECTION_PII_ENCRYPTION_KEY: null,
    PG_PASSWORD: null,
    BACKUP_ENCRYPTION_KEY: null,
    BACKUP_ENCRYPTION_KEYS: null,
    BACKUP_FEATURE_ENABLED: "1",
    SEED_DEFAULT_USERS: "0",
    LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
    MAIL_DEV_OUTBOX_ENABLED: "0",
    SQR_ALLOW_RUNTIME_DB_BOOTSTRAP_IN_PRODUCTION: null,
  };

  await withEnv(
    {
      ...localBase,
      SQR_DB_BOOTSTRAP_MODE: null,
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.bootstrap.databaseMode, "runtime");
    },
  );

  await withEnv(
    {
      ...localBase,
      SQR_DB_BOOTSTRAP_MODE: "migration",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.bootstrap.databaseMode, "migration");
    },
  );

  await withEnv(
    {
      ...productionLikeDevelopmentBaseOverrides,
      SQR_DB_BOOTSTRAP_MODE: null,
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.bootstrap.databaseMode, "migration");
    },
  );

  await withEnv(
    {
      ...productionLikeDevelopmentBaseOverrides,
      SQR_DB_BOOTSTRAP_MODE: "migration",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.bootstrap.databaseMode, "migration");
    },
  );

  await withEnv(
    {
      ...productionLikeDevelopmentBaseOverrides,
      SQR_DB_BOOTSTRAP_MODE: "runtime",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /SQR_DB_BOOTSTRAP_MODE=runtime is not allowed on production-like hosts/i,
      );
    },
  );

  await withEnv(
    {
      ...productionLikeDevelopmentBaseOverrides,
      SQR_DB_BOOTSTRAP_MODE: "runtime",
      SQR_ALLOW_RUNTIME_DB_BOOTSTRAP_IN_PRODUCTION: "1",
    },
    async () => {
      const securityWarnings: string[] = [];
      const consoleErrorMock = t.mock.method(console, "error", (message?: unknown) => {
        securityWarnings.push(String(message));
      });
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.bootstrap.databaseMode, "runtime");
      assert.match(
        runtimeModule.runtimeConfigValidation.warnings
          .map((warning: { code: string }) => warning.code)
          .join(","),
        /DANGEROUS_RUNTIME_DB_BOOTSTRAP_ACTIVE/,
      );
      assert.equal(consoleErrorMock.mock.callCount(), 1);
      assert.match(securityWarnings.join("\n"), /Runtime DB bootstrap escape hatch is ACTIVE/);
    },
  );
});


test("runtime config allows operations debug route enablement in strict local development", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      PGHOST: null,
      PGPORT: null,
      PGUSER: null,
      PG_PASSWORD: null,
      PGPASSWORD: null,
      PGDATABASE: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
      OPERATIONS_DEBUG_ROUTES_ENABLED: "1",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.app.operationsDebugRoutesEnabled, true);
    },
  );
});

test("runtime config rejects production startup when rate limiting still uses process-local memory", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      SQR_MAX_WORKERS: "1",
      SQR_RATE_LIMIT_STORE: "memory",
      SQR_REDIS_RATE_LIMIT_URL: null,
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /AUDIT2-FIX \[M1\].*SQR_RATE_LIMIT_STORE=redis with SQR_REDIS_RATE_LIMIT_URL is required outside strict local development/i,
      );
    },
  );
});

test("runtime config rejects production startup when Redis URLs do not use TLS", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      BACKUP_FEATURE_ENABLED: "0",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      SQR_REDIS_RATE_LIMIT_URL: "redis://redis.internal:6379/0",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /Redis URLs must use rediss:\/\/ on production-like hosts/i,
      );
    },
  );
});

test("runtime config rejects production startup when receipt malware scanning is disabled", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED: "0",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED=1 is required on production-like hosts/i,
      );
    },
  );
});

test("runtime config rejects production startup when receipt malware scanner is fail-open", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED: "0",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED=1 is required on production-like hosts/i,
      );
    },
  );
});

test("runtime config rejects production startup when receipt malware scanner args omit the file placeholder", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON: "[\"--fdpass\",\"--no-summary\"]",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON must include a \{file\} or \{filename\} placeholder/i,
      );
    },
  );
});

test("runtime config rejects production multi-worker with redis replay but no WebSocket shared bus", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      SQR_MAX_WORKERS: "2",
      SQR_RATE_LIMIT_STORE: "redis",
      SQR_REDIS_RATE_LIMIT_URL: "rediss://redis.internal:6380/0",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /WebSocket fan-out is process-local/i,
      );
    },
  );
});

test("runtime config accepts production multi-worker when Redis shared runtime state is configured", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      SQR_MAX_WORKERS: "2",
      SQR_RATE_LIMIT_STORE: "redis",
      SQR_REDIS_RATE_LIMIT_URL: "rediss://redis.internal:6380/0",
      SQR_WS_SHARED_BUS: "redis",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.cluster.maxWorkers, 2);
      assert.equal(runtimeModule.runtimeConfig.rateLimiting.store.provider, "redis");
      assert.equal(runtimeModule.runtimeConfig.websocket.sharedBus.provider, "redis");
    },
  );
});

test("runtime config rejects strict local multi-worker mode without Redis rate-limit state", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
      SQR_MAX_WORKERS: "2",
      SQR_RATE_LIMIT_STORE: "memory",
      SQR_REDIS_RATE_LIMIT_URL: null,
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /SQR_MAX_WORKERS > 1 requires SQR_RATE_LIMIT_STORE=redis/i,
      );
    },
  );
});

test("runtime config accepts strict local multi-worker mode with Redis rate-limit state", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
      SQR_MAX_WORKERS: "2",
      SQR_RATE_LIMIT_STORE: "redis",
      SQR_REDIS_RATE_LIMIT_URL: "redis://127.0.0.1:6379/0",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.cluster.maxWorkers, 2);
      assert.equal(runtimeModule.runtimeConfig.rateLimiting.store.provider, "redis");
      assert.equal(runtimeModule.runtimeConfig.app.isStrictLocalDevelopment, true);
    },
  );
});

test("runtime config rejects production startup when default user seeding is enabled", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      BACKUP_FEATURE_ENABLED: "1",
      SEED_DEFAULT_USERS: "1",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /SEED_DEFAULT_USERS is only allowed in strict local development mode/i,
      );
    },
  );
});

test("runtime config rejects production-like development startup when session secret is missing", async () => {
  await withEnv(
    {
      ...productionLikeDevelopmentBaseOverrides,
      SESSION_SECRET: null,
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /SESSION_SECRET is required outside strict local development/i,
      );
    },
  );
});

test("runtime config rejects short configured session secrets outside test mode", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      "import('./server/config/runtime.ts').then(() => process.exit(0)).catch((error) => { console.error(error.message); process.exit(1); })",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "development",
        HOST: "127.0.0.1",
        PUBLIC_APP_URL: "http://127.0.0.1:5000",
        SESSION_SECRET: "short-secret",
        COLLECTION_NICKNAME_TEMP_PASSWORD: "",
        COLLECTION_PII_ENCRYPTION_KEY: "",
        TWO_FACTOR_ENCRYPTION_KEY: "",
        PG_PASSWORD: "",
        BACKUP_ENCRYPTION_KEY: "",
        BACKUP_ENCRYPTION_KEYS: "",
        BACKUP_FEATURE_ENABLED: "1",
        SEED_DEFAULT_USERS: "0",
        LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
        MAIL_DEV_OUTBOX_ENABLED: "0",
      },
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /SESSION_SECRET must be at least 32 bytes in non-test runtime environments/i,
  );
});

test("runtime config still generates a strong local session secret when none is configured", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      TWO_FACTOR_ENCRYPTION_KEY: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(Buffer.byteLength(runtimeModule.runtimeConfig.auth.sessionSecret, "utf8") >= 32, true);
    },
  );
});

test("runtime config rejects development startup when dev outbox is enabled outside strict local mode", async () => {
  await withEnv(
    {
      ...productionLikeDevelopmentBaseOverrides,
      MAIL_DEV_OUTBOX_ENABLED: "1",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /MAIL_DEV_OUTBOX_ENABLED is only allowed in strict local development mode/i,
      );
    },
  );
});

test("runtime config rejects non-local startup when SMTP env vars are partially configured", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "mailer@example.com",
      SMTP_PASSWORD: null,
      MAIL_FROM: "noreply@example.com",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /SMTP mail configuration is incomplete/i,
      );
    },
  );
});

test("runtime config normalizes missing PG_PASSWORD to an empty string in strict local development", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
      PG_MAX_CONNECTIONS: null,
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.app.isStrictLocalDevelopment, true);
      assert.equal(runtimeModule.runtimeConfig.database.host, "127.0.0.1");
      assert.equal(runtimeModule.runtimeConfig.database.password, "");
      assert.deepEqual(runtimeModule.runtimeConfig.database.ssl, {
        enabled: false,
        rejectUnauthorized: true,
      });
      assert.equal(runtimeModule.runtimeConfig.database.maxConnections >= 10, true);
      assert.equal(runtimeModule.runtimeConfigValidation.warningCount > 0, true);
    },
  );
});

test("runtime config accepts DATABASE_URL-only database configuration in strict local development", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      DATABASE_URL: "postgres://db_user:db_pass@db.internal:6544/sqr_runtime",
      PG_HOST: null,
      PGHOST: null,
      PG_PORT: null,
      PGPORT: null,
      PG_USER: null,
      PGUSER: null,
      PG_PASSWORD: null,
      PGPASSWORD: null,
      PG_DATABASE: null,
      PGDATABASE: null,
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
      PG_MAX_CONNECTIONS: null,
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.database.connectionString, "postgres://db_user:db_pass@db.internal:6544/sqr_runtime");
      assert.equal(runtimeModule.runtimeConfig.database.host, "db.internal");
      assert.equal(runtimeModule.runtimeConfig.database.port, 6544);
      assert.equal(runtimeModule.runtimeConfig.database.user, "db_user");
      assert.equal(runtimeModule.runtimeConfig.database.password, "db_pass");
      assert.equal(runtimeModule.runtimeConfig.database.database, "sqr_runtime");
    },
  );
});

test("runtime config rejects DATABASE_URL values that omit the username", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      DATABASE_URL: "postgres://db.internal:6544/sqr_runtime",
      PG_HOST: null,
      PGHOST: null,
      PG_PORT: null,
      PGPORT: null,
      PG_USER: null,
      PGUSER: null,
      PG_PASSWORD: null,
      PGPASSWORD: null,
      PG_DATABASE: null,
      PGDATABASE: null,
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /DATABASE_URL must include a PostgreSQL username/i,
      );
    },
  );
});

test("runtime config rejects URL-shaped PG_HOST values before creating the pool", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      DATABASE_URL: null,
      PG_HOST: "postgres://db.internal:5432",
      PG_USER: "postgres",
      PG_PASSWORD: null,
      PG_DATABASE: "sqr_db",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /PG_HOST must be a hostname, IP address, or Unix socket path, not a connection URL/i,
      );
    },
  );
});

test("runtime config rejects production DATABASE_URL without an embedded password", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      DATABASE_URL: "postgres://db_user@db.internal:6544/sqr_prod",
      PG_PASSWORD: "fallback-password-is-ignored-by-connection-string",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /DATABASE_URL must include a password on production-like hosts/i,
      );
    },
  );
});

test("runtime config accepts standard PostgreSQL env aliases", async () => {
  await withEnv(
    {
      ...productionLikeDevelopmentBaseOverrides,
      DATABASE_URL: null,
      PG_HOST: null,
      PGHOST: "db.alias.internal",
      PG_PORT: null,
      PGPORT: "6545",
      PG_USER: null,
      PGUSER: "sqr_alias",
      PG_PASSWORD: null,
      PGPASSWORD: "alias-db-password",
      PG_DATABASE: null,
      PGDATABASE: "sqr_alias_db",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();

      assert.equal(runtimeModule.runtimeConfig.database.host, "db.alias.internal");
      assert.equal(runtimeModule.runtimeConfig.database.port, 6545);
      assert.equal(runtimeModule.runtimeConfig.database.user, "sqr_alias");
      assert.equal(runtimeModule.runtimeConfig.database.password, "alias-db-password");
      assert.equal(runtimeModule.runtimeConfig.database.database, "sqr_alias_db");
    },
  );
});

test("runtime config defaults PostgreSQL statement timeout to 30 seconds", async () => {
  await withEnv(
    {
      ...productionLikeDevelopmentBaseOverrides,
      PG_STATEMENT_TIMEOUT_MS: null,
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();

      assert.equal(runtimeModule.runtimeConfig.database.statementTimeoutMs, 30_000);
    },
  );
});

test("runtime config accepts an explicit PostgreSQL statement timeout override", async () => {
  await withEnv(
    {
      ...productionLikeDevelopmentBaseOverrides,
      PG_STATEMENT_TIMEOUT_MS: "120000",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();

      assert.equal(runtimeModule.runtimeConfig.database.statementTimeoutMs, 120_000);
    },
  );
});

test("runtime config rejects session timeout values above the supported maximum", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      DEFAULT_SESSION_TIMEOUT_MINUTES: "1441",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /DEFAULT_SESSION_TIMEOUT_MINUTES.*at most 1440/i,
      );
    },
  );
});

test("runtime config accepts an explicit backup payload size override", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      BACKUP_MAX_PAYLOAD_BYTES: "16777216",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
      PG_MAX_CONNECTIONS: null,
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.runtime.backupMaxPayloadBytes, 16_777_216);
    },
  );
});

test("runtime config accepts an explicit per-user import upload quota override", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      IMPORT_PER_USER_ACTIVE_UPLOAD_BYTES: "2097152",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.runtime.importPerUserActiveUploadBytes, 2_097_152);
    },
  );
});

test("runtime config accepts IMPORT_MAX_FILE_SIZE_MB as the import upload limit", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      IMPORT_BODY_LIMIT: "5mb",
      IMPORT_MAX_FILE_SIZE_MB: "50",
      IMPORT_PER_USER_ACTIVE_UPLOAD_BYTES: null,
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.app.bodyLimits.imports, "50mb");
      assert.equal(runtimeModule.runtimeConfig.runtime.importPerUserActiveUploadBytes, 50 * 1024 * 1024);
    },
  );
});

test("runtime config accepts bounded import parser structure limits", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      IMPORT_MAX_COLUMNS: "240",
      IMPORT_MAX_SHEETS: "12",
      IMPORT_MAX_CELL_LENGTH: "4096",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.runtime.importMaxColumns, 240);
      assert.equal(runtimeModule.runtimeConfig.runtime.importMaxSheets, 12);
      assert.equal(runtimeModule.runtimeConfig.runtime.importMaxCellLength, 4096);
    },
  );
});

test("runtime config keeps strict local development bootable when SMTP env vars are incomplete", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "mailer@example.com",
      SMTP_PASSWORD: null,
      MAIL_FROM: "noreply@example.com",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.app.isStrictLocalDevelopment, true);
      assert.match(
        runtimeModule.runtimeConfigValidation.warnings.map((warning: { code: string }) => warning.code).join(","),
        /MAIL_CONFIGURATION_INCOMPLETE/,
      );
    },
  );
});

test("runtime config rejects invalid PUBLIC_APP_URL values with a clear startup error", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "not-a-url",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /PUBLIC_APP_URL must be a valid absolute http:\/\/ or https:\/\/ URL/i,
      );
    },
  );
});

test("runtime config rejects invalid CORS_ALLOWED_ORIGINS entries with paths", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      CORS_ALLOWED_ORIGINS: "https://sqr.example.com/app",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /CORS_ALLOWED_ORIGINS entries must be bare origins without paths/i,
      );
    },
  );
});

test("runtime config rejects wildcard CORS_ALLOWED_ORIGINS entries", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      CORS_ALLOWED_ORIGINS: "*",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /CORS_ALLOWED_ORIGINS entries must be explicit http:\/\/ or https:\/\/ origins and cannot use wildcards/i,
      );
    },
  );
});

test("runtime config rejects invalid AUTH_COOKIE_SECURE flags", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      AUTH_COOKIE_SECURE: "sometimes",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /AUTH_COOKIE_SECURE must be one of: auto, true, false, 1, or 0/i,
      );
    },
  );
});

test("runtime config forces secure auth cookies on production-like hosts even when AUTH_COOKIE_SECURE=false", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      AUTH_COOKIE_SECURE: "false",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.auth.cookieSecure, true);
      assert.match(
        runtimeModule.runtimeConfigValidation.warnings.map((warning: { code: string }) => warning.code).join(","),
        /AUTH_COOKIE_SECURE_FORCED_ON_PRODUCTION/,
      );
    },
  );
});

test("runtime config accepts an explicit graceful shutdown timeout override", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      GRACEFUL_SHUTDOWN_TIMEOUT_MS: "12000",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.runtime.gracefulShutdownTimeoutMs, 12_000);
    },
  );
});

test("runtime config accepts an explicit event listener limit override", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SQR_MAX_EVENT_LISTENERS: "96",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.runtime.maxEventListeners, 96);
    },
  );
});

test("runtime config accepts an explicit Redis health check interval", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SQR_REDIS_HEALTH_CHECK_INTERVAL_MS: "15000",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.runtime.redisHealthCheckIntervalMs, 15_000);
    },
  );
});

test("runtime config accepts explicit per-user rate-limit tuning", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SQR_RATE_LIMIT_USER_READS_PER_MINUTE: "600",
      SQR_RATE_LIMIT_USER_WRITES_PER_MINUTE: "120",
      SQR_RATE_LIMIT_USER_UPLOADS_PER_MINUTE: "12",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.deepEqual(runtimeModule.runtimeConfig.rateLimiting.userLimitsPerMinute, {
        reads: 600,
        uploads: 12,
        writes: 120,
      });
    },
  );
});

test("runtime config accepts an explicit WebSocket global connection cap", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SQR_WS_MAX_CONNECTIONS: "64",
      SQR_WS_MAX_MESSAGE_BYTES: "65536",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.websocket.maxConnections, 64);
      assert.equal(runtimeModule.runtimeConfig.websocket.maxMessageBytes, 65_536);
    },
  );
});

test("runtime config defaults auth cookies to SameSite=strict", async () => {
  await withEnv(
    {
      ...productionLikeDevelopmentBaseOverrides,
      SESSION_COOKIE_SAMESITE: null,
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.auth.cookieSameSite, "strict");
    },
  );
});

test("runtime config accepts an explicit SESSION_COOKIE_SAMESITE=lax override", async () => {
  await withEnv(
    {
      ...productionLikeDevelopmentBaseOverrides,
      SESSION_COOKIE_SAMESITE: "lax",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.auth.cookieSameSite, "lax");
    },
  );
});

test("runtime config rejects malformed numeric env values before fallback clamping", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      PG_MAX_CONNECTIONS: "many",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /PG_MAX_CONNECTIONS.*must be an integer/i,
      );
    },
  );
});

test("runtime config rejects malformed boolean env values before fallback handling", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      BACKUP_FEATURE_ENABLED: "maybe",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: null,
      COLLECTION_PII_ENCRYPTION_KEY: null,
      PG_PASSWORD: null,
      BACKUP_ENCRYPTION_KEY: null,
      BACKUP_ENCRYPTION_KEYS: null,
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /BACKUP_FEATURE_ENABLED.*boolean flag/i,
      );
    },
  );
});

test("runtime config exposes explicit trusted proxies when configured", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      TRUSTED_PROXIES: "loopback,10.0.0.0/8",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.deepEqual(runtimeModule.runtimeConfig.app.trustedProxies, ["loopback", "10.0.0.0/8"]);
    },
  );
});

test("runtime config rejects unsafe TRUSTED_PROXIES wildcard-style values", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      TRUSTED_PROXIES: "*",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /TRUSTED_PROXIES must list explicit proxy ranges or names/i,
      );
    },
  );
});

test("runtime config rejects SESSION_SECRET_PREVIOUS entries that duplicate the active secret", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      SESSION_SECRET_PREVIOUS: PROD_SESSION_SECRET,
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /SESSION_SECRET_PREVIOUS must not include the active SESSION_SECRET value/i,
      );
    },
  );
});

test("runtime config keeps previous session secrets for manual rotation verification", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      SESSION_SECRET_PREVIOUS: `${PROD_PREVIOUS_SESSION_SECRET},${PROD_OLDER_SESSION_SECRET}`,
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.deepEqual(runtimeModule.runtimeConfig.auth.previousSessionSecrets, [
        PROD_PREVIOUS_SESSION_SECRET,
        PROD_OLDER_SESSION_SECRET,
      ]);
    },
  );
});
