import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoPlaceholderSecrets,
  assertProductionDatabaseBootstrapModeSafety,
  assertProductionRateLimiterTopologySafety,
  assertProductionTwoFactorReplayTopologySafety,
  assertRuntimeSafetyGuards,
  assertStrongRuntimeSecret,
  buildRuntimeConfigWarnings,
  resolveHstsHeaderConfig,
  resolveCookieSecure,
  resolveCorsAllowedOrigins,
  resolvePreviousCollectionPiiSecrets,
  resolvePreviousSessionSecrets,
  resolveTrustedProxies,
} from "../runtime-config-safety-utils";

const STRONG_SESSION_SECRET = "sqr-prod-session-secret-32-chars-minimum-001";
const STRONG_PREVIOUS_SESSION_SECRET = "sqr-prod-previous-session-secret-minimum-001";
const STRONG_TWO_FACTOR_SECRET = "sqr-prod-two-factor-secret-32-chars-minimum-001";
const STRONG_PREVIOUS_TWO_FACTOR_SECRET = "sqr-prod-previous-two-factor-secret-minimum-001";
const STRONG_COLLECTION_PII_SECRET = "sqr-prod-collection-pii-secret-minimum-001";
const STRONG_PREVIOUS_COLLECTION_PII_SECRET =
  "sqr-prod-previous-collection-pii-secret-minimum-001";

test("resolveCookieSecure respects explicit and auto values", () => {
  assert.equal(
    resolveCookieSecure("true", { isProductionLike: false, publicAppUrl: "http://localhost:5000" }),
    true,
  );
  assert.equal(
    resolveCookieSecure(null, { isProductionLike: false, publicAppUrl: "https://sqr.example.com" }),
    true,
  );
  assert.equal(
    resolveCookieSecure("0", { isProductionLike: true, publicAppUrl: "https://sqr.example.com" }),
    true,
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

test("resolvePreviousSessionSecrets rejects active duplicates and dedupes stale rotation entries", () => {
  assert.throws(
    () => resolvePreviousSessionSecrets(["current-session-secret"], "current-session-secret"),
    /SESSION_SECRET_PREVIOUS must not include the active SESSION_SECRET value/i,
  );
  assert.deepEqual(
    resolvePreviousSessionSecrets(["older-secret", "older-secret", "oldest-secret"], "current-session-secret"),
    ["older-secret", "oldest-secret"],
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
        hasTwoFactorEncryptionKeyConfigured: true,
        seedDefaultUsers: false,
        localSuperuserCredentialsFileEnabled: false,
        mailDevOutboxEnabled: false,
        operationsDebugRoutesEnabled: false,
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
        hasTwoFactorEncryptionKeyConfigured: true,
        seedDefaultUsers: false,
        localSuperuserCredentialsFileEnabled: false,
        mailDevOutboxEnabled: false,
        operationsDebugRoutesEnabled: false,
      }),
    /COLLECTION_PII_ENCRYPTION_KEY is required outside strict local development/i,
  );
});

test("assertRuntimeSafetyGuards rejects production-like startup when the two-factor encryption key is missing", () => {
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
        hasCollectionPiiEncryptionKeyConfigured: true,
        hasTwoFactorEncryptionKeyConfigured: false,
        seedDefaultUsers: false,
        localSuperuserCredentialsFileEnabled: false,
        mailDevOutboxEnabled: false,
        operationsDebugRoutesEnabled: false,
      }),
    /TWO_FACTOR_ENCRYPTION_KEY is required outside strict local development/i,
  );
});

test("assertRuntimeSafetyGuards rejects production-like startup when operations debug routes are enabled", () => {
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
        hasCollectionPiiEncryptionKeyConfigured: true,
        hasTwoFactorEncryptionKeyConfigured: true,
        seedDefaultUsers: false,
        localSuperuserCredentialsFileEnabled: false,
        mailDevOutboxEnabled: false,
        operationsDebugRoutesEnabled: true,
      }),
    /OPERATIONS_DEBUG_ROUTES_ENABLED is not allowed on production-like hosts/i,
  );
});

