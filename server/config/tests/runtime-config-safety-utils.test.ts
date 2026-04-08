import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoPlaceholderSecrets,
  assertRuntimeSafetyGuards,
  buildRuntimeConfigWarnings,
  resolveCookieSecure,
  resolveCorsAllowedOrigins,
  resolvePreviousCollectionPiiSecrets,
  resolveTrustedProxies,
} from "../runtime-config-safety-utils";

test("resolveCookieSecure respects explicit and auto values", () => {
  assert.equal(
    resolveCookieSecure("true", { isProduction: false, publicAppUrl: "http://localhost:5000" }),
    true,
  );
  assert.equal(
    resolveCookieSecure(null, { isProduction: false, publicAppUrl: "https://sqr.example.com" }),
    true,
  );
  assert.equal(
    resolveCookieSecure("0", { isProduction: true, publicAppUrl: "https://sqr.example.com" }),
    false,
  );
});

test("resolveCorsAllowedOrigins dedupes entries and includes public origin", () => {
  assert.deepEqual(
    resolveCorsAllowedOrigins({
      rawValue: "https://sqr.example.com,https://admin.example.com",
      publicAppUrl: "https://sqr.example.com",
    }),
    ["https://sqr.example.com", "https://admin.example.com"],
  );
});

test("resolveTrustedProxies rejects wildcard-style values", () => {
  assert.throws(
    () => resolveTrustedProxies(["loopback", "*"]),
    /TRUSTED_PROXIES must list explicit proxy ranges or names/i,
  );
});

test("resolvePreviousCollectionPiiSecrets rejects the active key value", () => {
  assert.throws(
    () =>
      resolvePreviousCollectionPiiSecrets(
        ["collection-pii-active-key"],
        "collection-pii-active-key",
      ),
    /COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS must not include the active COLLECTION_PII_ENCRYPTION_KEY value/i,
  );
});

test("assertRuntimeSafetyGuards rejects production-like backups without encryption keys", () => {
  assert.throws(
    () =>
      assertRuntimeSafetyGuards({
        isProductionLike: true,
        isStrictLocalDevelopment: false,
        mailConfiguration: {
          effectiveFrom: null,
          hasAnyInput: false,
          isConfigured: false,
          isIncomplete: false,
        },
        backupFeatureEnabled: true,
        hasBackupEncryptionKeyConfigured: false,
        hasCollectionPiiEncryptionKeyConfigured: true,
        seedDefaultUsers: false,
        localSuperuserCredentialsFileEnabled: false,
        mailDevOutboxEnabled: false,
      }),
    /BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEYS is required/i,
  );
});

test("assertRuntimeSafetyGuards rejects production-like startup when collection PII encryption key is missing", () => {
  assert.throws(
    () =>
      assertRuntimeSafetyGuards({
        isProductionLike: true,
        isStrictLocalDevelopment: false,
        mailConfiguration: {
          effectiveFrom: null,
          hasAnyInput: false,
          isConfigured: false,
          isIncomplete: false,
        },
        backupFeatureEnabled: true,
        hasBackupEncryptionKeyConfigured: true,
        hasCollectionPiiEncryptionKeyConfigured: false,
        seedDefaultUsers: false,
        localSuperuserCredentialsFileEnabled: false,
        mailDevOutboxEnabled: false,
      }),
    /COLLECTION_PII_ENCRYPTION_KEY is required outside strict local development/i,
  );
});

test("assertNoPlaceholderSecrets rejects production-like generated placeholders", () => {
  assert.throws(
    () =>
      assertNoPlaceholderSecrets({
        isProductionLike: true,
        configuredSessionSecret: "GENERATE_ME_AT_LEAST_32_CHARS_DO_NOT_USE_IN_PRODUCTION",
        configuredPreviousSessionSecrets: [],
        configuredPgPassword: "GENERATE_ME_DB_PASSWORD_DO_NOT_USE_IN_PRODUCTION",
        configuredTwoFactorEncryptionKey: "GENERATE_ME_DISTINCT_2FA_KEY_DO_NOT_REUSE_SESSION_SECRET",
        configuredCollectionPiiEncryptionKey: "GENERATE_ME_COLLECTION_PII_KEY_DO_NOT_REUSE_SESSION_SECRET",
        configuredPreviousCollectionPiiEncryptionKeys: [],
        configuredBackupEncryptionKey: "GENERATE_ME_BACKUP_KEY_AND_STORE_OFFLINE",
        configuredBackupEncryptionKeys: null,
      }),
    /SESSION_SECRET is using the default placeholder value/i,
  );
});

test("assertNoPlaceholderSecrets rejects production-like previous collection PII placeholders", () => {
  assert.throws(
    () =>
      assertNoPlaceholderSecrets({
        isProductionLike: true,
        configuredSessionSecret: "prod-session-secret",
        configuredPreviousSessionSecrets: [],
        configuredPgPassword: "prod-db-password",
        configuredTwoFactorEncryptionKey: "prod-2fa-secret",
        configuredCollectionPiiEncryptionKey: "prod-collection-pii-secret",
        configuredPreviousCollectionPiiEncryptionKeys: [
          "GENERATE_ME_COLLECTION_PII_KEY_DO_NOT_REUSE_SESSION_SECRET",
        ],
        configuredBackupEncryptionKey: "prod-backup-secret",
        configuredBackupEncryptionKeys: null,
      }),
    /COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS contains a placeholder value/i,
  );
});

test("buildRuntimeConfigWarnings warns when local collection PII encryption is not configured", () => {
  const warnings = buildRuntimeConfigWarnings({
    isStrictLocalDevelopment: true,
    publicAppUrl: "http://127.0.0.1:5000",
    configuredSessionSecret: null,
    configuredCollectionNicknameTempPassword: null,
    configuredCollectionPiiEncryptionKey: null,
    configuredPgPassword: null,
    mailConfiguration: {
      effectiveFrom: null,
      hasAnyInput: false,
      isConfigured: false,
      isIncomplete: false,
    },
  });

  assert.match(
    warnings.map((warning) => warning.code).join(","),
    /COLLECTION_PII_ENCRYPTION_KEY_EMPTY_LOCAL/,
  );
});
