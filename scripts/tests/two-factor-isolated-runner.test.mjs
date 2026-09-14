import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../test-two-factor-isolated.mjs", import.meta.url), "utf8");

test("2FA browser fixture starts a fresh loopback cluster without inheriting application credentials", () => {
  assert.doesNotMatch(source, /import\s+["']dotenv|\.\.\.process\.env|process\.env\.(?:DATABASE_URL|PG_HOST|PG_PORT|PG_USER|PG_PASSWORD|SESSION_SECRET|SEED_SUPERUSER_PASSWORD)/);
  assert.match(source, /const cleanEnv = Object\.fromEntries\(inheritedKeys/);
  assert.match(source, /mkdtemp\(path\.join\(tempParent, "sqr-two-factor-"\)\)/);
  assert.match(source, /run\(executable\("initdb"\)/);
  assert.match(source, /SHOW data_directory/);
  assert.match(source, /assert\.equal\(await realpath\(state\.rows\[0\]\.data_directory\), await realpath\(dataDir\)\)/);
  assert.match(source, /CREATE DATABASE sqr_two_factor_test/);
  assert.match(source, /PG_HOST: "127\.0\.0\.1", PG_PORT: String\(databasePort\)/);
  assert.match(source, /NODE_ENV: "development", HOST: "127\.0\.0\.1"/);
  assert.match(source, /DATABASE_SSL: "0"/);
  assert.doesNotMatch(source, /\bPG_SSL:/);
});

test("2FA verification serves the actual build from a disposable working directory and never copies user uploads", () => {
  assert.match(source, /const builtServer = path\.join\(repoRoot, "dist-local", "server", "index-local\.js"\)/);
  assert.match(source, /cp\(builtPublic, path\.join\(appDir, "dist-local", "public"\)/);
  assert.match(source, /spawn\(process\.execPath, \[builtServer\], \{ cwd: appDir, env, windowsHide: true, shell: false/);
  assert.doesNotMatch(source, /cp\([^\n]*(?:uploads|\.env|receipts|collection-record)/i);
  assert.match(source, /runTwoFactorBrowser\(\{ baseUrl, username, password, artifactsDir \}\)/);
  assert.match(source, /LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: "0"/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:\$\{password\}|\$\{fixtureDatabasePassword\}|\$\{username\})/);
});

test("2FA fixture cleanup requires stopped processes and validates its narrow non-symlink target", () => {
  assert.match(source, /if \(appStopped && databaseStopped\)/);
  assert.match(source, /assert\.equal\(info\.isSymbolicLink\(\), false\)/);
  assert.match(source, /assert\.equal\(path\.dirname\(resolved\), tempParent\)/);
  assert.match(source, /assert\.match\(path\.basename\(resolved\), \/\^sqr-two-factor-/);
  assert.match(source, /await rm\(resolved, \{ recursive: true, maxRetries: 5, retryDelay: 200 \}\)/);
  assert.match(source, /Fixture shutdown could not be confirmed; retaining/);
  assert.match(source, /child\.send\("shutdown"/);
  assert.doesNotMatch(source, /taskkill|pkill|killall|rm -rf/);
});

test("2FA fixture retains real strict rate-limit configuration and avoids loading production services", () => {
  assert.doesNotMatch(source, /SQR_RATE_LIMIT_(?:LOGIN|USER|AUTHENTICATED)/);
  assert.doesNotMatch(source, /process\.env\.(?:REDIS_URL|SMTP_HOST|OPENAI_API_KEY|TWO_FACTOR_ENCRYPTION_KEY)/);
  assert.match(source, /SQR_MAX_WORKERS: "1"/);
  assert.match(source, /AUTH_COOKIE_SECURE: "0"/);
  assert.match(source, /PUBLIC_APP_URL: baseUrl, CORS_ALLOWED_ORIGINS: baseUrl/);
});
