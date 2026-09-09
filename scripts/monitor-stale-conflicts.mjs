import process from "node:process";
import { captureStaleConflictSnapshot } from "./lib/stale-conflict-monitor.mjs";
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
const outputFile = String(process.env.MONITOR_OUTPUT_FILE || "").trim();

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

  await request("/api/auth/login", {
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
      const payload = await captureStaleConflictSnapshot({ request, baseUrl, outputFile });

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
