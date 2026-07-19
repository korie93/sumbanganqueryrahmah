import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  createCsrfProtectionMiddleware,
  rotateCsrfTokenAfterPrivilegeEscalation,
} from "../csrf";
import {
  AUTH_SESSION_CSRF_COOKIE_NAME,
  AUTH_SESSION_CSRF_HEADER_NAME,
} from "../../auth/session-cookie";
import { logger } from "../../lib/logger";
import { startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";

const VALID_CSRF_TOKEN = "a".repeat(64);
const ALLOWED_ORIGIN = "http://127.0.0.1:5000";

function createCsrfTestApp() {
  const app = express();
  app.use(express.json());
  app.use(
    createCsrfProtectionMiddleware({
      allowedOrigins: [ALLOWED_ORIGIN],
    }),
  );
  for (const method of ["post", "put", "patch", "delete"] as const) {
    app[method]("/api/mutate", (_req, res) => {
      res.json({ ok: true, method: method.toUpperCase() });
    });
  }
  app.post("/api/mutate-and-rotate", (_req, res) => {
    rotateCsrfTokenAfterPrivilegeEscalation(res, {
      reason: "own_credentials_updated",
      route: "/api/mutate-and-rotate",
    });
    res.json({ ok: true });
  });
  app.post("/api/rejected-mutate", (_req, res) => {
    res.status(400).json({ ok: false });
  });
  app.post("/api/csp-report", (_req, res) => {
    res.status(204).end();
  });
  app.post("/api/telemetry/client-errors", (_req, res) => {
    res.status(204).end();
  });
  app.post("/api/telemetry/web-vitals", (_req, res) => {
    res.status(204).end();
  });
  app.post("/telemetry/web-vitals", (_req, res) => {
    res.status(204).end();
  });
  return app;
}

test("rotateCsrfTokenAfterPrivilegeEscalation rotates csrf cookie for established sensitive sessions", () => {
  const cookies: Array<{ name: string; value: string }> = [];
  const headers = new Map<string, unknown>();
  const originalInfo = logger.info;
  const infos: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  const res = {
    getHeader: () => undefined,
    setHeader: (name: string, value: unknown) => {
      headers.set(name, value);
    },
    cookie: (name: string, value: string) => {
      cookies.push({ name, value });
    },
  };
  logger.info = ((message: string, payload?: Record<string, unknown>) => {
    infos.push({ message, payload });
  }) as typeof logger.info;

  try {
    rotateCsrfTokenAfterPrivilegeEscalation(res as never, {
      reason: "two_factor_enabled",
      route: "/api/auth/two-factor/enable",
    });

    assert.equal(cookies.length, 1);
    assert.equal(cookies[0]?.name, AUTH_SESSION_CSRF_COOKIE_NAME);
    assert.equal(cookies[0]?.value.length, 64);
    assert.equal(headers.get(AUTH_SESSION_CSRF_HEADER_NAME), cookies[0]?.value);
    assert.equal(infos[0]?.message, "CSRF token rotation enforced after privilege escalation");
    assert.equal(infos[0]?.payload?.event, "csrf_privilege_escalation_rotation");
    assert.equal(infos[0]?.payload?.reason, "two_factor_enabled");
    assert.equal(infos[0]?.payload?.rotated, true);
    assert.equal(infos[0]?.payload?.reusedPendingRotation, false);
  } finally {
    logger.info = originalInfo;
  }
});

test("rotateCsrfTokenAfterPrivilegeEscalation reuses a queued csrf cookie from session issuance", () => {
  const originalInfo = logger.info;
  const infos: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  let cookieCalls = 0;
  const headers = new Map<string, unknown>();
  const res = {
    getHeader: (name: string) => (
      name === "Set-Cookie"
        ? [`${AUTH_SESSION_CSRF_COOKIE_NAME}=${"b".repeat(64)}; Path=/; SameSite=Strict`]
        : undefined
    ),
    setHeader: (name: string, value: unknown) => {
      headers.set(name, value);
    },
    cookie: () => {
      cookieCalls += 1;
    },
  };
  logger.info = ((message: string, payload?: Record<string, unknown>) => {
    infos.push({ message, payload });
  }) as typeof logger.info;

  try {
    rotateCsrfTokenAfterPrivilegeEscalation(res as never, {
      reason: "two_factor_login_verified",
      route: "/api/auth/verify-two-factor-login",
    });

    assert.equal(cookieCalls, 0);
    assert.equal(headers.has(AUTH_SESSION_CSRF_HEADER_NAME), false);
    assert.equal(infos[0]?.payload?.rotated, false);
    assert.equal(infos[0]?.payload?.reusedPendingRotation, true);
    assert.equal(infos[0]?.payload?.reason, "two_factor_login_verified");
  } finally {
    logger.info = originalInfo;
  }
});

test("rotateCsrfTokenAfterPrivilegeEscalation is idempotent per response locals", () => {
  const cookies: Array<{ name: string; value: string }> = [];
  const headers = new Map<string, unknown>();
  const infos: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  const originalInfo = logger.info;
  const res = {
    locals: {},
    getHeader: () => undefined,
    setHeader: (name: string, value: unknown) => {
      headers.set(name, value);
    },
    cookie: (name: string, value: string) => {
      cookies.push({ name, value });
    },
  };
  logger.info = ((message: string, payload?: Record<string, unknown>) => {
    infos.push({ message, payload });
  }) as typeof logger.info;

  try {
    rotateCsrfTokenAfterPrivilegeEscalation(res as never, {
      reason: "two_factor_enabled",
      route: "/api/auth/two-factor/enable",
    });
    rotateCsrfTokenAfterPrivilegeEscalation(res as never, {
      reason: "two_factor_disabled",
      route: "/api/auth/two-factor/disable",
    });

    assert.equal(cookies.length, 1);
    assert.equal(headers.get(AUTH_SESSION_CSRF_HEADER_NAME), cookies[0]?.value);
    assert.equal((res.locals as Record<string, unknown>).sqrCsrfRotationQueued, true);
    assert.equal(infos[0]?.payload?.rotated, true);
    assert.equal(infos[1]?.payload?.rotated, false);
    assert.equal(infos[1]?.payload?.reusedPendingRotation, true);
  } finally {
    logger.info = originalInfo;
  }
});

test("rotateCsrfTokenAfterPrivilegeEscalation coalesces same-response concurrent calls", async () => {
  let cookieCalls = 0;
  const originalInfo = logger.info;
  const res = {
    locals: {},
    getHeader: () => undefined,
    setHeader: () => undefined,
    cookie: () => {
      cookieCalls += 1;
    },
  };
  logger.info = (() => undefined) as typeof logger.info;

  try {
    await Promise.all([
      Promise.resolve().then(() => rotateCsrfTokenAfterPrivilegeEscalation(res as never, {
        reason: "two_factor_setup_started",
      })),
      Promise.resolve().then(() => rotateCsrfTokenAfterPrivilegeEscalation(res as never, {
        reason: "two_factor_enabled",
      })),
    ]);

    assert.equal(cookieCalls, 1);
    assert.equal((res.locals as Record<string, unknown>).sqrCsrfRotationQueued, true);
  } finally {
    logger.info = originalInfo;
  }
});

test("csrf middleware rejects cross-site mutation requests when session cookie is present", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);
  const originalWarn = logger.warn;
  const warnings: Array<{ message: string; payload: unknown }> = [];
  logger.warn = ((message: string, payload: unknown) => {
    warnings.push({ message, payload });
  }) as typeof logger.warn;

  try {
    const response = await fetch(`${baseUrl}/api/mutate`, {
      method: "POST",
      headers: {
        Cookie: `sqr_auth=token-value; sqr_csrf=${VALID_CSRF_TOKEN}`,
        "sec-fetch-site": "cross-site",
      },
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.code, "CSRF_REJECTED");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "CSRF request rejected");
  } finally {
    logger.warn = originalWarn;
    await stopTestServer(server);
  }
});

