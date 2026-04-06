import assert from "node:assert/strict";
import test from "node:test";
import {
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
