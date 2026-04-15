import process from "node:process";
import { performLoginWithOptionalTwoFactor } from "./lib/smoke-two-factor.mjs";

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";
const username = String(process.env.SMOKE_TEST_USERNAME || "").trim();
const password = String(process.env.SMOKE_TEST_PASSWORD || "").trim();
const twoFactorSecret = String(process.env.SMOKE_TEST_TWO_FACTOR_SECRET || "").trim();
const requestTimeoutMs = Number(process.env.SMOKE_PREFLIGHT_REQUEST_TIMEOUT_MS || 10_000);

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async (promise, label) => {
  const timeout = sleep(requestTimeoutMs).then(() => {
    throw new Error(`${label} timed out after ${requestTimeoutMs}ms`);
  });
  return Promise.race([promise, timeout]);
};

const parseCookieValues = (headers) => {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
};

const parseSetCookie = (cookieLine) => {
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
};

const buildCookieHeader = (cookieJar) =>
  Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

const run = async () => {
  const cookieJar = new Map();
  const request = async (path, init = {}, options = {}) => {
    const method = String(init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers || {});
    const cookieHeader = buildCookieHeader(cookieJar);
    if (cookieHeader && !headers.has("cookie")) {
      headers.set("cookie", cookieHeader);
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !headers.has("x-csrf-token")) {
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

    for (const setCookie of parseCookieValues(response.headers)) {
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
      ok: response.ok,
      status: response.status,
      headers: response.headers,
      text: bodyText,
      json: bodyJson,
    };
  };

  const liveHealth = await request("/api/health/live");
  assert(
    liveHealth.ok && liveHealth.json?.live === true,
    `GET /api/health/live should report a live process, received ${liveHealth.status}`,
  );

  const readyHealth = await request("/api/health/ready");
  assert(
    readyHealth.ok && readyHealth.json?.ready === true,
    [
      "GET /api/health/ready should report a ready application.",
      `Status: ${readyHealth.status}`,
      `Startup check: ${String(readyHealth.json?.checks?.startup || "(missing)")}`,
      `Database check: ${String(readyHealth.json?.checks?.database || "(missing)")}`,
    ].join("\n"),
  );

  const home = await request("/");
  assert(home.ok, `GET / should be reachable, received ${home.status}`);

  const unauthMe = await request("/api/me", {}, { allowFailure: true });
  assert(
    unauthMe.status === 401,
    `GET /api/me without cookies should return 401, received ${unauthMe.status}`,
  );

  if (!username || !password) {
    console.log("Smoke preflight: credentials not configured; skipped authenticated checks.");
    return;
  }

  const loginAttempt = await performLoginWithOptionalTwoFactor({
    request,
    username,
    password,
    fingerprint: "smoke-preflight",
    pcName: "CI Preflight",
    browser: "smoke-preflight",
    twoFactorSecret,
  });
  const loginResponse = loginAttempt.finalResponse;
  const loginPayload = loginResponse.json;
  assert(
    loginResponse.ok,
    [
      "Smoke preflight login failed.",
      `POST /api/login status: ${loginResponse.status}`,
      `POST /api/login message: ${String(loginPayload?.message || "(none)")}`,
    ].join("\n"),
  );

  assert(cookieJar.has("sqr_auth"), "Smoke preflight login did not return sqr_auth cookie.");
  assert(cookieJar.has("sqr_csrf"), "Smoke preflight login did not return sqr_csrf cookie.");

  const authedMe = await request("/api/me");
  assert(
    authedMe.ok && Boolean(authedMe.json?.user),
    [
      "Smoke preflight /api/me check failed after login.",
      `GET /api/me status: ${authedMe.status}`,
      `GET /api/me message: ${String(authedMe.json?.message || "(none)")}`,
    ].join("\n"),
  );

  const logoutResponse = await request("/api/activity/logout", {
    method: "POST",
  });
  assert(
    logoutResponse.ok,
    [
      "Smoke preflight logout failed.",
      `POST /api/activity/logout status: ${logoutResponse.status}`,
      `POST /api/activity/logout message: ${String(logoutResponse.json?.message || "(none)")}`,
    ].join("\n"),
  );

  const postLogoutMe = await request("/api/me", {}, { allowFailure: true });
  assert(
    postLogoutMe.status === 401,
    `GET /api/me after preflight logout should return 401, received ${postLogoutMe.status}`,
  );

  console.log("Smoke preflight checks passed.");
};

run().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