test("csrf middleware accepts session mutations with a valid double-submit token", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/mutate`, {
      method: "POST",
      headers: {
        Cookie: `sqr_auth=token-value; sqr_csrf=${VALID_CSRF_TOKEN}`,
        "X-CSRF-Token": VALID_CSRF_TOKEN,
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, method: "POST" });
  } finally {
    await stopTestServer(server);
  }
});

test("csrf middleware rejects cookie-authenticated mutations that omit all CSRF validation signals", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);
  const originalWarn = logger.warn;
  const warnings: Array<{ message: string; payload: unknown }> = [];
  logger.warn = ((message: string, payload: unknown) => {
    warnings.push({ message, payload });
  }) as typeof logger.warn;

  try {
    const response = await fetch(`${baseUrl}/api/mutate`, {
      method: "POST",
      headers: {
        Cookie: `sqr_auth=token-value; sqr_csrf=${VALID_CSRF_TOKEN}`,
      },
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.code, "CSRF_SIGNAL_MISSING");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "CSRF request rejected");
  } finally {
    logger.warn = originalWarn;
    await stopTestServer(server);
  }
});

test("csrf middleware logs invalid origin rejections with the normalized origin", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);
  const originalWarn = logger.warn;
  const warnings: Array<{ message: string; payload: Record<string, unknown> }> = [];
  logger.warn = ((message: string, payload: Record<string, unknown>) => {
    warnings.push({ message, payload });
  }) as typeof logger.warn;

  try {
    const response = await fetch(`${baseUrl}/api/mutate`, {
      method: "POST",
      headers: {
        Cookie: `sqr_auth=token-value; sqr_csrf=${VALID_CSRF_TOKEN}`,
        Origin: "https://evil.example",
      },
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.code, "CSRF_ORIGIN_REJECTED");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].message, "CSRF request rejected");
    assert.equal(warnings[0].payload.code, "CSRF_ORIGIN_REJECTED");
    assert.equal(warnings[0].payload.requestOrigin, "https://evil.example");
  } finally {
    logger.warn = originalWarn;
    await stopTestServer(server);
  }
});

test("csrf middleware accepts cookie-authenticated mutations with a same-origin fetch metadata signal", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/mutate`, {
      method: "POST",
      headers: {
        Cookie: `sqr_auth=token-value; sqr_csrf=${VALID_CSRF_TOKEN}`,
        "sec-fetch-site": "same-origin",
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, method: "POST" });
  } finally {
    await stopTestServer(server);
  }
});

