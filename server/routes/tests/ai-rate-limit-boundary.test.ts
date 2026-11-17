import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import type { AiController } from "../../controllers/ai.controller";
import { createApiProtectionMiddleware } from "../../internal/apiProtection";
import type { WorkerControlState } from "../../internal/runtime-monitor-manager";
import { registerAiRoutes } from "../ai.routes";
import { createJsonTestApp, startTestServer, stopTestServer } from "./http-test-utils";

test("runtime installs shared adaptive protection before registering API routes", () => {
  const source = readFileSync("server/internal/local-runtime-environment.ts", "utf8");
  const pipeline = source.indexOf("registerLocalHttpPipeline(app,");
  const routes = source.indexOf("registerLocalServerRoutes({");
  assert.ok(pipeline >= 0 && routes > pipeline);
  const middleware = readFileSync("server/internal/local-http-pipeline.ts", "utf8");
  assert.ok(middleware.includes("app.use(adaptiveRateLimit);"));
});

test("all five AI routes stop before auth/controller work on exhausted or unavailable quota", async (t) => {
  let count = 100_000;
  let unavailable = false;
  let authCalls = 0;
  let controllerCalls = 0;
  const protection = createApiProtectionMiddleware({
    getControlState: () => ({ mode: "NORMAL", throttleFactor: 1 }) as WorkerControlState,
    getDbProtection: () => false,
    adaptiveRateStore: {
      async increment({ now, windowMs }) {
        if (unavailable) throw new Error("Synthetic quota store unavailable");
        return { count, lastSeenAt: now, resetAt: now + windowMs };
      },
    },
  });
  t.after(protection.stopAdaptiveRateStateSweep);
  const app = createJsonTestApp();
  app.use(protection.adaptiveRateLimit);
  const respond: RequestHandler = (_request, response) => { controllerCalls++; response.json({ ok: true }); };
  registerAiRoutes(app, {
    aiController: { getConfig: respond, search: respond, indexImport: respond, importBranches: respond, chat: respond } as unknown as AiController,
    authenticateToken: (_request, _response, next) => { authCalls++; next(); },
    requireRole: () => (_request, _response, next) => next(),
    withAiConcurrencyGate: () => respond,
  });
  const { server, baseUrl } = await startTestServer(app);
  t.after(() => stopTestServer(server));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  assert.equal(address.address, "127.0.0.1");
  const routes = ["config", "search", "index/import/synthetic", "branches/import/synthetic", "chat"];
  for (const expectedStatus of [429, 503, 200]) {
    unavailable = expectedStatus === 503;
    count = expectedStatus === 429 ? 100_000 : 1;
    for (const route of routes) {
      const response = await fetch(`${baseUrl}/api/ai/${route}`, { method: route === "config" ? "GET" : "POST" });
      assert.equal(response.status, expectedStatus, route);
      await response.arrayBuffer();
      if (expectedStatus !== 200) {
        assert.ok(response.headers.get("retry-after"));
        assert.equal(authCalls, 0);
        assert.equal(controllerCalls, 0);
      }
    }
  }
  assert.equal(authCalls, 5);
  assert.equal(controllerCalls, 5);
});
