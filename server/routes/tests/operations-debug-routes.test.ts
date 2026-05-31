import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import {
  createOperationsDebugRouteStartupLock,
  createOperationsDebugAccessGate,
  isOperationsDebugRoutesEnabled,
  registerOperationsDebugRoutes,
} from "../operations-debug-routes";
import {
  createJsonTestApp,
  createTestAuthenticateToken,
  createTestRequireRole,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

const DEBUG_ACCESS_TOKEN = "debug-access-token-32-characters-min";

test("registerOperationsDebugRoutes skips the websocket client endpoint when the feature flag is disabled", async () => {
  const app = createJsonTestApp();

  registerOperationsDebugRoutes({
    app,
    operationsController: {
      getWebsocketClients: async (_req: Request, res: Response) => res.json({ ok: true }),
    } as never,
    authenticateToken: createTestAuthenticateToken({
      userId: "super-1",
      username: "super.user",
      role: "superuser",
      activityId: "activity-1",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => (_req, _res, next) => next(),
  }, createOperationsDebugRouteStartupLock({
    enabled: false,
    productionLike: false,
  }));

  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/debug/websocket-clients`, {
      headers: {
        "x-test-username": "super.user",
        "x-test-role": "superuser",
        "x-test-userid": "super-1",
      },
    });
    assert.equal(response.status, 404);
  } finally {
    await stopTestServer(server);
  }
});

test("registerOperationsDebugRoutes refuses to mount endpoints on production-like runtimes", async () => {
  const app = createJsonTestApp();

  registerOperationsDebugRoutes({
    app,
    operationsController: {
      getWebsocketClients: async (_req: Request, res: Response) => res.json({ ok: true }),
    } as never,
    authenticateToken: createTestAuthenticateToken({
      userId: "super-1",
      username: "super.user",
      role: "superuser",
      activityId: "activity-1",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => (_req, _res, next) => next(),
  }, createOperationsDebugRouteStartupLock({
    enabled: true,
    productionLike: true,
  }));

  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/debug/websocket-clients`, {
      headers: {
        "x-test-username": "super.user",
        "x-test-role": "superuser",
        "x-test-userid": "super-1",
      },
    });
    assert.equal(response.status, 404);
  } finally {
    await stopTestServer(server);
  }
});

test("registerOperationsDebugRoutes mounts endpoints only when explicitly enabled on local runtimes", async () => {
  const app = createJsonTestApp();

  registerOperationsDebugRoutes({
    app,
    operationsController: {
      getWebsocketClients: async (_req: Request, res: Response) => res.json({ clients: ["activity-1"] }),
    } as never,
    authenticateToken: createTestAuthenticateToken({
      userId: "super-1",
      username: "super.user",
      role: "superuser",
      activityId: "activity-1",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => (_req, _res, next) => next(),
  }, createOperationsDebugRouteStartupLock({
    enabled: true,
    productionLike: false,
    accessToken: DEBUG_ACCESS_TOKEN,
    allowedIps: ["127.0.0.1"],
  }));

  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/debug/websocket-clients`, {
      headers: {
        authorization: `Bearer ${DEBUG_ACCESS_TOKEN}`,
        "x-test-username": "super.user",
        "x-test-role": "superuser",
        "x-test-userid": "super-1",
      },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { clients: ["activity-1"] });
  } finally {
    await stopTestServer(server);
  }
});

test("registerOperationsDebugRoutes hides mounted endpoints without the dedicated debug token", async () => {
  const app = createJsonTestApp();
  let calls = 0;

  registerOperationsDebugRoutes({
    app,
    operationsController: {
      getWebsocketClients: async (_req: Request, res: Response) => {
        calls += 1;
        return res.json({ ok: true });
      },
    } as never,
    authenticateToken: createTestAuthenticateToken({
      userId: "super-1",
      username: "super.user",
      role: "superuser",
      activityId: "activity-1",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => (_req, _res, next) => next(),
  }, createOperationsDebugRouteStartupLock({
    enabled: true,
    productionLike: false,
    accessToken: DEBUG_ACCESS_TOKEN,
    allowedIps: ["127.0.0.1"],
  }));

  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/debug/websocket-clients`, {
      headers: {
        "x-test-username": "super.user",
        "x-test-role": "superuser",
        "x-test-userid": "super-1",
      },
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      ok: false,
      message: "Not found",
      code: "NOT_FOUND",
      error: {
        code: "NOT_FOUND",
        message: "Not found",
      },
    });
    assert.equal(calls, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("registerOperationsDebugRoutes hides mounted endpoints from non-allowlisted IPs", async () => {
  const app = createJsonTestApp();
  let calls = 0;

  registerOperationsDebugRoutes({
    app,
    operationsController: {
      getWebsocketClients: async (_req: Request, res: Response) => {
        calls += 1;
        return res.json({ ok: true });
      },
    } as never,
    authenticateToken: createTestAuthenticateToken({
      userId: "super-1",
      username: "super.user",
      role: "superuser",
      activityId: "activity-1",
    }),
    requireRole: createTestRequireRole(),
    requireTabAccess: () => (_req, _res, next) => next(),
  }, createOperationsDebugRouteStartupLock({
    enabled: true,
    productionLike: false,
    accessToken: DEBUG_ACCESS_TOKEN,
    allowedIps: ["203.0.113.10"],
  }));

  const { server, baseUrl } = await startTestServer(app);

  try {
    const response = await fetch(`${baseUrl}/api/debug/websocket-clients`, {
      headers: {
        authorization: `Bearer ${DEBUG_ACCESS_TOKEN}`,
        "x-test-username": "super.user",
        "x-test-role": "superuser",
        "x-test-userid": "super-1",
      },
    });
    assert.equal(response.status, 404);
    assert.equal(calls, 0);
  } finally {
    await stopTestServer(server);
  }
});

test("isOperationsDebugRoutesEnabled requires both local runtime and explicit opt-in", () => {
  assert.equal(isOperationsDebugRoutesEnabled(false, false), false);
  assert.equal(isOperationsDebugRoutesEnabled(true, true), false);
  assert.equal(isOperationsDebugRoutesEnabled(true, false), true);
});

test("createOperationsDebugRouteStartupLock defaults to fail-closed production-like mode", () => {
  assert.deepEqual(createOperationsDebugRouteStartupLock({}), {
    enabled: false,
    requested: false,
    productionLike: true,
    reason: "production-like",
    accessToken: null,
    allowedIps: ["127.0.0.1"],
  });
  assert.deepEqual(createOperationsDebugRouteStartupLock({ enabled: true }), {
    enabled: false,
    requested: true,
    productionLike: true,
    reason: "production-like",
    accessToken: null,
    allowedIps: ["127.0.0.1"],
  });
  assert.deepEqual(createOperationsDebugRouteStartupLock({
    enabled: true,
    productionLike: false,
    accessToken: DEBUG_ACCESS_TOKEN,
    allowedIps: ["127.0.0.1", "::1"],
  }), {
    enabled: true,
    requested: true,
    productionLike: false,
    reason: "enabled-local",
    accessToken: DEBUG_ACCESS_TOKEN,
    allowedIps: ["127.0.0.1"],
  });
});

test("createOperationsDebugRouteStartupLock requires a strong debug access token when enabled", () => {
  assert.throws(
    () => createOperationsDebugRouteStartupLock({ enabled: true, productionLike: false }),
    /OPERATIONS_DEBUG_ACCESS_TOKEN must be set/i,
  );
  assert.throws(
    () =>
      createOperationsDebugRouteStartupLock({
        enabled: true,
        productionLike: false,
        accessToken: "short",
      }),
    /OPERATIONS_DEBUG_ACCESS_TOKEN must be set/i,
  );
});

test("createOperationsDebugAccessGate rejects invalid bearer tokens without calling next", () => {
  const middleware = createOperationsDebugAccessGate(createOperationsDebugRouteStartupLock({
    enabled: true,
    productionLike: false,
    accessToken: DEBUG_ACCESS_TOKEN,
    allowedIps: ["127.0.0.1"],
  }));
  let nextCalled = false;
  const response = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };

  middleware({
    headers: { authorization: "Bearer wrong-token" },
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    path: "/api/debug/websocket-clients",
  } as unknown as Request, response as unknown as Response, () => {
    nextCalled = true;
  });

  assert.equal(response.statusCode, 404);
  assert.equal(nextCalled, false);
});
