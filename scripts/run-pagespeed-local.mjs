import process from "node:process";
import path from "node:path";
import { accessSync, copyFileSync, createWriteStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import {
  getLighthouseRuntimeErrorCode,
  isRetryableLighthouseRuntimeError,
  isUsableLighthouseReport,
  evaluateLighthouseThresholds,
  resolveLighthouseScoreThresholds,
  summarizeObservedWebVitalsFromLog,
  summarizeLighthouseReport,
} from "./lib/pagespeed-local.mjs";
import {
  resolveAvailableLoopbackPort,
  resolveManagedLoopbackBaseUrl,
} from "./lib/local-loopback-server.mjs";
import {
  startManagedServerProcess,
  stopManagedServerProcess,
} from "./lib/managed-server-process.mjs";
import { assertPostgresConnection } from "./lib/postgres-preflight.mjs";
import { waitForServer } from "./lib/server-readiness.mjs";

const smokeEnvPath = path.resolve(process.cwd(), ".env.smoke.local");
if (existsSync(smokeEnvPath)) {
  dotenv.config({ path: smokeEnvPath });
} else {
  dotenv.config();
}

const npmCliPath = String(process.env.npm_execpath || "").trim();
const npmCommand = npmCliPath ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm");
const lighthouseVersion = String(process.env.PAGESPEED_LIGHTHOUSE_VERSION || "13.0.3").trim();
const artifactsDir = path.resolve(process.cwd(), process.env.PAGESPEED_ARTIFACTS_DIR || "artifacts/pagespeed");
const serverLogPath = path.join(artifactsDir, "pagespeed-server.log");
const tempRootDir = path.join(artifactsDir, "tmp");
const maxAttempts = Math.max(1, Number.parseInt(String(process.env.PAGESPEED_MAX_ATTEMPTS || "3"), 10) || 3);
const settleDelayMs = Math.max(0, Number.parseInt(String(process.env.PAGESPEED_SETTLE_DELAY_MS || "2500"), 10) || 2500);
const retryDelayMs = Math.max(0, Number.parseInt(String(process.env.PAGESPEED_RETRY_DELAY_MS || "1500"), 10) || 1500);
const shouldReuseServer = String(process.env.PAGESPEED_REUSE_SERVER || "").trim().toLowerCase() === "true";
const shouldSkipBuild = String(process.env.PAGESPEED_SKIP_BUILD || "").trim().toLowerCase() === "true";
const includeLoginDesktop = String(process.env.PAGESPEED_INCLUDE_LOGIN_DESKTOP || "true").trim().toLowerCase() !== "false";
const enforceThresholds = String(process.env.PAGESPEED_ENFORCE_THRESHOLDS || "").trim().toLowerCase() === "true";
const scoreThresholds = resolveLighthouseScoreThresholds(process.env);
const shouldPrelaunchChrome = String(process.env.PAGESPEED_PRELAUNCH_CHROME || "true").trim().toLowerCase() !== "false";
const softFailRetryableFailures = String(
  process.env.PAGESPEED_SOFT_FAIL_RETRYABLE || (process.platform === "win32" ? "true" : "false"),
).trim().toLowerCase() === "true";
const chromeDebugHost = "127.0.0.1";
const chromeDebugPreferredPort = Math.max(
  1,
  Number.parseInt(String(process.env.PAGESPEED_CHROME_DEBUG_PORT || "9222"), 10) || 9222,
);
const chromeDebuggerTimeoutMs = Math.max(
  1000,
  Number.parseInt(String(process.env.PAGESPEED_CHROME_DEBUG_TIMEOUT_MS || "15000"), 10) || 15000,
);
const chromeDebuggerPollMs = 250;
const chromeOutputMaxChars = 6000;
const chromeShutdownGraceMs = 5000;
const defaultChromeFlags = process.platform === "win32"
  ? "--headless --disable-gpu --disable-dev-shm-usage"
  : "--headless=new --disable-gpu --disable-dev-shm-usage --no-sandbox --disable-setuid-sandbox";
const chromeFlags = String(process.env.PAGESPEED_CHROME_FLAGS || defaultChromeFlags).trim();
const chromeLogPath = path.join(artifactsDir, "pagespeed-chrome.log");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

function assertChromeExecutablePath(chromePath, source) {
  try {
    accessSync(chromePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PageSpeed Chrome executable from ${source} is not accessible: ${chromePath}. ${message}`);
  }
}

async function resolveChromeExecutablePath(env = process.env) {
  const explicitChromePath = String(env.PAGESPEED_CHROME_PATH || env.CHROME_PATH || "").trim();
  if (explicitChromePath) {
    assertChromeExecutablePath(explicitChromePath, env.PAGESPEED_CHROME_PATH ? "PAGESPEED_CHROME_PATH" : "CHROME_PATH");
    return explicitChromePath;
  }

  try {
    const { chromium } = await import("playwright");
    const playwrightChromePath = chromium.executablePath();
    if (playwrightChromePath) {
      assertChromeExecutablePath(playwrightChromePath, "Playwright Chromium");
      return playwrightChromePath;
    }
  } catch (error) {
    if (String(env.PAGESPEED_DEBUG_CHROME_DISCOVERY || "").trim().toLowerCase() === "true") {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[pagespeed] Playwright Chromium discovery failed; falling back to Lighthouse discovery: ${message}`);
    }
  }

  return "";
}

