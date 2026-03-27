import process from "node:process";

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";
const username = String(process.env.SMOKE_TEST_USERNAME || "").trim();
const password = String(process.env.SMOKE_TEST_PASSWORD || "").trim();
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

const readJsonSafely = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
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
  const request = async (path, init = {}) => {
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

    return response;
  };

  const liveHealth = await request("/api/health/live");
  const livePayload = await readJsonSafely(liveHealth);
  assert(
    liveHealth.ok && livePayload?.live === true,
    `GET /api/health/live should report a live process, received ${liveHealth.status}`,
  );

  const readyHealth = await request("/api/health/ready");
  const readyPayload = await readJsonSafely(readyHealth);
  assert(
    readyHealth.ok && readyPayload?.ready === true,
    [
      "GET /api/health/ready should report a ready application.",
      `Status: ${readyHealth.status}`,
      `Startup check: ${String(readyPayload?.checks?.startup || "(missing)")}`,
      `Database check: ${String(readyPayload?.checks?.database || "(missing)")}`,
    ].join("\n"),
  );

  const home = await request("/");
  assert(home.ok, `GET / should be reachable, received ${home.status}`);

  const unauthMe = await request("/api/me");
  assert(
    unauthMe.status === 401,
    `GET /api/me without cookies should return 401, received ${unauthMe.status}`,
  );

  if (!username || !password) {
    console.log("Smoke preflight: credentials not configured; skipped authenticated checks.");
    return;
  }

  const loginResponse = await request("/api/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      username,
      password,
      fingerprint: "smoke-preflight",
      pcName: "CI Preflight",
      browser: "smoke-preflight",
    }),
  });
  const loginPayload = await readJsonSafely(loginResponse);
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
  const authedPayload = await readJsonSafely(authedMe);
  assert(
    authedMe.ok && Boolean(authedPayload?.user),
    [
      "Smoke preflight /api/me check failed after login.",
      `GET /api/me status: ${authedMe.status}`,
      `GET /api/me message: ${String(authedPayload?.message || "(none)")}`,
    ].join("\n"),
  );

  const logoutResponse = await request("/api/activity/logout", {
    method: "POST",
  });
  const logoutPayload = await readJsonSafely(logoutResponse);
  assert(
    logoutResponse.ok,
    [
      "Smoke preflight logout failed.",
      `POST /api/activity/logout status: ${logoutResponse.status}`,
      `POST /api/activity/logout message: ${String(logoutPayload?.message || "(none)")}`,
    ].join("\n"),
  );

  const postLogoutMe = await request("/api/me");
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