test("csrf middleware allows requests without auth session cookies", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/mutate`, {
      method: "POST",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, method: "POST" });
  } finally {
    await stopTestServer(server);
  }
});

test("csrf middleware allows bearer-only API mutations because cookies are not ambient credentials", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/mutate`, {
      method: "POST",
      headers: {
        Authorization: "Bearer api-token",
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, method: "POST" });
  } finally {
    await stopTestServer(server);
  }
});

test("csrf middleware rotates csrf cookies for successful authenticated state-changing operations", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);
  const originalInfo = logger.info;
  const infos: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  logger.info = ((message: string, payload?: Record<string, unknown>) => {
    infos.push({ message, payload });
  }) as typeof logger.info;

  try {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = await fetch(`${baseUrl}/api/mutate`, {
        method,
        headers: {
          Cookie: `sqr_auth=token-value; sqr_csrf=${VALID_CSRF_TOKEN}`,
          "X-CSRF-Token": VALID_CSRF_TOKEN,
        },
      });

      assert.equal(response.status, 200);
      const csrfHeader = response.headers.get(AUTH_SESSION_CSRF_HEADER_NAME) || "";
      const setCookie = response.headers.get("set-cookie") || "";
      assert.equal(csrfHeader.length, 64);
      assert.notEqual(csrfHeader, VALID_CSRF_TOKEN);
      assert.match(setCookie, new RegExp(`${AUTH_SESSION_CSRF_COOKIE_NAME}=${csrfHeader}`));
    }

    const stateChangingRotations = infos.filter(
      (info) => info.payload?.event === "csrf_state_changing_rotation",
    );
    assert.equal(stateChangingRotations.length, 4);
    assert.deepEqual(
      stateChangingRotations.map((info) => info.payload?.method),
      ["POST", "PUT", "PATCH", "DELETE"],
    );
    assert.equal(stateChangingRotations.every((info) => info.payload?.rotated === true), true);
  } finally {
    logger.info = originalInfo;
    await stopTestServer(server);
  }
});

