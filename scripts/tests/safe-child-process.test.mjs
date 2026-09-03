import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSafeChildEnv,
  buildSafeSpawnOptions,
  normalizeScannerArgsJson,
  validateConfiguredScannerCommand,
  validateSafeSpawnSpec,
} from "../lib/safe-child-process.mjs";

test("safe child process spec rejects shell metacharacters in arguments", () => {
  assert.throws(
    () => validateSafeSpawnSpec("npm", ["run", "build;rm"]),
    /metacharacters/i,
  );
  assert.throws(
    () => validateSafeSpawnSpec("npm", ["run", "build|cat"]),
    /metacharacters/i,
  );
});

test("safe child process spec rejects path traversal attempts", () => {
  assert.throws(
    () => validateSafeSpawnSpec("node", ["../scripts/example.mjs"]),
    /path traversal/i,
  );
  assert.throws(
    () => validateSafeSpawnSpec("../node", ["scripts/example.mjs"]),
    /path traversal/i,
  );
});

test("safe child process spec allows known smoke CI commands and arguments", () => {
  assert.deepEqual(validateSafeSpawnSpec("npm", ["run", "smoke:preflight"]), {
    args: ["run", "smoke:preflight"],
    command: "npm",
  });
  assert.deepEqual(validateSafeSpawnSpec("taskkill", ["/pid", "1234", "/t", "/f"]), {
    args: ["/pid", "1234", "/t", "/f"],
    command: "taskkill",
  });
});

test("safe child process env keeps explicit runtime values and drops unrelated secrets", () => {
  const env = buildSafeChildEnv(
    {
      AWS_SECRET_ACCESS_KEY: "not-forwarded",
      OPENAI_API_KEY: "not-forwarded",
      PATH: "/usr/bin",
      CHROME_PATH: "/opt/google/chrome",
      PG_PASSWORD: "required-postgres-password",
      PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: "/opt/google/chrome",
      SESSION_SECRET: "required-session-secret-32-characters",
      npm_config_cache: "/tmp/npm-cache",
    },
    {
      SMOKE_BASE_URL: "http://127.0.0.1:5000",
    },
  );

  assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.PATH, "/usr/bin");
  assert.equal(env.CHROME_PATH, "/opt/google/chrome");
  assert.equal(env.PG_PASSWORD, "required-postgres-password");
  assert.equal(env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, "/opt/google/chrome");
  assert.equal(env.SESSION_SECRET, "required-session-secret-32-characters");
  assert.equal(env.SMOKE_BASE_URL, "http://127.0.0.1:5000");
  assert.equal(env.npm_config_cache, "/tmp/npm-cache");
});

test("safe spawn options always disable shell execution", () => {
  assert.equal(buildSafeSpawnOptions({ env: { PATH: "/usr/bin" } }).shell, false);
});

test("scanner command sanitizer allows node and ClamAV only", () => {
  assert.equal(validateConfiguredScannerCommand("/usr/bin/clamdscan"), "/usr/bin/clamdscan");
  assert.equal(validateConfiguredScannerCommand(process.execPath), process.execPath);
  assert.throws(
    () => validateConfiguredScannerCommand("sh"),
    /not allowlisted/i,
  );
});

test("scanner args JSON sanitizer rejects command injection characters", () => {
  assert.equal(
    normalizeScannerArgsJson("[\"--fdpass\",\"--no-summary\",\"{file}\"]"),
    "[\"--fdpass\",\"--no-summary\",\"{file}\"]",
  );
  assert.throws(
    () => normalizeScannerArgsJson("[\"--fdpass;rm\",\"{file}\"]"),
    /metacharacters/i,
  );
});
