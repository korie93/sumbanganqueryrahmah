import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoPlaceholderSecrets,
  assertRuntimeSafetyGuards,
  resolveCookieSecure,
  resolveCorsAllowedOrigins,
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
        seedDefaultUsers: false,
        localSuperuserCredentialsFileEnabled: false,
        mailDevOutboxEnabled: false,
      }),
    /BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEYS is required/i,
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
        configuredBackupEncryptionKey: "GENERATE_ME_BACKUP_KEY_AND_STORE_OFFLINE",
        configuredBackupEncryptionKeys: null,
      }),
    /SESSION_SECRET is using the default placeholder value/i,
  );
});