test("csrf middleware does not rotate csrf cookies for rejected or unauthenticated mutations", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const rejectedResponse = await fetch(`${baseUrl}/api/rejected-mutate`, {
      method: "POST",
      headers: {
        Cookie: `sqr_auth=token-value; sqr_csrf=${VALID_CSRF_TOKEN}`,
        "X-CSRF-Token": VALID_CSRF_TOKEN,
      },
    });
    assert.equal(rejectedResponse.status, 400);
    assert.equal(rejectedResponse.headers.has(AUTH_SESSION_CSRF_HEADER_NAME), false);
    assert.doesNotMatch(rejectedResponse.headers.get("set-cookie") || "", /sqr_csrf=/);

    const unauthenticatedResponse = await fetch(`${baseUrl}/api/mutate`, {
      method: "POST",
    });
    assert.equal(unauthenticatedResponse.status, 200);
    assert.equal(unauthenticatedResponse.headers.has(AUTH_SESSION_CSRF_HEADER_NAME), false);
    assert.doesNotMatch(unauthenticatedResponse.headers.get("set-cookie") || "", /sqr_csrf=/);
  } finally {
    await stopTestServer(server);
  }
});

test("csrf middleware coalesces automatic rotation with route-level privilege rotation", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);
  const originalInfo = logger.info;
  const infos: Array<{ message: string; payload: Record<string, unknown> | undefined }> = [];
  logger.info = ((message: string, payload?: Record<string, unknown>) => {
    infos.push({ message, payload });
  }) as typeof logger.info;

  try {
    const response = await fetch(`${baseUrl}/api/mutate-and-rotate`, {
      method: "POST",
      headers: {
        Cookie: `sqr_auth=token-value; sqr_csrf=${VALID_CSRF_TOKEN}`,
        "X-CSRF-Token": VALID_CSRF_TOKEN,
      },
    });

    assert.equal(response.status, 200);
    const setCookie = response.headers.get("set-cookie") || "";
    assert.equal((setCookie.match(/sqr_csrf=/g) || []).length, 1);
    assert.equal(response.headers.get(AUTH_SESSION_CSRF_HEADER_NAME)?.length, 64);
    assert.equal(infos[0]?.payload?.event, "csrf_privilege_escalation_rotation");
    assert.equal(infos[0]?.payload?.rotated, true);
    assert.equal(infos[1]?.payload?.event, "csrf_state_changing_rotation");
    assert.equal(infos[1]?.payload?.rotated, false);
    assert.equal(infos[1]?.payload?.reusedPendingRotation, true);
  } finally {
    logger.info = originalInfo;
    await stopTestServer(server);
  }
});

