import process from "node:process";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import "dotenv/config";
import { resolveManagedLoopbackBaseUrl } from "./lib/local-loopback-server.mjs";
import { assertPostgresConnection } from "./lib/postgres-preflight.mjs";
import { waitForServer } from "./lib/server-readiness.mjs";

const npmCliPath = String(process.env.npm_execpath || "").trim();
const npmCommand = npmCliPath ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
const artifactsDir = path.resolve(process.cwd(), process.env.SMOKE_ARTIFACTS_DIR || "artifacts/smoke-ui-local");
const serverLogPath = path.join(artifactsDir, "server.log");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runCommand = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio || "inherit",
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
    });

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

const stopServer = async (serverProcess) => {
  if (!serverProcess || serverProcess.killed) {
    return;
  }

  if (process.platform === "win32") {
    await runCommand("taskkill", ["/pid", String(serverProcess.pid), "/t", "/f"], {
      stdio: "ignore",
      allowFailure: true,
    });
    return;
  }

  try {
    serverProcess.kill("SIGTERM");
  } catch {
    return;
  }

  await Promise.race([
    once(serverProcess, "exit"),
    sleep(5_000),
  ]);

  if (!serverProcess.killed) {
    try {
      serverProcess.kill("SIGKILL");
    } catch {
      // no-op
    }
  }
};

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
  const env = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: String(resolvedServer.port),
    HOST: host,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || baseUrl,
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS || baseUrl,
    SESSION_SECRET: process.env.SESSION_SECRET || "ci-session-secret",
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
  };

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

  const serverProcess = spawn(
    npmCommand,
    npmCliPath ? [npmCliPath, "run", "start:built"] : ["run", "start:built"],
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
    await runNpm(["run", "smoke:ui"], { env });
  } finally {
    await stopServer(serverProcess);
    serverLogStream.end();
  }

  console.log(`Smoke CI local run completed. Artifacts: ${artifactsDir}`);
};

run().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
