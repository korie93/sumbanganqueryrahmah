import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const DEFAULT_BASE_URL = "http://127.0.0.1:5000";
const DEFAULT_PATH = "/api/health/live";
const DEFAULT_REQUESTS = 50;
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_EXPECTED_STATUS = "200";

export function parsePositiveInteger(value, fallback, name) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function parseExpectedStatuses(value = DEFAULT_EXPECTED_STATUS) {
  const statuses = String(value || "")
    .split(",")
    .map((status) => status.trim())
    .filter(Boolean)
    .map((status) => Number(status));

  if (!statuses.length || statuses.some((status) => !Number.isInteger(status) || status < 100 || status > 599)) {
    throw new Error("LOAD_SMOKE_EXPECT_STATUS must contain valid HTTP status codes.");
  }

  return new Set(statuses);
}

export function summarizeLatencies(samples) {
  if (!samples.length) {
    return {
      min: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      max: 0,
    };
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const percentile = (percent) => {
    const index = Math.min(sorted.length - 1, Math.ceil((percent / 100) * sorted.length) - 1);
    return Number(sorted[index].toFixed(2));
  };

  return {
    min: Number(sorted[0].toFixed(2)),
    p50: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

export function buildLoadSmokeOptions(env = process.env) {
  const baseUrl = String(env.LOAD_SMOKE_BASE_URL || env.SMOKE_BASE_URL || env.PUBLIC_APP_URL || DEFAULT_BASE_URL).trim();
  const pathName = String(env.LOAD_SMOKE_PATH || DEFAULT_PATH).trim();
  const requestCount = parsePositiveInteger(env.LOAD_SMOKE_REQUESTS, DEFAULT_REQUESTS, "LOAD_SMOKE_REQUESTS");
  const concurrency = Math.min(
    requestCount,
    parsePositiveInteger(env.LOAD_SMOKE_CONCURRENCY, DEFAULT_CONCURRENCY, "LOAD_SMOKE_CONCURRENCY"),
  );
  const timeoutMs = parsePositiveInteger(env.LOAD_SMOKE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, "LOAD_SMOKE_TIMEOUT_MS");
  const expectedStatuses = parseExpectedStatuses(env.LOAD_SMOKE_EXPECT_STATUS || DEFAULT_EXPECTED_STATUS);
  const method = String(env.LOAD_SMOKE_METHOD || "GET").trim().toUpperCase();
  const body = env.LOAD_SMOKE_BODY === undefined ? undefined : String(env.LOAD_SMOKE_BODY);

  return {
    body,
    concurrency,
    expectedStatuses,
    method,
    requestCount,
    timeoutMs,
    url: new URL(pathName, baseUrl).toString(),
  };
}

export async function runLoadSmoke(options) {
  const statusCounts = new Map();
  const errors = [];
  const latencies = [];
  let nextRequestIndex = 0;

  async function runOneRequest() {
    const requestIndex = nextRequestIndex;
    nextRequestIndex += 1;
    if (requestIndex >= options.requestCount) {
      return false;
    }

    const startedAt = performance.now();
    try {
      const response = await fetch(options.url, {
        body: options.body,
        headers: {
          "user-agent": "SQR-load-smoke/1.0",
          ...(options.body ? { "content-type": "application/json" } : {}),
        },
        method: options.method,
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      await response.arrayBuffer();
      const elapsedMs = performance.now() - startedAt;
      latencies.push(elapsedMs);
      statusCounts.set(response.status, (statusCounts.get(response.status) || 0) + 1);
      if (!options.expectedStatuses.has(response.status)) {
        errors.push(`request ${requestIndex + 1} returned ${response.status}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`request ${requestIndex + 1} failed: ${message}`);
    }

    return true;
  }

  await Promise.all(Array.from({ length: options.concurrency }, async () => {
    while (await runOneRequest()) {
      // Keep each worker pulling until the shared request counter is exhausted.
    }
  }));

  return {
    errors,
    latencyMs: summarizeLatencies(latencies),
    requestCount: options.requestCount,
    statusCounts: Object.fromEntries(
      Array.from(statusCounts.entries()).sort(([left], [right]) => left - right),
    ),
  };
}

function formatSummary(summary) {
  return JSON.stringify(summary, null, 2);
}

async function main() {
  const options = buildLoadSmokeOptions();
  const startedAt = performance.now();
  const summary = await runLoadSmoke(options);
  const elapsedMs = Number((performance.now() - startedAt).toFixed(2));
  const report = {
    ...summary,
    elapsedMs,
    target: {
      concurrency: options.concurrency,
      method: options.method,
      requestCount: options.requestCount,
      timeoutMs: options.timeoutMs,
      url: options.url,
    },
  };

  process.stdout.write(`${formatSummary(report)}\n`);
  if (summary.errors.length) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main();
}
