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
  SESSION_SECRET: "S".repeat(32),
  COLLECTION_NICKNAME_TEMP_PASSWORD: "ProdTempPass12345",
  COLLECTION_PII_ENCRYPTION_KEY: "C".repeat(32),
  TWO_FACTOR_ENCRYPTION_KEY: "T".repeat(32),
  PG_PASSWORD: "prod-db-password",
  BACKUP_ENCRYPTION_KEY: null,
  BACKUP_ENCRYPTION_KEYS: null,
  BACKUP_FEATURE_ENABLED: "1",
  SEED_DEFAULT_USERS: "0",
  LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
  MAIL_DEV_OUTBOX_ENABLED: "0",
};

const productionLikeDevelopmentBaseOverrides: Record<string, string | null> = {
  NODE_ENV: "development",
  HOST: "0.0.0.0",
  PUBLIC_APP_URL: "http://10.10.10.10:5000",
  SESSION_SECRET: "S".repeat(32),
  COLLECTION_NICKNAME_TEMP_PASSWORD: "ProdLikeTempPass12345",
  COLLECTION_PII_ENCRYPTION_KEY: "C".repeat(32),
  TWO_FACTOR_ENCRYPTION_KEY: "T".repeat(32),
  PG_PASSWORD: "prod-like-db-password",
  BACKUP_ENCRYPTION_KEY: "A".repeat(32),
  BACKUP_ENCRYPTION_KEYS: null,
  BACKUP_FEATURE_ENABLED: "1",
  SEED_DEFAULT_USERS: "0",
  LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
  MAIL_DEV_OUTBOX_ENABLED: "0",
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

test("runtime config rejects production startup when the session secret is too short", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      SESSION_SECRET: "short-session-secret",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /SESSION_SECRET must be at least 32 characters long/i,
      );
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
    },
  );
});

test("runtime config forces DB query profiling off in production unless the explicit override is present", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      DB_QUERY_PROFILING_ENABLED: "1",
      DB_QUERY_PROFILING_SAMPLE_PERCENT: "75",
      DB_QUERY_PROFILING_MIN_QUERY_COUNT: "9",
      DB_QUERY_PROFILING_MIN_TOTAL_QUERY_MS: "55",
      DB_QUERY_PROFILING_REPEATED_STATEMENT_THRESHOLD: "4",
      DB_QUERY_PROFILING_MAX_LOGGED_STATEMENTS: "6",
      DB_QUERY_PROFILING_MAX_UNIQUE_STATEMENTS: "150",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.runtime.dbQueryProfiling.enabled, false);
      assert.equal(runtimeModule.runtimeConfig.runtime.dbQueryProfiling.samplePercent, 75);
      assert.equal(runtimeModule.runtimeConfig.runtime.dbQueryProfiling.minQueryCount, 9);
      assert.equal(runtimeModule.runtimeConfig.runtime.dbQueryProfiling.minTotalQueryMs, 55);
      assert.equal(runtimeModule.runtimeConfig.runtime.dbQueryProfiling.repeatedStatementThreshold, 4);
      assert.equal(runtimeModule.runtimeConfig.runtime.dbQueryProfiling.maxLoggedStatements, 6);
      assert.equal(runtimeModule.runtimeConfig.runtime.dbQueryProfiling.maxUniqueStatements, 150);
      assert.equal(
        runtimeModule.runtimeConfigValidation.warnings.some(
          (warning: { code: string }) => warning.code === "db-query-profiling-production-forced-off",
        ),
        true,
      );
    },
  );
});

test("runtime config allows temporary DB query profiling in production only when the explicit override is present", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      DB_QUERY_PROFILING_ENABLED: "1",
      DB_QUERY_PROFILING_ALLOW_IN_PRODUCTION: "1",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.runtime.dbQueryProfiling.enabled, true);
      assert.equal(
        runtimeModule.runtimeConfigValidation.warnings.some(
          (warning: { code: string }) => warning.code === "db-query-profiling-production-forced-off",
        ),
        false,
      );
      assert.equal(
        runtimeModule.runtimeConfigValidation.warnings.some(
          (warning: { code: string }) => warning.code === "db-query-profiling-production-explicitly-enabled",
        ),
        true,
      );
    },
  );
});

