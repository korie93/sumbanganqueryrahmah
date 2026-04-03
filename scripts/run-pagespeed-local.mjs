import process from "node:process";
import path from "node:path";
import { copyFileSync, createWriteStream, existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import dotenv from "dotenv";
import {
  getLighthouseRuntimeErrorCode,
  isRetryableLighthouseRuntimeError,
  summarizeLighthouseReport,
} from "./lib/pagespeed-local.mjs";

const smokeEnvPath = path.resolve(process.cwd(), ".env.smoke.local");
if (existsSync(smokeEnvPath)) {
  dotenv.config({ path: smokeEnvPath });
} else {
  dotenv.config();
}

const npmCliPath = String(process.env.npm_execpath || "").trim();
const npmCommand = npmCliPath ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
const lighthouseVersion = String(process.env.PAGESPEED_LIGHTHOUSE_VERSION || "13.0.3").trim();
const baseUrl = String(process.env.PAGESPEED_BASE_URL || process.env.PUBLIC_APP_URL || process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000").trim();
const artifactsDir = path.resolve(process.cwd(), process.env.PAGESPEED_ARTIFACTS_DIR || "artifacts/pagespeed");
const serverLogPath = path.join(artifactsDir, "pagespeed-server.log");
const tempRootDir = path.join(artifactsDir, "tmp");
const maxAttempts = Math.max(1, Number.parseInt(String(process.env.PAGESPEED_MAX_ATTEMPTS || "3"), 10) || 3);
const settleDelayMs = Math.max(0, Number.parseInt(String(process.env.PAGESPEED_SETTLE_DELAY_MS || "2500"), 10) || 2500);
const retryDelayMs = Math.max(0, Number.parseInt(String(process.env.PAGESPEED_RETRY_DELAY_MS || "1500"), 10) || 1500);
const shouldReuseServer = String(process.env.PAGESPEED_REUSE_SERVER || "").trim().toLowerCase() === "true";
const shouldSkipBuild = String(process.env.PAGESPEED_SKIP_BUILD || "").trim().toLowerCase() === "true";
const includeLoginDesktop = String(process.env.PAGESPEED_INCLUDE_LOGIN_DESKTOP || "true").trim().toLowerCase() !== "false";
const defaultChromeFlags = process.platform === "win32"
  ? "--headless --disable-gpu --disable-dev-shm-usage"
  : "--headless=new --disable-gpu --disable-dev-shm-usage";
const chromeFlags = String(process.env.PAGESPEED_CHROME_FLAGS || defaultChromeFlags).trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      // Keep polling until timeout.
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

function buildLighthouseArgs(url, outputPath, preset) {
  return [
    "exec",
    "--yes",
    `--package=lighthouse@${lighthouseVersion}`,
    "--",
    "lighthouse",
    url,
    "--quiet",
    "--output=json",
    `--output-path=${outputPath}`,
    "--only-categories=performance,accessibility,best-practices,seo",
    `--preset=${preset}`,
    `--chrome-flags=${chromeFlags}`,
  ];
}

function readLighthouseReport(reportPath) {
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

function summarizeForConsole(report) {
  const summary = summarizeLighthouseReport(report);
  const parts = [];

  if (summary.performance !== null) {
    parts.push(`perf ${summary.performance}`);
  }
  if (summary.accessibility !== null) {
    parts.push(`a11y ${summary.accessibility}`);
  }
  if (summary.bestPractices !== null) {
    parts.push(`bp ${summary.bestPractices}`);
  }
  if (summary.seo !== null) {
    parts.push(`seo ${summary.seo}`);
  }

  parts.push(`FCP ${summary.fcp}`);
  parts.push(`LCP ${summary.lcp}`);
  parts.push(`TBT ${summary.tbt}`);
  parts.push(`CLS ${summary.cls}`);

  return parts.join(", ");
}

async function runAudit(audit, env) {
  const latestPath = path.join(artifactsDir, `${audit.slug}.json`);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptPath = path.join(artifactsDir, `${audit.slug}-attempt-${attempt}.json`);
    const attemptTempDir = path.join(tempRootDir, `${audit.slug}-attempt-${attempt}`);
    await mkdir(attemptTempDir, { recursive: true });
    console.log(`[pagespeed] ${audit.slug}: attempt ${attempt}/${maxAttempts}`);

    try {
      await fetch(audit.url, { redirect: "manual" });
    } catch {
      // Lighthouse will report a real connectivity failure if the route is still unavailable.
    }

    const lighthouseEnv = {
      ...env,
      TMP: attemptTempDir,
      TEMP: attemptTempDir,
      TMPDIR: attemptTempDir,
    };

    await runNpm(buildLighthouseArgs(audit.url, attemptPath, audit.preset), {
      env: lighthouseEnv,
      allowFailure: true,
    });

    assert(existsSync(attemptPath), `Lighthouse did not produce an output file for ${audit.slug} attempt ${attempt}.`);

    const report = readLighthouseReport(attemptPath);
    const runtimeErrorCode = getLighthouseRuntimeErrorCode(report);

    if (!runtimeErrorCode) {
      copyFileSync(attemptPath, latestPath);
      console.log(`[pagespeed] ${audit.slug}: success on attempt ${attempt} (${summarizeForConsole(report)})`);
      return report;
    }

    if (isRetryableLighthouseRuntimeError(report) && attempt < maxAttempts) {
      console.warn(
        `[pagespeed] ${audit.slug}: retrying after ${runtimeErrorCode} on attempt ${attempt}/${maxAttempts}.`,
      );
      await sleep(retryDelayMs);
      continue;
    }

    copyFileSync(attemptPath, latestPath);
    throw new Error(
      `[pagespeed] ${audit.slug} failed with runtime error ${runtimeErrorCode} after ${attempt} attempt(s).`,
    );
  }

  throw new Error(`[pagespeed] ${audit.slug} exhausted ${maxAttempts} attempts without a valid report.`);
}

async function run() {
  await mkdir(artifactsDir, { recursive: true });
  await mkdir(tempRootDir, { recursive: true });

  const host = String(process.env.HOST || "127.0.0.1").trim() || "127.0.0.1";
  const port = String(process.env.PORT || "5000").trim() || "5000";
  const env = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || "development",
    HOST: host,
    PORT: port,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || baseUrl,
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS || baseUrl,
    SESSION_SECRET: process.env.SESSION_SECRET || "ci-session-secret",
    PG_HOST: process.env.PG_HOST || "127.0.0.1",
    PG_PORT: process.env.PG_PORT || "5432",
    PG_USER: String(process.env.PG_USER || "").trim(),
    PG_PASSWORD: String(process.env.PG_PASSWORD || "").trim(),
    PG_DATABASE: String(process.env.PG_DATABASE || "").trim(),
  };

  assert(env.PG_USER, "PG_USER is required for perf:pagespeed:local. Put it in .env.smoke.local or export it in your shell.");
  assert(env.PG_PASSWORD, "PG_PASSWORD is required for perf:pagespeed:local. Put it in .env.smoke.local or export it in your shell.");
  assert(env.PG_DATABASE, "PG_DATABASE is required for perf:pagespeed:local. Put it in .env.smoke.local or export it in your shell.");

  if (!shouldReuseServer && !shouldSkipBuild) {
    await runNpm(["run", "build"], { env });
  }

  let serverProcess = null;
  let serverLogStream = null;

  try {
    if (!shouldReuseServer) {
      serverProcess = spawn(
        npmCommand,
        npmCliPath ? [npmCliPath, "run", "start:built"] : ["run", "start:built"],
        {
          cwd: process.cwd(),
          env,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      serverLogStream = createWriteStream(serverLogPath, { flags: "a" });
      serverProcess.stdout?.pipe(serverLogStream);
      serverProcess.stderr?.pipe(serverLogStream);

      await waitForServer(baseUrl);
      await sleep(settleDelayMs);
    }

    const audits = [
      {
        slug: "local-home-mobile-latest",
        url: `${baseUrl}/`,
        preset: "perf",
      },
      {
        slug: "local-login-mobile-latest",
        url: `${baseUrl}/login`,
        preset: "perf",
      },
      ...(includeLoginDesktop
        ? [
          {
            slug: "local-login-desktop-latest",
            url: `${baseUrl}/login`,
            preset: "desktop",
          },
        ]
        : []),
    ];

    for (const audit of audits) {
      await runAudit(audit, env);
    }

    console.log(`[pagespeed] complete. Reports saved in ${artifactsDir}`);
  } finally {
    await stopServer(serverProcess);
    serverLogStream?.end();
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
