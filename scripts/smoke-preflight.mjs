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

const toCookieHeader = (setCookies) =>
  setCookies
    .map((cookie) => String(cookie || "").split(";")[0] || "")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .join("; ");

const request = async (path, init = {}) =>
  withTimeout(fetch(`${baseUrl}${path}`, init), `${init.method || "GET"} ${path}`);

const run = async () => {
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

  const setCookies = parseCookieValues(loginResponse.headers);
  const cookieHeader = toCookieHeader(setCookies);
  assert(cookieHeader.includes("sqr_auth="), "Smoke preflight login did not return sqr_auth cookie.");

  const authedMe = await request("/api/me", {
    headers: {
      cookie: cookieHeader,
    },
  });
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
    headers: {
      cookie: cookieHeader,
    },
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

  const postLogoutMe = await request("/api/me", {
    headers: {
      cookie: cookieHeader,
    },
  });
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
