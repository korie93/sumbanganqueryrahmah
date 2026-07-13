import process from "node:process";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import "dotenv/config";
import { resolveManagedLoopbackBaseUrl } from "./lib/local-loopback-server.mjs";
import { assertPostgresConnection } from "./lib/postgres-preflight.mjs";
import { waitForServer } from "./lib/server-readiness.mjs";
import {
  startManagedServerProcess,
  stopManagedServerProcess,
} from "./lib/managed-server-process.mjs";
import { resolveSmokeSessionSecret } from "./lib/smoke-session-secret.mjs";
import {
  buildSafeChildEnv,
  buildSafeSpawnOptions,
  normalizeScannerArgsJson,
  validateConfiguredScannerCommand,
  validateSafeSpawnSpec,
} from "./lib/safe-child-process.mjs";

const npmCliPath = String(process.env.npm_execpath || "").trim();
const npmCommand = npmCliPath ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
const artifactsDir = path.resolve(process.cwd(), process.env.SMOKE_ARTIFACTS_DIR || "artifacts/smoke-ui-local");
const serverLogPath = path.join(artifactsDir, "server.log");

const runCommand = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const spawnSpec = validateSafeSpawnSpec(command, args);
    const child = spawn(
      spawnSpec.command,
      spawnSpec.args,
      buildSafeSpawnOptions({
        stdio: options.stdio || "inherit",
        cwd: options.cwd || process.cwd(),
        env: options.env || buildSafeChildEnv(process.env),
      }),
    );

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || options.allowFailure) {
        resolve(code ?? 0);
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readNonNegativeIntEnv(name, fallback) {
  const rawValue = String(process.env[name] || "").trim();
  if (!rawValue) {
    return fallback;
  }
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}

const run = async () => {
  await mkdir(artifactsDir, { recursive: true });

  const stamp = Date.now();
  const smokeUser = String(process.env.SMOKE_TEST_USERNAME || "").trim() || `superuser${stamp}`;
  const smokePassword = String(process.env.SMOKE_TEST_PASSWORD || "").trim() || "Password123!";
  const host = String(process.env.HOST || "127.0.0.1").trim() || "127.0.0.1";
  const defaultPort = String(process.env.PORT || "5000").trim() || "5000";
  const resolvedServer = await resolveManagedLoopbackBaseUrl({
    configuredBaseUrl: process.env.SMOKE_BASE_URL || process.env.PUBLIC_APP_URL || `http://${host}:${defaultPort}`,
    host,
    preferredPort: defaultPort,
  });
  const baseUrl = resolvedServer.baseUrl;
  const scannerCommand = validateConfiguredScannerCommand(
    process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND || process.execPath,
  );
  const scannerArgsJson = normalizeScannerArgsJson(
    process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON || "[\"-e\",\"process.exit(0)\",\"{file}\"]",
    "COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON",
  );
  const env = buildSafeChildEnv(process.env, {
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: String(resolvedServer.port),
    HOST: host,
    PUBLIC_APP_URL: baseUrl,
    CORS_ALLOWED_ORIGINS: baseUrl,
    SESSION_SECRET: resolveSmokeSessionSecret(process.env.SESSION_SECRET),
    PG_HOST: process.env.PG_HOST || "127.0.0.1",
    PG_PORT: process.env.PG_PORT || "5432",
    PG_USER: process.env.PG_USER || "postgres",
    PG_PASSWORD: process.env.PG_PASSWORD || "postgres",
    PG_DATABASE: process.env.PG_DATABASE || "sqr_db",
    SEED_DEFAULT_USERS: process.env.SEED_DEFAULT_USERS || "1",
    SEED_SUPERUSER_USERNAME: process.env.SEED_SUPERUSER_USERNAME || smokeUser,
    SEED_SUPERUSER_PASSWORD: process.env.SEED_SUPERUSER_PASSWORD || smokePassword,
    SEED_SUPERUSER_FULL_NAME: process.env.SEED_SUPERUSER_FULL_NAME || "CI Superuser",
    SMOKE_TEST_USERNAME: smokeUser,
    SMOKE_TEST_PASSWORD: smokePassword,
    SMOKE_BASE_URL: baseUrl,
    SMOKE_ARTIFACTS_DIR: artifactsDir,
    // Local smoke runs do not upload receipts, but startup readiness is fail-closed
    // when the receipt scanner is explicitly unavailable. Use a deterministic clean
    // scanner shim unless the caller configured a real ClamAV command.
    COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED: process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED || "1",
    COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND: scannerCommand,
    COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON: scannerArgsJson,
    COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED: process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED || "1",
    COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS: process.env.COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS || "5000",
  });

  console.log("Smoke CI local: checking PostgreSQL connectivity...");
  await assertPostgresConnection(env, { context: "Smoke CI local" });
  if (resolvedServer.usedFallbackPort) {
    console.log(`Smoke CI local: port ${defaultPort} busy, using ${resolvedServer.port} instead.`);
  }

  await runNpm(["run", "verify:collection-amount-contract"], { env });
  await runNpm(["run", "verify:collection-pii-rollout-contract"], { env });
  await runNpm(["run", "verify:browser-storage-safety"], { env });
  await runNpm(["run", "verify:client-breakpoint-contract"], { env });
  await runNpm(["run", "verify:client-entry-shell-contract"], { env });
  await runNpm(["run", "verify:client-tsconfig-contract"], { env });
  await runNpm(["run", "verify:server-env-access-contract"], { env });
  await runNpm(["run", "verify:design-token-color-compatibility"], { env });
  await runNpm(["run", "verify:design-token-spacing"], { env });
  await runNpm(["run", "verify:db-schema-governance"], { env });
  await runNpm(["run", "test:db-integration"], { env });
  await runNpm(["run", "build"], { env });

  const serverSpawnSpec = validateSafeSpawnSpec(
    npmCommand,
    npmCliPath ? [npmCliPath, "run", "start:built"] : ["run", "start:built"],
  );
  const serverProcess = startManagedServerProcess(
    serverSpawnSpec.command,
    serverSpawnSpec.args,
    {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const serverLogStream = createWriteStream(serverLogPath, { flags: "w" });
  serverProcess.stdout?.pipe(serverLogStream);
  serverProcess.stderr?.pipe(serverLogStream);

  try {
    await waitForServer(baseUrl, {
      logPath: serverLogPath,
      serverProcess,
    });
    await runNpm(["run", "smoke:preflight"], { env });
    await runNpm(["run", "test:e2e:visual"], {
      env: {
        ...env,
        VISUAL_BASE_URL: baseUrl,
        VISUAL_ARTIFACTS_DIR: path.join(artifactsDir, "visual-layout"),
      },
    });
    await runNpm(["run", "test:e2e:a11y"], {
      env: {
        ...env,
        A11Y_BASE_URL: baseUrl,
      },
    });
    const adaptiveRateCooldownMs = readNonNegativeIntEnv("SMOKE_ADAPTIVE_RATE_COOLDOWN_MS", 12_000);
    if (adaptiveRateCooldownMs > 0) {
      console.log(
        `Smoke CI local: waiting ${adaptiveRateCooldownMs}ms for adaptive API buckets before smoke-ui.`,
      );
      await wait(adaptiveRateCooldownMs);
    }
    await runNpm(["run", "smoke:ui"], { env });
  } finally {
    await stopManagedServerProcess(serverProcess, { runCommand });
    serverLogStream.end();
  }

  console.log(`Smoke CI local run completed. Artifacts: ${artifactsDir}`);
};

run().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