test("assertProductionRateLimiterTopologySafety rejects production-like multi-worker startup without a shared store", () => {
  assert.throws(
    () =>
      assertProductionRateLimiterTopologySafety({
        isProductionLike: true,
        configuredClusterMaxWorkers: 2,
        distributedStoreConfigured: false,
      }),
    /SQR_MAX_WORKERS greater than 1 is not allowed outside strict local development/i,
  );

  assert.doesNotThrow(() =>
    assertProductionRateLimiterTopologySafety({
      isProductionLike: false,
      configuredClusterMaxWorkers: 2,
      distributedStoreConfigured: false,
    }),
  );

  assert.doesNotThrow(() =>
    assertProductionRateLimiterTopologySafety({
      isProductionLike: true,
      configuredClusterMaxWorkers: 1,
      distributedStoreConfigured: false,
    }),
  );

  assert.doesNotThrow(() =>
    assertProductionRateLimiterTopologySafety({
      isProductionLike: true,
      configuredClusterMaxWorkers: 2,
      distributedStoreConfigured: true,
    }),
  );
});

test("assertProductionTwoFactorReplayTopologySafety rejects production multi-worker even with shared rate limits", () => {
  assert.throws(
    () =>
      assertProductionTwoFactorReplayTopologySafety({
        isProductionLike: true,
        configuredClusterMaxWorkers: 2,
        sharedReplayStoreConfigured: false,
      }),
    /2FA TOTP replay protection is process-local/i,
  );

  assert.doesNotThrow(() =>
    assertProductionTwoFactorReplayTopologySafety({
      isProductionLike: true,
      configuredClusterMaxWorkers: 1,
      sharedReplayStoreConfigured: false,
    }),
  );

  assert.doesNotThrow(() =>
    assertProductionTwoFactorReplayTopologySafety({
      isProductionLike: false,
      configuredClusterMaxWorkers: 2,
      sharedReplayStoreConfigured: false,
    }),
  );
});

test("assertProductionDatabaseBootstrapModeSafety rejects production runtime bootstrap without explicit override", () => {
  assert.throws(
    () =>
      assertProductionDatabaseBootstrapModeSafety({
        isProductionLike: true,
        databaseBootstrapMode: "runtime",
        allowRuntimeBootstrapInProduction: false,
      }),
    /SQR_DB_BOOTSTRAP_MODE=runtime is not allowed on production-like hosts/i,
  );

  assert.doesNotThrow(() =>
    assertProductionDatabaseBootstrapModeSafety({
      isProductionLike: true,
      databaseBootstrapMode: "runtime",
      allowRuntimeBootstrapInProduction: true,
    }),
  );

  assert.doesNotThrow(() =>
    assertProductionDatabaseBootstrapModeSafety({
      isProductionLike: true,
      databaseBootstrapMode: "migration",
      allowRuntimeBootstrapInProduction: false,
    }),
  );

  assert.doesNotThrow(() =>
    assertProductionDatabaseBootstrapModeSafety({
      isProductionLike: false,
      databaseBootstrapMode: "runtime",
      allowRuntimeBootstrapInProduction: false,
    }),
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
        configuredPreviousTwoFactorEncryptionKeys: [],
        configuredCollectionPiiEncryptionKey: "GENERATE_ME_COLLECTION_PII_KEY_DO_NOT_REUSE_SESSION_SECRET",
        configuredPreviousCollectionPiiEncryptionKeys: [],
        configuredBackupEncryptionKey: "GENERATE_ME_BACKUP_KEY_AND_STORE_OFFLINE",
        configuredBackupEncryptionKeys: null,
      }),
    /SESSION_SECRET must not use an example, placeholder, or template value/i,
  );
});