function parseChromeFlags(flags) {
  return String(flags || "")
    .trim()
    .split(/\s+/)
    .map((flag) => flag.trim())
    .filter(Boolean);
}

function buildPrelaunchedChromeArgs({ debugPort, userDataDir }) {
  const reservedPrefixes = [
    "--remote-debugging-address",
    "--remote-debugging-port",
    "--user-data-dir",
  ];

  const launchFlags = parseChromeFlags(chromeFlags)
    .filter((flag) => !reservedPrefixes.some((prefix) => flag === prefix || flag.startsWith(`${prefix}=`)));

  return [
    ...launchFlags,
    `--remote-debugging-address=${chromeDebugHost}`,
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ];
}

function createBoundedOutputBuffer() {
  let value = "";

  return {
    append(chunk) {
      value = `${value}${String(chunk)}`.slice(-chromeOutputMaxChars);
    },
    read() {
      return value.trim();
    },
  };
}

async function waitForChromeDebugger({ debugPort, exitState, outputBuffer }) {
  const deadline = Date.now() + chromeDebuggerTimeoutMs;
  let lastError = "not attempted";

  while (Date.now() < deadline) {
    if (exitState.exited) {
      throw new Error(
        `Chrome exited before the debugging endpoint became ready. ` +
          `Exit code: ${exitState.code ?? "n/a"}, signal: ${exitState.signal ?? "n/a"}. ` +
          `Chrome output: ${outputBuffer.read() || "(none)"}`,
      );
    }

    try {
      const response = await fetch(`http://${chromeDebugHost}:${debugPort}/json/version`);
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(chromeDebuggerPollMs);
  }

  throw new Error(
    `Timed out waiting ${chromeDebuggerTimeoutMs}ms for Chrome debugging endpoint ` +
      `on ${chromeDebugHost}:${debugPort}. Last error: ${lastError}. ` +
      `Chrome output: ${outputBuffer.read() || "(none)"}`,
  );
}

async function startChromeForLighthouse({ chromePath, env }) {
  if (!chromePath || !shouldPrelaunchChrome) {
    return null;
  }

  const debugPort = await resolveAvailableLoopbackPort({
    host: chromeDebugHost,
    preferredPort: chromeDebugPreferredPort,
    maxAttempts: 50,
  });
  const userDataDir = path.join(tempRootDir, `chrome-user-data-${process.pid}-${Date.now()}-${debugPort}`);
  await mkdir(userDataDir, { recursive: true });

  const chromeArgs = buildPrelaunchedChromeArgs({
    debugPort,
    userDataDir,
  });
  const outputBuffer = createBoundedOutputBuffer();
  const exitState = {
    exited: false,
    code: null,
    signal: null,
  };
  const logStream = createWriteStream(chromeLogPath, { flags: "a" });
  logStream.write(`\n[${new Date().toISOString()}] Launching Chrome: ${chromePath} ${chromeArgs.join(" ")}\n`);

  const child = spawn(chromePath, chromeArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    cwd: process.cwd(),
    env,
    detached: process.platform !== "win32",
  });

  const recordOutput = (chunk) => {
    outputBuffer.append(chunk);
    logStream.write(chunk);
  };

  child.stdout?.on("data", recordOutput);
  child.stderr?.on("data", recordOutput);
  child.once("error", (error) => {
    exitState.exited = true;
    exitState.code = "spawn-error";
    exitState.signal = null;
    outputBuffer.append(error.stack || error.message);
    logStream.write(`\n[${new Date().toISOString()}] Chrome spawn error: ${error.stack || error.message}\n`);
  });
  child.once("exit", (code, signal) => {
    exitState.exited = true;
    exitState.code = code;
    exitState.signal = signal;
    logStream.write(`\n[${new Date().toISOString()}] Chrome exited with code ${code ?? "n/a"} signal ${signal ?? "n/a"}\n`);
  });

  try {
    await waitForChromeDebugger({
      debugPort,
      exitState,
      outputBuffer,
    });
  } catch (error) {
    await stopChromeForLighthouse({
      child,
      logStream,
    });
    throw error;
  }

  console.log(`[pagespeed] Chrome debugger listening on ${chromeDebugHost}:${debugPort}`);

  return {
    child,
    debugPort,
    logStream,
    userDataDir,
  };
}

