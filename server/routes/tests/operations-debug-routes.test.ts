import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { registerOperationsDebugRoutes } from "../operations-debug-routes";
import {
  createJsonTestApp,
  createTestAuthenticateToken,
  createTestRequireRole,
  startTestServer,
  stopTestServer,
} from "./http-test-utils";

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
  }, {
    enabled: false,
  });

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
