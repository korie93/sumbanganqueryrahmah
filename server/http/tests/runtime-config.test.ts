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
  SESSION_SECRET: "prod-session-secret",
  COLLECTION_NICKNAME_TEMP_PASSWORD: "ProdTempPass12345",
  PG_PASSWORD: "prod-db-password",
  BACKUP_ENCRYPTION_KEY: null,
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

test("runtime config accepts production startup when required hardening env vars are configured", async () => {
  await withEnv(
    {
      ...productionBaseOverrides,
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      BACKUP_FEATURE_ENABLED: "1",
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.app.nodeEnv, "production");
      assert.equal(runtimeModule.runtimeConfig.auth.seedDefaultUsers, false);
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
      NODE_ENV: "development",
      HOST: "0.0.0.0",
      PUBLIC_APP_URL: "http://10.10.10.10:5000",
      SESSION_SECRET: null,
      COLLECTION_NICKNAME_TEMP_PASSWORD: "ProdLikeTempPass12345",
      PG_PASSWORD: "prod-like-db-password",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
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
      NODE_ENV: "development",
      HOST: "0.0.0.0",
      PUBLIC_APP_URL: "http://10.10.10.10:5000",
      SESSION_SECRET: "prod-like-session-secret",
      COLLECTION_NICKNAME_TEMP_PASSWORD: "ProdLikeTempPass12345",
      PG_PASSWORD: "prod-like-db-password",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
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
    },
    async () => {
      const runtimeModule = await importRuntimeFresh();
      assert.equal(runtimeModule.runtimeConfig.app.isStrictLocalDevelopment, true);
      assert.equal(runtimeModule.runtimeConfig.database.password, "");
      assert.equal(runtimeModule.runtimeConfigValidation.warningCount > 0, true);
    },
  );
});

test("runtime config rejects invalid PUBLIC_APP_URL values with a clear startup error", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      PUBLIC_APP_URL: "not-a-url",
      SESSION_SECRET: "prod-session-secret",
      COLLECTION_NICKNAME_TEMP_PASSWORD: "ProdTempPass12345",
      PG_PASSWORD: "prod-db-password",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
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
      NODE_ENV: "production",
      PUBLIC_APP_URL: "https://sqr.example.com",
      CORS_ALLOWED_ORIGINS: "https://sqr.example.com/app",
      SESSION_SECRET: "prod-session-secret",
      COLLECTION_NICKNAME_TEMP_PASSWORD: "ProdTempPass12345",
      PG_PASSWORD: "prod-db-password",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
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
      NODE_ENV: "production",
      PUBLIC_APP_URL: "https://sqr.example.com",
      AUTH_COOKIE_SECURE: "sometimes",
      SESSION_SECRET: "prod-session-secret",
      COLLECTION_NICKNAME_TEMP_PASSWORD: "ProdTempPass12345",
      PG_PASSWORD: "prod-db-password",
      BACKUP_ENCRYPTION_KEY: "A".repeat(32),
      BACKUP_ENCRYPTION_KEYS: null,
      BACKUP_FEATURE_ENABLED: "1",
      SEED_DEFAULT_USERS: "0",
      LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0",
      MAIL_DEV_OUTBOX_ENABLED: "0",
    },
    async () => {
      await assert.rejects(
        importRuntimeFresh(),
        /AUTH_COOKIE_SECURE must be one of: auto, true, false, 1, or 0/i,
      );
    },
  );
});
