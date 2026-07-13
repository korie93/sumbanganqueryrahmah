import assert from "node:assert/strict";
import test from "node:test";
import {
  SMOKE_SESSION_SECRET_MIN_BYTES,
  resolveSmokeSessionSecret,
} from "../lib/smoke-session-secret.mjs";

test("smoke session secret preserves configured values that meet the byte minimum", () => {
  const configuredSecret = "configured-smoke-session-secret-32-bytes";
  let generated = false;

  const resolved = resolveSmokeSessionSecret(configuredSecret, () => {
    generated = true;
    return "unused-generated-smoke-session-secret";
  });

  assert.equal(resolved, configuredSecret);
  assert.equal(generated, false);
});

test("smoke session secret replaces missing and undersized configured values", () => {
  const generatedSecret = "generated-smoke-session-secret-safe-value";

  assert.equal(resolveSmokeSessionSecret("", () => generatedSecret), generatedSecret);
  assert.equal(resolveSmokeSessionSecret("too-short", () => generatedSecret), generatedSecret);
});

test("smoke session secret validates UTF-8 byte length instead of character count", () => {
  const multibyteSecret = "\u00e9".repeat(SMOKE_SESSION_SECRET_MIN_BYTES / 2);

  assert.equal(Buffer.byteLength(multibyteSecret, "utf8"), SMOKE_SESSION_SECRET_MIN_BYTES);
  assert.equal(resolveSmokeSessionSecret(multibyteSecret), multibyteSecret);
});

test("smoke session secret rejects an invalid generator result", () => {
  assert.throws(
    () => resolveSmokeSessionSecret("short", () => "still-short"),
    /Generated smoke SESSION_SECRET must be at least 32 bytes/,
  );
});
