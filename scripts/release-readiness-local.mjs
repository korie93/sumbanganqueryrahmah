import process from "node:process";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import "dotenv/config";
import { assertPostgresConnection } from "./lib/postgres-preflight.mjs";
import { resolveCollectionPiiReadinessConfig } from "./lib/collection-pii-readiness.mjs";
import { waitForServer } from "./lib/server-readiness.mjs";

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

const runCommandCapture = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || options.allowFailure) {
        resolve({
          code: code ?? 0,
          stderr,
          stdout,
        });
        return;
      }
      const captured = stderr.trim() || stdout.trim();
      reject(
        new Error(
          captured
            ? `${command} ${args.join(" ")} failed with exit code ${code}: ${captured}`
            : `${command} ${args.join(" ")} failed with exit code ${code}`,
        ),
      );
    });
  });

const runNpm = (args, options = {}) =>
  runCommand(
    npmCommand,
    npmCliPath ? [npmCliPath, ...args] : args,
    options,
  );

const runNpmCapture = (args, options = {}) =>
  runCommandCapture(
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
  const releaseBuildEnv = {
    ...env,
    // Bundle budgets should reflect the release artifact, not development-only branches.
    NODE_ENV: "production",
  };
  const collectionPiiReadiness = resolveCollectionPiiReadinessConfig(env, artifactsDir);

  console.log("Release readiness: checking PostgreSQL connectivity...");
  await assertPostgresConnection(env, { context: "Release readiness" });

  console.log("Release readiness: running fast regression gates...");
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
  await runNpm(["run", "test:client"], { env });
  await runNpm(["run", "test:scripts"], { env });
  await runNpm(["run", "test:db-integration"], { env });
  await runNpm(["run", "test:routes"], { env });
  await runNpm(["run", "test:services"], { env });

  if (collectionPiiReadiness.encryptionConfigured) {
    console.log("Release readiness: capturing collection PII status...");
    const statusResult = await runNpmCapture(["run", "collection:pii-status", "--", "--json"], { env });
    await writeFile(
      collectionPiiReadiness.statusArtifactPath,
      statusResult.stdout,
      "utf8",
    );

    console.log("Release readiness: capturing collection PII rollout readiness...");
    const rolloutReadinessResult = await runNpmCapture(
      ["run", "collection:rollout-readiness", "--", "--json"],
      { env },
    );
    await writeFile(
      collectionPiiReadiness.rolloutReadinessArtifactPath,
      rolloutReadinessResult.stdout,
      "utf8",
    );

    if (collectionPiiReadiness.verifySensitiveRetirement) {
      console.log("Release readiness: verifying staged retirement for sensitive collection PII...");
      await runNpm(["run", "collection:verify-pii-sensitive-retirement"], { env });
    }

    if (collectionPiiReadiness.retiredFieldsConfigured) {
      console.log("Release readiness: verifying configured retired collection PII fields...");
      await runNpm(["run", "collection:verify-pii-retired-fields"], { env });
    }

    if (collectionPiiReadiness.verifyFullRetirement) {
      console.log("Release readiness: verifying full collection PII plaintext retirement...");
      await runNpm(["run", "collection:verify-pii-full-retirement"], { env });
    }
  }

  console.log("Release readiness: building runtime bundle...");
  await runNpm(["run", "build"], { env: releaseBuildEnv });
  await runNpm(["run", "verify:bundle-budgets"], { env: releaseBuildEnv });

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
    await waitForServer(baseUrl, {
      logPath: serverLogPath,
      serverProcess,
    });
    console.log("Release readiness: running smoke preflight + visual layout contracts + UI smoke...");
    await runNpm(["run", "smoke:preflight"], { env });
    await runNpm(["run", "test:e2e:visual"], {
      env: {
        ...env,
        VISUAL_BASE_URL: baseUrl,
        VISUAL_ARTIFACTS_DIR: path.join(artifactsDir, "visual-layout"),
      },
    });
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