test("assertNoPlaceholderSecrets rejects production-like previous collection PII placeholders", () => {
  assert.throws(
    () =>
      assertNoPlaceholderSecrets({
        isProductionLike: true,
        configuredSessionSecret: STRONG_SESSION_SECRET,
        configuredPreviousSessionSecrets: [],
        configuredPgPassword: "prod-db-password",
        configuredTwoFactorEncryptionKey: STRONG_TWO_FACTOR_SECRET,
        configuredPreviousTwoFactorEncryptionKeys: [],
        configuredCollectionPiiEncryptionKey: STRONG_COLLECTION_PII_SECRET,
        configuredPreviousCollectionPiiEncryptionKeys: [
          "GENERATE_ME_COLLECTION_PII_KEY_DO_NOT_REUSE_SESSION_SECRET",
        ],
        configuredBackupEncryptionKey: "prod-backup-secret",
        configuredBackupEncryptionKeys: null,
      }),
    /COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS must not use an example, placeholder, or template value/i,
  );
});

test("assertStrongRuntimeSecret rejects short and template production secrets", () => {
  assert.throws(
    () => assertStrongRuntimeSecret("SESSION_SECRET", "too-short"),
    /SESSION_SECRET must be a unique random secret of at least 32 characters/i,
  );
  assert.throws(
    () =>
      assertStrongRuntimeSecret(
        "SESSION_SECRET",
        "ganti-dengan-random-secret-yang-panjang-dan-kuat",
      ),
    /SESSION_SECRET must not use an example, placeholder, or template value/i,
  );
  assert.throws(
    () => assertStrongRuntimeSecret("SESSION_SECRET", "change-this-secret-with-32-characters"),
    /SESSION_SECRET must not use an example, placeholder, or template value/i,
  );
  assert.doesNotThrow(() => assertStrongRuntimeSecret("SESSION_SECRET", STRONG_SESSION_SECRET));
});

test("assertNoPlaceholderSecrets validates production current and previous runtime secrets", () => {
  assert.doesNotThrow(() =>
    assertNoPlaceholderSecrets({
      isProductionLike: true,
      configuredSessionSecret: STRONG_SESSION_SECRET,
      configuredPreviousSessionSecrets: [STRONG_PREVIOUS_SESSION_SECRET],
      configuredPgPassword: "prod-db-password",
      configuredTwoFactorEncryptionKey: STRONG_TWO_FACTOR_SECRET,
      configuredPreviousTwoFactorEncryptionKeys: [STRONG_PREVIOUS_TWO_FACTOR_SECRET],
      configuredCollectionPiiEncryptionKey: STRONG_COLLECTION_PII_SECRET,
      configuredPreviousCollectionPiiEncryptionKeys: [STRONG_PREVIOUS_COLLECTION_PII_SECRET],
      configuredBackupEncryptionKey: "prod-backup-secret",
      configuredBackupEncryptionKeys: null,
    }),
  );

  assert.throws(
    () =>
      assertNoPlaceholderSecrets({
        isProductionLike: true,
        configuredSessionSecret: STRONG_SESSION_SECRET,
        configuredPreviousSessionSecrets: ["short-previous"],
        configuredPgPassword: "prod-db-password",
        configuredTwoFactorEncryptionKey: STRONG_TWO_FACTOR_SECRET,
        configuredPreviousTwoFactorEncryptionKeys: [],
        configuredCollectionPiiEncryptionKey: STRONG_COLLECTION_PII_SECRET,
        configuredPreviousCollectionPiiEncryptionKeys: [],
        configuredBackupEncryptionKey: "prod-backup-secret",
        configuredBackupEncryptionKeys: null,
      }),
    /SESSION_SECRET_PREVIOUS must be a unique random secret of at least 32 characters/i,
  );

  assert.throws(
    () =>
      assertNoPlaceholderSecrets({
        isProductionLike: true,
        configuredSessionSecret: STRONG_SESSION_SECRET,
        configuredPreviousSessionSecrets: [],
        configuredPgPassword: "prod-db-password",
        configuredTwoFactorEncryptionKey: STRONG_TWO_FACTOR_SECRET,
        configuredPreviousTwoFactorEncryptionKeys: ["ganti-dengan-secret-2fa-yang-kuat-dan-berbeza"],
        configuredCollectionPiiEncryptionKey: STRONG_COLLECTION_PII_SECRET,
        configuredPreviousCollectionPiiEncryptionKeys: [],
        configuredBackupEncryptionKey: "prod-backup-secret",
        configuredBackupEncryptionKeys: null,
      }),
    /TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS must not use an example, placeholder, or template value/i,
  );
});