async function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return true;
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };

    child.once("exit", onExit);
  });
}

async function stopChromeForLighthouse(chromeRuntime) {
  if (!chromeRuntime?.child) {
    return;
  }

  const { child, logStream, userDataDir } = chromeRuntime;

  try {
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform === "win32" && child.pid) {
        await runCommand("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
          allowFailure: true,
          stdio: "ignore",
        });
      } else if (child.pid) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logStream.write(`\n[${new Date().toISOString()}] Chrome process-group SIGTERM failed: ${message}\n`);
          child.kill("SIGTERM");
        }

        const exited = await waitForChildExit(child, chromeShutdownGraceMs);
        if (!exited) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logStream.write(`\n[${new Date().toISOString()}] Chrome process-group SIGKILL failed: ${message}\n`);
            child.kill("SIGKILL");
          }
        }
      }
    }
  } finally {
    if (userDataDir) {
      try {
        await rm(userDataDir, { recursive: true, force: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logStream.write(`\n[${new Date().toISOString()}] Chrome profile cleanup failed: ${message}\n`);
      }
    }
    logStream.end();
  }
}

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

function buildLighthouseArgs(url, outputPath, preset, chromeDebugPort = null) {
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
    ...(chromeDebugPort
      ? [`--port=${chromeDebugPort}`]
      : [`--chrome-flags=${chromeFlags}`]),
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

function findLatestUsableReport(slugBase, excludedPaths = []) {
  const excluded = new Set(excludedPaths.map((value) => path.resolve(value)));
  const candidates = readdirSync(artifactsDir)
    .filter((fileName) => fileName.startsWith(slugBase) && fileName.endsWith(".json"))
    .map((fileName) => path.join(artifactsDir, fileName))
    .filter((filePath) => !excluded.has(path.resolve(filePath)))
    .map((filePath) => ({
      filePath,
      mtimeMs: statSync(filePath).mtimeMs,
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  for (const candidate of candidates) {
    try {
      const report = readLighthouseReport(candidate.filePath);
      if (!isUsableLighthouseReport(report)) {
        continue;
      }
      return {
        filePath: candidate.filePath,
        report,
      };
    } catch {
      // Ignore malformed or partially written files and keep scanning.
    }
  }

  return null;
}

function writeSummary(results, thresholdFailures = [], runtimeOptions = {}) {
  const summaryPath = path.join(artifactsDir, "pagespeed-local-summary.json");
  const markdownPath = path.join(artifactsDir, "pagespeed-local-summary.md");
  const overallStatus = results.some((result) => result.status === "failed")
    ? "failed"
    : results.some((result) => result.status === "soft-failed")
      ? "completed-with-retryable-failures"
      : "success";

  const payload = {
    overallStatus,
    generatedAt: new Date().toISOString(),
    maxAttempts,
    retryDelayMs,
    settleDelayMs,
    softFailRetryableFailures,
    chromeFlags,
    chromePath: runtimeOptions.chromePath || null,
    chromeDebugPort: runtimeOptions.chromeDebugPort || null,
    chromeLaunchMode: runtimeOptions.chromeLaunchMode || "lighthouse-managed",
    enforceThresholds,
    scoreThresholds,
    thresholdFailures,
    results: results.map((result) => ({
      slug: result.slug,
      url: result.url,
      preset: result.preset,
      status: result.status,
      attemptsUsed: result.attemptsUsed,
      reportPath: result.reportPath,
      runtimeErrorCode: result.runtimeErrorCode,
      summary: result.summary,
      fallbackReportPath: result.fallbackReportPath || null,
      fallbackSummary: result.fallbackSummary || null,
      observedWebVitals: result.observedWebVitals || null,
    })),
  };

  writeFileSync(summaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const lines = [
    `# Local PageSpeed Summary`,
    ``,
    `- Overall status: ${overallStatus}`,
    `- Generated at: ${payload.generatedAt}`,
    `- Max attempts: ${maxAttempts}`,
    `- Soft-fail retryable failures: ${softFailRetryableFailures ? "yes" : "no"}`,
    `- Score thresholds enforced: ${enforceThresholds ? "yes" : "no"}`,
    `- Score thresholds: performance ${scoreThresholds.performance}, accessibility ${scoreThresholds.accessibility}, best practices ${scoreThresholds.bestPractices}, SEO ${scoreThresholds.seo}`,
    `- Chrome flags: \`${chromeFlags}\``,
    `- Chrome launch mode: ${payload.chromeLaunchMode}`,
    `- Chrome path: ${payload.chromePath || "auto-discovery"}`,
    `- Chrome debug port: ${payload.chromeDebugPort || "n/a"}`,
    ``,
  ];

  if (thresholdFailures.length > 0) {
    lines.push(`## Score Threshold Failures`);
    for (const failure of thresholdFailures) {
      lines.push(`- ${failure.slug}: ${failure.message}`);
    }
    lines.push("");
  }

  for (const result of results) {
    lines.push(`## ${result.slug}`);
    lines.push(`- Status: ${result.status}`);
    lines.push(`- URL: ${result.url}`);
    lines.push(`- Attempts used: ${result.attemptsUsed}`);
    lines.push(`- Report: ${result.reportPath}`);
    if (result.runtimeErrorCode) {
      lines.push(`- Runtime error: ${result.runtimeErrorCode}`);
    }
    if (result.summary) {
      lines.push(`- Metrics: ${summarizeForConsole({ categories: {}, audits: {}, ...result.report })}`);
    }
    if (result.fallbackReportPath) {
      lines.push(`- Fallback report: ${result.fallbackReportPath}`);
      lines.push(
        `- Fallback metrics: perf ${result.fallbackSummary.performance ?? "n/a"}, a11y ${result.fallbackSummary.accessibility ?? "n/a"}, bp ${result.fallbackSummary.bestPractices ?? "n/a"}, seo ${result.fallbackSummary.seo ?? "n/a"}, FCP ${result.fallbackSummary.fcp}, LCP ${result.fallbackSummary.lcp}, TBT ${result.fallbackSummary.tbt}, CLS ${result.fallbackSummary.cls}`,
      );
    }
    if (result.observedWebVitals) {
      lines.push(
        `- Observed web vitals (${result.observedWebVitals.userAgentProfile}, ${result.observedWebVitals.source}): FCP ${result.observedWebVitals.fcp}, LCP ${result.observedWebVitals.lcp}, TTFB ${result.observedWebVitals.ttfb}, CLS ${result.observedWebVitals.cls}`,
      );
      if (result.observedWebVitals.capturedAt) {
        lines.push(`- Observed captured at: ${result.observedWebVitals.capturedAt}`);
      }
    }
    lines.push("");
  }

  writeFileSync(markdownPath, `${lines.join("\n")}\n`, "utf8");

  return {
    summaryPath,
    markdownPath,
    overallStatus,
  };
}

async function runAudit(audit, env, { chromeDebugPort = null } = {}) {
  const latestPath = path.join(artifactsDir, `${audit.slug}.json`);
  const slugBase = audit.slug.replace(/-latest$/, "");
  const attemptPaths = [];
  const auditStartedAt = new Date().toISOString();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptPath = path.join(artifactsDir, `${audit.slug}-attempt-${attempt}.json`);
    attemptPaths.push(attemptPath);
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

    const lighthouseExitCode = await runNpm(buildLighthouseArgs(audit.url, attemptPath, audit.preset, chromeDebugPort), {
      env: lighthouseEnv,
      allowFailure: true,
    });

    assert(
      existsSync(attemptPath),
      `Lighthouse did not produce an output file for ${audit.slug} attempt ${attempt}. ` +
        `Exit code: ${lighthouseExitCode}. Chrome path: ${lighthouseEnv.CHROME_PATH || "(auto-discovery)"}. ` +
        `Chrome debug port: ${chromeDebugPort || "(lighthouse-managed)"}.`,
    );

    const report = readLighthouseReport(attemptPath);
    const runtimeErrorCode = getLighthouseRuntimeErrorCode(report);

    if (!runtimeErrorCode) {
      copyFileSync(attemptPath, latestPath);
      console.log(`[pagespeed] ${audit.slug}: success on attempt ${attempt} (${summarizeForConsole(report)})`);
      return {
        slug: audit.slug,
        url: audit.url,
        preset: audit.preset,
        status: "success",
        attemptsUsed: attempt,
        reportPath: latestPath,
        report,
        summary: summarizeLighthouseReport(report),
        runtimeErrorCode: null,
      };
    }

    if (isRetryableLighthouseRuntimeError(report) && attempt < maxAttempts) {
      console.warn(
        `[pagespeed] ${audit.slug}: retrying after ${runtimeErrorCode} on attempt ${attempt}/${maxAttempts}.`,
      );
      await sleep(retryDelayMs);
      continue;
    }

    copyFileSync(attemptPath, latestPath);
    const fallback = findLatestUsableReport(slugBase, [latestPath, ...attemptPaths]);
    const result = {
      slug: audit.slug,
      url: audit.url,
      preset: audit.preset,
      status: "failed",
      attemptsUsed: attempt,
      reportPath: latestPath,
      report,
      summary: summarizeLighthouseReport(report),
      runtimeErrorCode,
      fallbackReportPath: fallback?.filePath || null,
      fallbackSummary: fallback ? summarizeLighthouseReport(fallback.report) : null,
      observedWebVitals: summarizeObservedWebVitalsFromLog(
        existsSync(serverLogPath) ? readFileSync(serverLogPath, "utf8") : "",
        {
          path: new URL(audit.url).pathname || "/",
          preset: audit.preset,
          since: auditStartedAt,
        },
      ),
    };

    if (softFailRetryableFailures && isRetryableLighthouseRuntimeError(report)) {
      const observedSummary = result.observedWebVitals
        ? ` observed FCP ${result.observedWebVitals.fcp}, LCP ${result.observedWebVitals.lcp}, TTFB ${result.observedWebVitals.ttfb}, CLS ${result.observedWebVitals.cls}.`
        : "";
      console.warn(
        `[pagespeed] ${audit.slug}: soft-failing after ${runtimeErrorCode}; fallback report ${fallback?.filePath || "not found"}.${observedSummary}`,
      );
      return {
        ...result,
        status: "soft-failed",
      };
    }

    console.error(
      `[pagespeed] ${audit.slug} failed with runtime error ${runtimeErrorCode} after ${attempt} attempt(s).`,
    );
    return result;
  }

  return {
    slug: audit.slug,
    url: audit.url,
    preset: audit.preset,
    status: "failed",
    attemptsUsed: maxAttempts,
    reportPath: latestPath,
    report: null,
    summary: null,
    runtimeErrorCode: "UNKNOWN",
  };
}

async function run() {
  await mkdir(artifactsDir, { recursive: true });
  await mkdir(tempRootDir, { recursive: true });

  const host = String(process.env.HOST || "127.0.0.1").trim() || "127.0.0.1";
  const defaultPort = String(process.env.PORT || "5000").trim() || "5000";
  const resolvedServer = await resolveManagedLoopbackBaseUrl({
    configuredBaseUrl: process.env.PAGESPEED_BASE_URL || process.env.PUBLIC_APP_URL || process.env.SMOKE_BASE_URL || `http://${host}:${defaultPort}`,
    host,
    preferredPort: defaultPort,
    allowPortFallback: !shouldReuseServer,
  });
  const baseUrl = resolvedServer.baseUrl;
  const chromePath = await resolveChromeExecutablePath(process.env);
  if (chromePath) {
    console.log(`[pagespeed] using Chrome executable: ${chromePath}`);
  }

  const env = {
    ...process.env,
    ...(chromePath
      ? {
          CHROME_PATH: chromePath,
          PAGESPEED_CHROME_PATH: chromePath,
        }
      : {}),
    NODE_ENV: process.env.NODE_ENV || "development",
    HOST: host,
    PORT: String(resolvedServer.port),
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || baseUrl,
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS || baseUrl,
    SESSION_SECRET: process.env.SESSION_SECRET || "sqr-pagespeed-session-secret-32-bytes-minimum",
    PG_HOST: process.env.PG_HOST || "127.0.0.1",
    PG_PORT: process.env.PG_PORT || "5432",
    PG_USER: String(process.env.PG_USER || "").trim(),
    PG_PASSWORD: String(process.env.PG_PASSWORD || "").trim(),
    PG_DATABASE: String(process.env.PG_DATABASE || "").trim(),
  };

  assert(env.PG_USER, "PG_USER is required for perf:pagespeed:local. Put it in .env.smoke.local or export it in your shell.");
  assert(env.PG_PASSWORD, "PG_PASSWORD is required for perf:pagespeed:local. Put it in .env.smoke.local or export it in your shell.");
  assert(env.PG_DATABASE, "PG_DATABASE is required for perf:pagespeed:local. Put it in .env.smoke.local or export it in your shell.");

  if (!shouldReuseServer) {
    console.log("Pagespeed local: checking PostgreSQL connectivity...");
    await assertPostgresConnection(env, { context: "Pagespeed local" });
    if (resolvedServer.usedFallbackPort) {
      console.log(`Pagespeed local: port ${defaultPort} busy, using ${resolvedServer.port} instead.`);
    }
  }

  if (!shouldReuseServer && !shouldSkipBuild) {
    await runNpm(["run", "build"], { env });
  }

  let serverProcess = null;
  let serverLogStream = null;
  let chromeRuntime = null;

  try {
    if (!shouldReuseServer) {
      serverProcess = startManagedServerProcess(
        npmCommand,
        npmCliPath ? [npmCliPath, "run", "start:built"] : ["run", "start:built"],
        {
          cwd: process.cwd(),
          env,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      serverLogStream = createWriteStream(serverLogPath, { flags: "w" });
      serverProcess.stdout?.pipe(serverLogStream);
      serverProcess.stderr?.pipe(serverLogStream);

      await waitForServer(baseUrl, {
        logPath: serverLogPath,
        serverProcess,
      });
      await sleep(settleDelayMs);
    }

    chromeRuntime = await startChromeForLighthouse({
      chromePath,
      env,
    });

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

    const results = [];

    for (const audit of audits) {
      results.push(await runAudit(audit, env, {
        chromeDebugPort: chromeRuntime?.debugPort || null,
      }));
    }

    const thresholdFailures = results.flatMap((result) => {
      if (result.status !== "success") {
        return [];
      }

      return evaluateLighthouseThresholds(result.summary, scoreThresholds).map((failure) => ({
        ...failure,
        slug: result.slug,
        url: result.url,
      }));
    });
    const summaryArtifacts = writeSummary(results, thresholdFailures, {
      chromePath,
      chromeDebugPort: chromeRuntime?.debugPort || null,
      chromeLaunchMode: chromeRuntime ? "prelaunched-debug-port" : "lighthouse-managed",
    });
    console.log(`[pagespeed] complete. Reports saved in ${artifactsDir}`);
    console.log(`[pagespeed] summary: ${summaryArtifacts.summaryPath}`);

    if (summaryArtifacts.overallStatus === "failed") {
      throw new Error(
        `Local PageSpeed completed with hard failures. See ${summaryArtifacts.summaryPath} for details.`,
      );
    }

    if (enforceThresholds && thresholdFailures.length > 0) {
      throw new Error(
        `Local PageSpeed score thresholds failed. See ${summaryArtifacts.summaryPath} for details.`,
      );
    }
  } finally {
    await stopChromeForLighthouse(chromeRuntime);
    await stopManagedServerProcess(serverProcess, { runCommand });
    serverLogStream?.end();
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