test("csrf middleware exempts browser CSP reports from token checks", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/csp-report`, {
      method: "POST",
      headers: {
        Cookie: `sqr_auth=token-value; sqr_csrf=${VALID_CSRF_TOKEN}`,
        "Content-Type": "application/csp-report",
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({
        "csp-report": {
          "violated-directive": "script-src",
        },
      }),
    });

    assert.equal(response.status, 204);
  } finally {
    await stopTestServer(server);
  }
});

test("csrf middleware exempts canonical web-vitals telemetry from token checks", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        Cookie: `sqr_auth=token-value; sqr_csrf=${VALID_CSRF_TOKEN}`,
        "Content-Type": "application/json",
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({
        name: "LCP",
        value: 123,
      }),
    });

    assert.equal(response.status, 204);
  } finally {
    await stopTestServer(server);
  }
});

test("csrf middleware exempts same-origin client error telemetry from token checks", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/telemetry/client-errors`, {
      method: "POST",
      headers: {
        Cookie: `sqr_auth=token-value; sqr_csrf=${VALID_CSRF_TOKEN}`,
        "Content-Type": "application/json",
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({
        source: "route_render",
        fingerprint: "0123456789abcdef",
      }),
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.has(AUTH_SESSION_CSRF_HEADER_NAME), false);
    assert.doesNotMatch(response.headers.get("set-cookie") || "", /sqr_csrf=/);
  } finally {
    await stopTestServer(server);
  }
});

test("csrf middleware does not rotate csrf cookies for telemetry exemption responses", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        Cookie: `sqr_auth=token-value; sqr_csrf=${VALID_CSRF_TOKEN}`,
        "Content-Type": "application/json",
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({
        name: "LCP",
        value: 123,
      }),
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.has(AUTH_SESSION_CSRF_HEADER_NAME), false);
    assert.doesNotMatch(response.headers.get("set-cookie") || "", /sqr_csrf=/);
  } finally {
    await stopTestServer(server);
  }
});

test("csrf middleware explicitly exempts legacy web-vitals telemetry from token checks", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        Cookie: `sqr_auth=token-value; sqr_csrf=${VALID_CSRF_TOKEN}`,
        "Content-Type": "application/json",
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({
        name: "LCP",
        value: 123,
      }),
    });

    assert.equal(response.status, 204);
  } finally {
    await stopTestServer(server);
  }
});

test("csrf middleware rejects cookie-authenticated telemetry without browser provenance", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);
  const originalWarn = logger.warn;
  const warnings: Array<{ message: string; payload: Record<string, unknown> }> = [];
  logger.warn = ((message: string, payload: Record<string, unknown>) => {
    warnings.push({ message, payload });
  }) as typeof logger.warn;

  try {
    const response = await fetch(`${baseUrl}/api/csp-report`, {
      method: "POST",
      headers: {
        Cookie: `sqr_auth=token-value; sqr_csrf=${VALID_CSRF_TOKEN}`,
        "Content-Type": "application/csp-report",
      },
      body: JSON.stringify({
        "csp-report": {
          "violated-directive": "script-src",
        },
      }),
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.code, "CSRF_TELEMETRY_ORIGIN_REJECTED");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.message, "CSRF telemetry request rejected");
    assert.equal(warnings[0]?.payload.hasOrigin, false);
    assert.equal(warnings[0]?.payload.hasReferer, false);
  } finally {
    logger.warn = originalWarn;
    await stopTestServer(server);
  }
});

test("csrf middleware rejects cookie-authenticated cross-site telemetry", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        Cookie: `sqr_auth=token-value; sqr_csrf=${VALID_CSRF_TOKEN}`,
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
        "Sec-Fetch-Site": "cross-site",
      },
      body: JSON.stringify({
        name: "LCP",
        value: 123,
      }),
    });

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.code, "CSRF_TELEMETRY_ORIGIN_REJECTED");
  } finally {
    await stopTestServer(server);
  }
});

test("csrf middleware still lets unauthenticated telemetry reach route guards without provenance", async () => {
  const app = createCsrfTestApp();
  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/telemetry/web-vitals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "LCP",
        value: 123,
      }),
    });

    assert.equal(response.status, 204);
  } finally {
    await stopTestServer(server);
  }
});
