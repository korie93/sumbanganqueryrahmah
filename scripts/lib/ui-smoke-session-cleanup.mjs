const MAX_CLEANUP_TIMEOUT_MS = 15_000;

function cleanupTimeout() {
  return new Error("Smoke session cleanup timed out.");
}

function isLiveCookie(cookie) {
  return typeof cookie?.value === "string" && cookie.value.length > 0
    && (cookie.expires === -1 || (Number.isFinite(cookie.expires) && cookie.expires * 1000 > Date.now()));
}

// End only the session already held by this isolated browser context. The
// endpoint derives its activity from the auth cookie; no account/activity IDs,
// replacement login or administrative session operations are involved.
export async function cleanupSmokeSession({ context, baseUrl, timeoutMs = 5_000 }) {
  if (!context) return { status: "skipped", reason: "no-context" };

  let origin;
  try {
    const base = new URL(baseUrl);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password
      || base.pathname !== "/" || base.search || base.hash) {
      throw new Error();
    }
    origin = base.origin;
  } catch {
    throw new Error("Smoke session cleanup requires an HTTP(S) origin without credentials, path, query or fragment.");
  }

  const totalTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.min(MAX_CLEANUP_TIMEOUT_MS, Math.max(1, Math.trunc(timeoutMs)))
    : 5_000;
  const deadline = Date.now() + totalTimeoutMs;
  const logoutUrl = `${origin}/api/activity/logout`;
  let deadlineTimer;

  const cleanup = async () => {
    let cookies;
    try {
      cookies = await context.cookies(logoutUrl);
    } catch {
      throw new Error("Smoke session cleanup could not read its browser cookies.");
    }
    if (Date.now() >= deadline) throw cleanupTimeout();
    const authCookie = cookies.find((cookie) => cookie.name === "sqr_auth" && isLiveCookie(cookie));
    if (!authCookie) return { status: "skipped", reason: "no-auth-cookie" };

    const csrfCookie = cookies.find((cookie) => cookie.name === "sqr_csrf" && isLiveCookie(cookie));
    if (!csrfCookie || !/^[0-9a-f]{64}$/i.test(csrfCookie.value)) {
      throw new Error("Smoke session cleanup requires its existing CSRF cookie.");
    }

    let response;
    try {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw cleanupTimeout();
      response = await context.request.fetch(logoutUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Origin: origin,
          Referer: `${origin}/`,
          "X-CSRF-Token": csrfCookie.value,
        },
        failOnStatusCode: false,
        maxRedirects: 0,
        maxRetries: 0,
        timeout: remainingMs,
      });
    } catch (error) {
      if (Date.now() >= deadline || error?.name === "TimeoutError") throw cleanupTimeout();
      // API errors can contain URLs, tokens or response bodies. Keep the
      // diagnostic static and let the caller retain the original smoke failure.
      throw new Error("Smoke session cleanup request failed.");
    }
    if (Date.now() >= deadline) throw cleanupTimeout();

    const status = response.status();
    if (status === 401) return { status: "skipped", reason: "unauthenticated" };
    if (status !== 200) {
      if (Number.isInteger(status) && status >= 100 && status <= 599) {
        throw new Error(`Smoke session cleanup returned HTTP ${status}.`);
      }
      throw new Error("Smoke session cleanup received an unexpected response.");
    }
    return { status: "logged-out" };
  };

  try {
    return await Promise.race([
      cleanup(),
      new Promise((_, reject) => {
        deadlineTimer = setTimeout(() => reject(cleanupTimeout()), totalTimeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(deadlineTimer);
  }
}