test("assertNoPlaceholderSecrets keeps local development placeholder behavior unchanged", () => {
  assert.doesNotThrow(() =>
    assertNoPlaceholderSecrets({
      isProductionLike: false,
      configuredSessionSecret: "change-this-session-secret",
      configuredPreviousSessionSecrets: ["short"],
      configuredPgPassword: "GENERATE_ME_DB_PASSWORD_DO_NOT_USE_IN_PRODUCTION",
      configuredTwoFactorEncryptionKey: "ganti-dengan-secret-2fa-yang-kuat-dan-berbeza",
      configuredPreviousTwoFactorEncryptionKeys: ["short"],
      configuredCollectionPiiEncryptionKey: "ganti-dengan-secret-pii-yang-kuat-dan-berbeza",
      configuredPreviousCollectionPiiEncryptionKeys: ["short"],
      configuredBackupEncryptionKey: "GENERATE_ME_BACKUP_KEY_AND_STORE_OFFLINE",
      configuredBackupEncryptionKeys: null,
    }),
  );
});

test("buildRuntimeConfigWarnings warns when local collection PII encryption is not configured", () => {
  const warnings = buildRuntimeConfigWarnings({
    isStrictLocalDevelopment: true,
    isProductionLike: false,
    publicAppUrl: "http://127.0.0.1:5000",
    configuredSessionSecret: null,
    configuredCollectionNicknameTempPassword: null,
    configuredCollectionPiiEncryptionKey: null,
    configuredPgPassword: null,
    configuredAuthCookieSecure: null,
    configuredClusterMaxWorkers: 1,
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

test("buildRuntimeConfigWarnings reports when insecure auth cookies are forced on production-like hosts", () => {
  const warnings = buildRuntimeConfigWarnings({
    isStrictLocalDevelopment: false,
    isProductionLike: true,
    publicAppUrl: "https://sqr.example.com",
    configuredSessionSecret: "prod-session-secret",
    configuredCollectionNicknameTempPassword: "TempPassword12345",
    configuredCollectionPiiEncryptionKey: "collection-pii-secret",
    configuredPgPassword: "prod-db-password",
    configuredAuthCookieSecure: "false",
    configuredClusterMaxWorkers: 1,
    mailConfiguration: {
      effectiveFrom: null,
      hasAnyInput: false,
      isConfigured: false,
      isIncomplete: false,
    },
  });

  assert.match(
    warnings.map((warning) => warning.code).join(","),
    /AUTH_COOKIE_SECURE_FORCED_ON_PRODUCTION/,
  );
});

test("resolveHstsHeaderConfig keeps preload opt-in and enforces preload max-age", () => {
  assert.deepEqual(
    resolveHstsHeaderConfig({
      isProductionLike: true,
      maxAgeSeconds: 15_552_000,
      preloadEnabled: false,
    }),
    {
      maxAge: 15_552_000,
      includeSubDomains: true,
      preload: false,
    },
  );

  assert.throws(
    () =>
      resolveHstsHeaderConfig({
        isProductionLike: true,
        maxAgeSeconds: 15_552_000,
        preloadEnabled: true,
      }),
    /HSTS_PRELOAD_ENABLED requires HSTS_MAX_AGE_SECONDS to be at least 31536000/i,
  );
});

test("resolveHstsHeaderConfig rejects production max-age below the hardened baseline", () => {
  assert.throws(
    () =>
      resolveHstsHeaderConfig({
        isProductionLike: true,
        maxAgeSeconds: 0,
        preloadEnabled: false,
      }),
    /Production HSTS_MAX_AGE_SECONDS must be at least 15552000/i,
  );

  assert.deepEqual(
    resolveHstsHeaderConfig({
      isProductionLike: false,
      maxAgeSeconds: 0,
      preloadEnabled: false,
    }),
    {
      maxAge: 0,
      includeSubDomains: true,
      preload: false,
    },
  );
});

test("buildRuntimeConfigWarnings reports disabled HSTS preload on production HTTPS", () => {
  const warnings = buildRuntimeConfigWarnings({
    isStrictLocalDevelopment: false,
    isProductionLike: true,
    publicAppUrl: "https://sqr.example.com",
    configuredSessionSecret: "prod-session-secret",
    configuredCollectionNicknameTempPassword: "TempPassword12345",
    configuredCollectionPiiEncryptionKey: "collection-pii-secret",
    configuredPgPassword: "prod-db-password",
    configuredAuthCookieSecure: null,
    configuredClusterMaxWorkers: 1,
    hstsMaxAgeSeconds: 15_552_000,
    hstsPreloadEnabled: false,
    mailConfiguration: {
      effectiveFrom: "noreply@sqr.example.com",
      hasAnyInput: true,
      isConfigured: true,
      isIncomplete: false,
    },
  });

  assert.match(
    warnings.map((warning) => warning.code).join(","),
    /HSTS_PRELOAD_DISABLED_PRODUCTION_HTTPS/,
  );
});

test("buildRuntimeConfigWarnings reports missing non-local SMTP configuration", () => {
  const warnings = buildRuntimeConfigWarnings({
    isStrictLocalDevelopment: false,
    isProductionLike: true,
    publicAppUrl: "https://sqr.example.com",
    configuredSessionSecret: "prod-session-secret",
    configuredCollectionNicknameTempPassword: "TempPassword12345",
    configuredCollectionPiiEncryptionKey: "collection-pii-secret",
    configuredPgPassword: "prod-db-password",
    configuredAuthCookieSecure: null,
    configuredClusterMaxWorkers: 1,
    mailConfiguration: {
      effectiveFrom: null,
      hasAnyInput: false,
      isConfigured: false,
      isIncomplete: false,
    },
  });

  assert.match(
    warnings.map((warning) => warning.code).join(","),
    /MAIL_CONFIGURATION_MISSING/,
  );
});

test("buildRuntimeConfigWarnings reports process-local 2FA replay cache risk in multi-worker mode", () => {
  const warnings = buildRuntimeConfigWarnings({
    isStrictLocalDevelopment: false,
    isProductionLike: true,
    publicAppUrl: "https://sqr.example.com",
    configuredSessionSecret: "prod-session-secret",
    configuredCollectionNicknameTempPassword: "TempPassword12345",
    configuredCollectionPiiEncryptionKey: "collection-pii-secret",
    configuredPgPassword: "prod-db-password",
    configuredAuthCookieSecure: null,
    configuredClusterMaxWorkers: 2,
    mailConfiguration: {
      effectiveFrom: "noreply@sqr.example.com",
      hasAnyInput: true,
      isConfigured: true,
      isIncomplete: false,
    },
  });

  assert.match(
    warnings.map((warning) => warning.code).join(","),
    /TWO_FACTOR_REPLAY_CACHE_PROCESS_LOCAL/,
  );
  assert.match(
    warnings.map((warning) => warning.code).join(","),
    /WEBSOCKET_STATE_PROCESS_LOCAL/,
  );
});