test("runtime config keeps DB query profiling opt-in outside production", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      DB_QUERY_PROFILING_ENABLED: "1",
      DB_QUERY_PROFILING_SAMPLE_PERCENT: "60",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.runtime.dbQueryProfiling.enabled, true);
      assert.equal(runtimeModule.runtimeConfig.runtime.dbQueryProfiling.samplePercent, 60);
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

test("runtime config allows explicit operations debug route enablement for controlled troubleshooting", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      OPERATIONS_DEBUG_ROUTES_ENABLED: "1",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.app.operationsDebugRoutesEnabled, false);
    },
  );
});

test("runtime config enables operations debug routes outside production-like environments when explicitly allowed", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      OPERATIONS_DEBUG_ROUTES_ENABLED: "1",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.app.operationsDebugRoutesEnabled, true);
    },
  );
});

test("runtime config keeps operations debug routes disabled by default in development", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      OPERATIONS_DEBUG_ROUTES_ENABLED: null,
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.app.operationsDebugRoutesEnabled, false);
    },
  );
});

test("runtime config reads explicit PostgreSQL query timeout settings", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PG_QUERY_TIMEOUT_MS: "61000",
      PG_STATEMENT_TIMEOUT_MS: "47000",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.database.queryTimeoutMs, 61_000);
      assert.equal(runtimeModule.runtimeConfig.database.statementTimeoutMs, 47_000);
    },
  );
});

test("runtime config reads explicit global HTTP request timeout settings", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      HTTP_REQUEST_TIMEOUT_MS: "42000",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.runtime.requestTimeoutMs, 42_000);
    },
  );
});

test("runtime config reads explicit pool monitor and backup restore safety settings", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PG_POOL_ALERT_WAITING_COUNT: "4",
      PG_POOL_ALERT_UTILIZATION_PERCENT: "95",
      PG_POOL_HEALTH_CHECK_INTERVAL_MS: "75000",
      PG_POOL_HEALTH_CHECK_TIMEOUT_MS: "3200",
      BACKUP_RESTORE_SLOW_TRANSACTION_MS: "18000",
      BACKUP_RESTORE_MAX_TRACKED_COLLECTION_RECORD_IDS: "345678",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.runtime.pgPoolAlertWaitingCount, 4);
      assert.equal(runtimeModule.runtimeConfig.runtime.pgPoolAlertUtilizationPercent, 95);
      assert.equal(runtimeModule.runtimeConfig.runtime.pgPoolHealthCheckIntervalMs, 75_000);
      assert.equal(runtimeModule.runtimeConfig.runtime.pgPoolHealthCheckTimeoutMs, 3_200);
      assert.equal(runtimeModule.runtimeConfig.runtime.backupRestoreSlowTransactionMs, 18_000);
      assert.equal(runtimeModule.runtimeConfig.runtime.backupRestoreMaxTrackedCollectionRecordIds, 345_678);
    },
  );
});

test("runtime config reads explicit client error telemetry enablement", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      CLIENT_ERROR_TELEMETRY_ENABLED: "1",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.observability.clientErrorTelemetryEnabled, true);
    },
  );
});

test("runtime config reads explicit remote error tracking settings", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      REMOTE_ERROR_TRACKING_ENABLED: "1",
      REMOTE_ERROR_TRACKING_ENDPOINT: "https://errors.example.com/ingest",
      REMOTE_ERROR_TRACKING_TIMEOUT_MS: "4500",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.observability.remoteErrorTracking.enabled, true);
      assert.equal(
        runtimeModule.runtimeConfig.observability.remoteErrorTracking.endpoint,
        "https://errors.example.com/ingest",
      );
      assert.equal(runtimeModule.runtimeConfig.observability.remoteErrorTracking.timeoutMs, 4_500);
    },
  );
});

test("runtime config rejects remote error tracking enablement without an endpoint", async () => {
  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      REMOTE_ERROR_TRACKING_ENABLED: "1",
      REMOTE_ERROR_TRACKING_ENDPOINT: null,
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /REMOTE_ERROR_TRACKING_ENDPOINT is required when REMOTE_ERROR_TRACKING_ENABLED=1/i,
      );
    },
  );
});

