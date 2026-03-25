import process from "node:process";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import "dotenv/config";

const npmCliPath = String(process.env.npm_execpath || "").trim();
const npmCommand = npmCliPath ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";
const artifactsDir = path.resolve(
  process.cwd(),
  process.env.RELEASE_ARTIFACTS_DIR || "artifacts/release-readiness-local",
);
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

const waitForServer = async (url, timeoutMs = 120_000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) {
        return;
      }
    } catch {
      // keep polling until timeout
    }
    await sleep(2_000);
  }

  throw new Error(`Server did not become ready at ${url} within ${timeoutMs}ms`);
};

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
  const env = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: process.env.PORT || "5000",
    HOST: process.env.HOST || "127.0.0.1",
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
    SMOKE_ARTIFACTS_DIR: path.join(artifactsDir, "smoke-ui"),
    DRILL_BASE_URL: baseUrl,
    DRILL_SUPERUSER_USERNAME: smokeUser,
    DRILL_SUPERUSER_PASSWORD: smokePassword,
  };

  console.log("Release readiness: running fast regression gates...");
  await runNpm(["run", "verify:db-schema-governance"], { env });
  await runNpm(["run", "test:client"], { env });
  await runNpm(["run", "test:scripts"], { env });
  await runNpm(["run", "test:db-integration"], { env });
  await runNpm(["run", "test:routes"], { env });
  await runNpm(["run", "test:services"], { env });

  console.log("Release readiness: building runtime bundle...");
  await runNpm(["run", "build"], { env });
  await runNpm(["run", "verify:bundle-budgets"], { env });

  const serverProcess = spawn(
    npmCommand,
    npmCliPath ? [npmCliPath, "run", "start:built"] : ["run", "start:built"],
    {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const serverLogStream = createWriteStream(serverLogPath, { flags: "a" });
  serverProcess.stdout?.pipe(serverLogStream);
  serverProcess.stderr?.pipe(serverLogStream);

  try {
    await waitForServer(baseUrl);
    console.log("Release readiness: running smoke preflight + UI smoke...");
    await runNpm(["run", "smoke:preflight"], { env });
    await runNpm(["run", "smoke:ui"], { env });

    console.log("Release readiness: capturing collection performance baseline...");
    await runNpm(["run", "perf:collection:baseline"], { env });

    console.log("Release readiness: running backup integrity drill...");
    await runNpm(["run", "dr:drill"], { env });

    console.log("Release readiness: capturing stale-conflict and 429 monitor snapshot...");
    await runNpm(["run", "monitor:stale-conflicts"], {
      env: {
        ...env,
        MONITOR_OUTPUT_FILE: path.join(artifactsDir, "monitor-stale-conflicts.json"),
      },
    });
  } finally {
    await stopServer(serverProcess);
    serverLogStream.end();
  }

  console.log(`Release readiness local run completed. Artifacts: ${artifactsDir}`);
};

run().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
