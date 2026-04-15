import process from "node:process";
import path from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import { resolveManagedLoopbackBaseUrl } from "./lib/local-loopback-server.mjs";
import { LOCAL_SMOKE_SUPERUSER_TWO_FACTOR_SECRET } from "./lib/smoke-two-factor.mjs";

const smokeEnvPath = path.resolve(process.cwd(), ".env.smoke.local");
if (existsSync(smokeEnvPath)) {
  dotenv.config({ path: smokeEnvPath });
} else {
  dotenv.config();
}

const npmCliPath = String(process.env.npm_execpath || "").trim();
const npmCommand = npmCliPath ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const runCommand = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio || "inherit",
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });

const runNpm = (args, options = {}) =>
  runCommand(
    npmCommand,
    npmCliPath ? [npmCliPath, ...args] : args,
    options,
  );

const run = async () => {
  const stamp = Date.now();
  const host = String(process.env.HOST || "127.0.0.1").trim() || "127.0.0.1";
  const defaultPort = String(process.env.PORT || "5000").trim() || "5000";
  const configuredBaseUrl = String(process.env.SMOKE_BASE_URL || process.env.PUBLIC_APP_URL || `http://${host}:${defaultPort}`).trim();
  const resolvedServer = await resolveManagedLoopbackBaseUrl({
    configuredBaseUrl,
    host,
    preferredPort: defaultPort,
  });
  const baseUrl = resolvedServer.baseUrl;
  const reuseFixedSmokeUser = String(process.env.SMOKE_LOCAL_REUSE_USER || "").trim().toLowerCase() === "true";
  const smokeUserPrefix =
    String(
      process.env.SMOKE_LOCAL_USER_PREFIX
      || process.env.SMOKE_TEST_USERNAME_PREFIX
      || process.env.SEED_SUPERUSER_USERNAME_PREFIX
      || process.env.SMOKE_TEST_USERNAME
      || process.env.SEED_SUPERUSER_USERNAME
      || "superuser_local_smoke",
    ).trim()
    || "superuser_local_smoke";

  const seededSmokeUsername = reuseFixedSmokeUser
    ? smokeUserPrefix
    : `${smokeUserPrefix}_${stamp}`;
  const seededSmokePassword =
    String(process.env.SMOKE_TEST_PASSWORD || process.env.SEED_SUPERUSER_PASSWORD || "").trim()
    || "Password123!";

  const env = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || "development",
    HOST: host,
    PORT: String(resolvedServer.port),
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || baseUrl,
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS || baseUrl,
    SESSION_SECRET: process.env.SESSION_SECRET || "ci-session-secret",
    TWO_FACTOR_ENCRYPTION_KEY:
      process.env.TWO_FACTOR_ENCRYPTION_KEY || "strict-local-smoke-two-factor-encryption-key",
    PG_HOST: process.env.PG_HOST || "127.0.0.1",
    PG_PORT: process.env.PG_PORT || "5432",
    PG_USER: String(process.env.PG_USER || "").trim(),
    PG_PASSWORD: String(process.env.PG_PASSWORD || "").trim(),
    PG_DATABASE: String(process.env.PG_DATABASE || "").trim(),
    SEED_DEFAULT_USERS: process.env.SEED_DEFAULT_USERS || "1",
    SEED_SUPERUSER_USERNAME: seededSmokeUsername,
    SEED_SUPERUSER_PASSWORD: seededSmokePassword,
    SEED_SUPERUSER_FULL_NAME: process.env.SEED_SUPERUSER_FULL_NAME || "Local Smoke Superuser",
    SEED_SUPERUSER_TWO_FACTOR_SECRET:
      process.env.SEED_SUPERUSER_TWO_FACTOR_SECRET || LOCAL_SMOKE_SUPERUSER_TWO_FACTOR_SECRET,
    SMOKE_TEST_USERNAME: seededSmokeUsername,
    SMOKE_TEST_PASSWORD: seededSmokePassword,
    SMOKE_TEST_TWO_FACTOR_SECRET:
      process.env.SMOKE_TEST_TWO_FACTOR_SECRET || LOCAL_SMOKE_SUPERUSER_TWO_FACTOR_SECRET,
    SMOKE_BASE_URL: baseUrl,
    SMOKE_ARTIFACTS_DIR: process.env.SMOKE_ARTIFACTS_DIR || "artifacts/smoke-ui-local",
  };

  assert(env.PG_USER, "PG_USER is required for npm run smoke:local. Put it in .env or export it in your shell.");
  assert(env.PG_PASSWORD, "PG_PASSWORD is required for npm run smoke:local. Put it in .env or export it in your shell.");
  assert(env.PG_DATABASE, "PG_DATABASE is required for npm run smoke:local. Put it in .env or export it in your shell.");

  console.log(
    [
      "Running local smoke with:",
      `- baseUrl: ${env.SMOKE_BASE_URL}`,
      ...(resolvedServer.usedFallbackPort
        ? [`- resolved port fallback: ${defaultPort} -> ${resolvedServer.port}`]
        : []),
      `- db: ${env.PG_USER}@${env.PG_HOST}:${env.PG_PORT}/${env.PG_DATABASE}`,
      `- smoke user: ${env.SMOKE_TEST_USERNAME}`,
      `- reuse fixed smoke user: ${reuseFixedSmokeUser ? "yes" : "no"}`,
      `- artifacts: ${env.SMOKE_ARTIFACTS_DIR}`,
    ].join("\n"),
  );

  await runNpm(["run", "smoke:ci-local"], { env });
};

run().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