test("runtime config warns when production-like remote error tracking uses plaintext transport", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      REMOTE_ERROR_TRACKING_ENABLED: "1",
      REMOTE_ERROR_TRACKING_ENDPOINT: "http://errors.example.com/ingest",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.match(
        runtimeModule.runtimeConfigValidation.warnings.map((warning: { code: string }) => warning.code).join(","),
        /REMOTE_ERROR_TRACKING_HTTPS_RECOMMENDED/,
      );
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
      assert.equal(runtimeModule.runtimeConfig.database.password, "");
      assert.equal(runtimeModule.runtimeConfig.database.maxConnections >= 10, true);
      assert.equal(runtimeModule.runtimeConfigValidation.warningCount > 0, true);
    },
  );
});

test("runtime config accepts DATABASE_URL-only database configuration in strict local development", async () => {
  const databaseUrl = [
    "postgres",
    "://db_user:db_pass@db.internal:6544/sqr_runtime",
  ].join("");

  await withEnv(
    {
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PUBLIC_APP_URL: "http://127.0.0.1:5000",
      DATABASE_URL: databaseUrl,
      PG_HOST: null,
      PG_PORT: null,
      PG_USER: null,
      PG_PASSWORD: null,
      PG_DATABASE: null,
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
      assert.equal(runtimeModule.runtimeConfig.database.connectionString, databaseUrl);
      assert.equal(runtimeModule.runtimeConfig.database.host, "db.internal");
      assert.equal(runtimeModule.runtimeConfig.database.port, 6544);
      assert.equal(runtimeModule.runtimeConfig.database.user, "db_user");
      assert.equal(runtimeModule.runtimeConfig.database.password, "db_pass");
      assert.equal(runtimeModule.runtimeConfig.database.database, "sqr_runtime");
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

test("runtime config rejects OLLAMA_HOST values that do not use http or https", async () => {
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
      OLLAMA_HOST: "ftp://127.0.0.1:11434",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /OLLAMA_HOST must use http:\/\/ or https:\/\//i,
      );
    },
  );
});

test("runtime config rejects remote OLLAMA_HOST values on production-like hosts unless explicitly allowed", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      OLLAMA_HOST: "https://ollama.internal.example.com:11434",
      OLLAMA_ALLOW_REMOTE_HOST: null,
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /OLLAMA_HOST must stay on a loopback host outside local development unless OLLAMA_ALLOW_REMOTE_HOST=1 is set explicitly/i,
      );
    },
  );
});

test("runtime config allows remote OLLAMA_HOST values on production-like hosts only with an explicit override", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      OLLAMA_HOST: "https://ollama.internal.example.com:11434",
      OLLAMA_ALLOW_REMOTE_HOST: "1",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.ai.host, "https://ollama.internal.example.com:11434");
      assert.match(
        runtimeModule.runtimeConfigValidation.warnings.map((warning: { code: string }) => warning.code).join(","),
        /OLLAMA_REMOTE_HOST_EXPLICITLY_ALLOWED/,
      );
    },
  );
});

test("runtime config reads an explicit per-instance WebSocket connection limit override", async () => {
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
      RUNTIME_WS_MAX_CONNECTIONS_PER_INSTANCE: "345",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.runtime.wsMaxConnectionsPerInstance, 345);
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

test("runtime config warns when production-like https deployments leave TRUSTED_PROXIES empty", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      TRUSTED_PROXIES: null,
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.match(
        runtimeModule.runtimeConfigValidation.warnings.map((warning: { code: string }) => warning.code).join(","),
        /TRUSTED_PROXIES_REVIEW_RECOMMENDED/,
      );
    },
  );
});

test("runtime config rejects SESSION_SECRET_PREVIOUS entries that duplicate the active secret", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      PUBLIC_APP_URL: "https://sqr.example.com",
      SESSION_SECRET_PREVIOUS: "S".repeat(32),
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
      SESSION_SECRET_PREVIOUS: `${"O".repeat(32)},${"P".repeat(32)}`,
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.deepEqual(runtimeModule.runtimeConfig.auth.previousSessionSecrets, [
        "O".repeat(32),
        "P".repeat(32),
      ]);
    },
  );
});
