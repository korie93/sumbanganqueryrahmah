import assert from "node:assert/strict";
import test from "node:test";
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
};

const productionLikeDevelopmentBaseOverrides: Record<string, string | null> = {
  NODE_ENV: "development",
  HOST: "0.0.0.0",
  PUBLIC_APP_URL: "http://10.10.10.10:5000",
  SESSION_SECRET: PROD_LIKE_SESSION_SECRET,
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
};

test("runtime config rejects production startup when backup encryption keys are missing", async () => {
  await withEnv(
    productionBaseOverrides,
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEYS is required when backups are enabled outside strict local development/i,
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
        /COLLECTION_PII_ENCRYPTION_KEY is required outside strict local development/i,
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
        /TWO_FACTOR_ENCRYPTION_KEY is required outside strict local development/i,
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
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.app.nodeEnv, "production");
      assert.equal(runtimeModule.runtimeConfig.auth.seedDefaultUsers, false);
      assert.equal(runtimeModule.runtimeConfig.app.debugLogs, false);
      assert.equal(runtimeModule.runtimeConfig.ai.debugLogs, false);
      assert.deepEqual(runtimeModule.runtimeConfig.database.ssl, {
        enabled: true,
        rejectUnauthorized: true,
      });
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

test("runtime config defaults database bootstrap to migration on production-like hosts", async () => {
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
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.bootstrap.databaseMode, "runtime");
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

test("runtime config rejects production startup when multi-worker mode still uses process-local rate limiting and replay state", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      SQR_MAX_WORKERS: "2",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /SQR_MAX_WORKERS greater than 1 is not allowed outside strict local development/i,
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

test("runtime config keeps strict local development bootable when multi-worker mode is enabled for local verification", async () => {
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
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.cluster.maxWorkers, 2);
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
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.websocket.maxConnections, 64);
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
