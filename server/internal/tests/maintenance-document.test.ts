import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AuthenticatedRequest } from "../../auth/guards";
import type { MaintenanceState } from "../../config/system-settings";
import { createJsonTestApp, startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import { registerFrontendStatic } from "../frontend-static";
import { createRuntimeConfigManager } from "../runtime-config-manager";

test("hard maintenance returns shell503 at the requested URL while preserving login, assets, JSON, bypass roles and health", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-maintenance-http-"));
  const publicDir = path.join(tempRoot, "public");
  await fs.mkdir(path.join(publicDir, "assets"), { recursive: true });
  await fs.writeFile(path.join(publicDir, "index.html"), '<!doctype html><html><head></head><body id="sqr-shell"></body></html>');
  await fs.writeFile(path.join(publicDir, "assets", "app-12345678.js"), "void 0;");
  let state: MaintenanceState = { maintenance: true, message: "Scheduled work", type: "hard", startTime: null, endTime: null };
  const manager = createRuntimeConfigManager({
    storage: { getMaintenanceState: async () => state, getAppConfig: async () => { throw new Error("not used"); } },
    secret: "test-only-maintenance-secret-not-production",
    defaults: { sessionTimeoutMinutes: 15, wsIdleMinutes: 15, aiTimeoutMs: 1000, searchResultLimit: 10, viewerRowsPerPage: 10 },
    maintenanceCacheTtlMs: 1000,
    runtimeSettingsCacheTtlMs: 1000,
  });
  const app = createJsonTestApp();
  app.use((req: AuthenticatedRequest, _res, next) => {
    const role = req.get("x-test-role");
    if (role) req.user = { username: "test-user", role, activityId: "test-session" };
    next();
  });
  app.use(manager.maintenanceGuard);
  app.get("/api/health/live", (_req, res) => res.json({ status: "ok", ready: true }));
  app.get("/api/maintenance-status", (_req, res) => res.json(state));
  app.get("/api/search/test", (_req, res) => res.json({ ok: true }));
  app.get("/api/collection/test", (_req, res) => res.json({ ok: true }));
  registerFrontendStatic(app, { cwd: tempRoot, paths: ["public"] });
  const { server, baseUrl } = await startTestServer(app);
  try {
    for (const route of ["/", "/general-search", "/maintenance", "/missing-page", "/index.html"]) {
      for (const method of ["GET", "HEAD"]) {
        const response = await fetch(`${baseUrl}${route}`, { method, redirect: "manual" });
        assert.equal(response.status, 503, `${method} ${route}`);
        assert.equal(response.headers.get("location"), null);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(response.headers.get("x-sqr-maintenance"), "1");
        if (method === "GET") assert.match(await response.text(), /<meta name="sqr-maintenance" content="active">/);
        else assert.equal(await response.text(), "");
      }
    }
    for (const role of ["admin", "superuser"]) {
      const response = await fetch(`${baseUrl}/general-search`, { headers: { "x-test-role": role } });
      assert.equal(response.status, 200);
      assert.doesNotMatch(await response.text(), /sqr-maintenance/);
    }
    assert.equal((await fetch(`${baseUrl}/login`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/assets/app-12345678.js`)).status, 200);
    assert.deepEqual(await (await fetch(`${baseUrl}/api/health/live`)).json(), { status: "ok", ready: true });
    assert.equal((await (await fetch(`${baseUrl}/api/maintenance-status`)).json()).maintenance, true);
    const api = await fetch(`${baseUrl}/api/collection/test`);
    assert.equal(api.status, 503);
    assert.deepEqual(await api.json(), state);
    const nonDocument = await fetch(`${baseUrl}/general-search`, { headers: { accept: "application/json" } });
    assert.equal(nonDocument.status, 503);
    assert.deepEqual(await nonDocument.json(), state);
    state = { ...state, type: "soft" };
    manager.invalidateMaintenanceCache();
    assert.equal((await fetch(`${baseUrl}/general-search`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/search/test`)).status, 503);
    assert.equal((await fetch(`${baseUrl}/api/collection/test`)).status, 200);
    state = { ...state, maintenance: false };
    manager.invalidateMaintenanceCache();
    assert.equal((await fetch(`${baseUrl}/maintenance`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/general-search`)).status, 200);
  } finally {
    await stopTestServer(server);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
