import process from "node:process";
import "dotenv/config";

const baseUrl = String(
  process.env.MONITOR_BASE_URL
  || process.env.DRILL_BASE_URL
  || process.env.SMOKE_BASE_URL
  || "http://127.0.0.1:5000",
).trim();
const username = String(
  process.env.MONITOR_SUPERUSER_USERNAME
  || process.env.DRILL_SUPERUSER_USERNAME
  || process.env.SMOKE_TEST_USERNAME
  || "",
).trim();
const password = String(
  process.env.MONITOR_SUPERUSER_PASSWORD
  || process.env.DRILL_SUPERUSER_PASSWORD
  || process.env.SMOKE_TEST_PASSWORD
  || "",
).trim();
const loopMode = String(process.env.MONITOR_LOOP || "").trim() === "1";
const intervalMs = Math.max(
  5_000,
  Number.parseInt(String(process.env.MONITOR_INTERVAL_MS || "60000"), 10) || 60_000,
);
const requestTimeoutMs = Math.max(
  2_000,
  Number.parseInt(String(process.env.MONITOR_TIMEOUT_MS || "15000"), 10) || 15_000,
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${requestTimeoutMs}ms`)), requestTimeoutMs)),
  ]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const cookie = headers.get("set-cookie");
  return cookie ? [cookie] : [];
}

function parseSetCookie(cookieLine) {
  const [pair] = String(cookieLine || "").split(";");
  const separatorIndex = pair.indexOf("=");
  if (separatorIndex <= 0) {
    return null;
  }
  const name = pair.slice(0, separatorIndex).trim();
  const value = pair.slice(separatorIndex + 1).trim();
  if (!name) {
    return null;
  }
  return { name, value };
}

function buildCookieHeader(cookieJar) {
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function formatMonitorStatus(metrics) {
  const staleConflicts = Number(metrics.summary?.collectionRecordVersionConflicts24h || 0);
  const status429Count = Number(metrics.system?.status429Count || 0);
  const errorRate = Number(metrics.system?.errorRate || 0);
  const activeAlertCount = Number(metrics.system?.activeAlertCount || 0);

  const warnings = [];
  if (staleConflicts >= 20) warnings.push("stale_conflicts_high");
  if (status429Count >= 30) warnings.push("rate_limit_pressure_high");
  if (errorRate >= 0.05) warnings.push("error_rate_high");
  if (activeAlertCount >= 1) warnings.push("runtime_alerts_present");

  return {
    staleConflicts24h: staleConflicts,
    status429Count5s: status429Count,
    errorRate,
    activeAlertCount,
    warnings,
  };
}

async function run() {
  assert(baseUrl, "MONITOR_BASE_URL (or SMOKE_BASE_URL) is required.");
  assert(username, "MONITOR_SUPERUSER_USERNAME (or SMOKE_TEST_USERNAME) is required.");
  assert(password, "MONITOR_SUPERUSER_PASSWORD (or SMOKE_TEST_PASSWORD) is required.");

  const cookieJar = new Map();

  const request = async (path, init = {}, options = {}) => {
    const method = String(init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers || {});
    const cookieHeader = buildCookieHeader(cookieJar);
    if (cookieHeader) {
      headers.set("cookie", cookieHeader);
    }
    if (!headers.has("content-type") && init.body) {
      headers.set("content-type", "application/json");
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const csrfToken = cookieJar.get("sqr_csrf");
      if (csrfToken) {
        headers.set("x-csrf-token", csrfToken);
      }
    }

    const response = await withTimeout(
      fetch(`${baseUrl}${path}`, {
        ...init,
        method,
        headers,
      }),
      `${method} ${path}`,
    );

    for (const setCookie of getSetCookieHeaders(response.headers)) {
      const parsed = parseSetCookie(setCookie);
      if (!parsed) {
        continue;
      }
      if (parsed.value) {
        cookieJar.set(parsed.name, parsed.value);
      } else {
        cookieJar.delete(parsed.name);
      }
    }

    const bodyText = await response.text();
    let bodyJson = null;
    try {
      bodyJson = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      bodyJson = null;
    }

    if (!options.allowFailure && !response.ok) {
      throw new Error(
        [
          `${method} ${path} failed with ${response.status}.`,
          bodyJson?.message ? `Message: ${bodyJson.message}` : bodyText ? `Body: ${bodyText}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    return {
      status: response.status,
      json: bodyJson,
      text: bodyText,
    };
  };

  await request("/api/login", {
    method: "POST",
    body: JSON.stringify({
      username,
      password,
      fingerprint: "stale-conflict-monitor",
      pcName: "Stale Conflict Monitor",
      browser: "monitor-script",
    }),
  });

  try {
    do {
      const [summaryResponse, systemResponse] = await Promise.all([
        request("/api/analytics/summary"),
        request("/internal/system-health", {}, { allowFailure: true }),
      ]);

      const summary = summaryResponse.json || {};
      const system = systemResponse.status === 200 ? systemResponse.json : null;
      const status = formatMonitorStatus({ summary, system });

      const payload = {
        timestamp: new Date().toISOString(),
        baseUrl,
        summary: {
          collectionRecordVersionConflicts24h: Number(summary.collectionRecordVersionConflicts24h || 0),
          activeSessions: Number(summary.activeSessions || 0),
        },
        system: system
          ? {
              status429Count: Number(system.status429Count || 0),
              errorRate: Number(system.errorRate || 0),
              activeAlertCount: Number(system.activeAlertCount || 0),
            }
          : {
              status429Count: null,
              errorRate: null,
              activeAlertCount: null,
              note: "internal/system-health unavailable for current role/tab access",
            },
        status,
      };

      console.log(JSON.stringify(payload, null, 2));
      if (!loopMode) {
        break;
      }
      await sleep(intervalMs);
    } while (true);
  } finally {
    await request("/api/activity/logout", { method: "POST" }, { allowFailure: true });
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
