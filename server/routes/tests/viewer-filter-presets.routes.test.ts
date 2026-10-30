import assert from "node:assert/strict";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerViewerFilterPresetRoutes } from "../viewer-filter-presets.routes";
import { ViewerFilterPresetsService } from "../../services/viewer-filter-presets.service";
import { errorHandler } from "../../middleware/error-handler";
import { notFound } from "../../http/errors";
import { allowAllTabs, createJsonTestApp, createTestAuthenticateToken, createTestRequireRole, startTestServer, stopTestServer } from "./http-test-utils";

const uuid = "0adf3e41-8a8f-4fae-8ad8-b1d42c277283";
const body = { name: "Monthly check", columnFilters: [{ column: "Date", operator: "dateBetween", value: "2024-02-01", valueTo: "2024-02-29" }], numericSort: { column: "Amount", direction: "desc" } };

test("Viewer preset HTTP routes enforce authenticated internal ownership, valid bodies and the shared read permission", async () => {
  const calls: unknown[][] = [];
  const service = new ViewerFilterPresetsService({
    list: async (owner, file) => { calls.push(["list", owner, file]); return []; },
    create: async (owner, file, input) => { calls.push(["create", owner, file]); return { id: uuid, ...input }; },
    rename: async (owner, file, id, name) => { calls.push(["rename", owner, file, id]); if (owner !== "owner-id") throw notFound("Preset not found."); return { id, ...body, name } as never; },
    delete: async (owner, file, id) => { calls.push(["delete", owner, file, id]); if (owner !== "owner-id") throw notFound("Preset not found."); },
  }, { getImportById: async () => ({ id: "file" }) as never, getImportColumnNames: async () => ["Date", "Amount"] });
  const app = createJsonTestApp(), permissions: string[][] = [];
  const tabGuard = (...tabs: string[]): RequestHandler => { permissions.push(tabs); return (req, res, next) => {
    if (req.headers["x-test-deny"] === "1") { res.sendStatus(403); return; } next();
  }; };
  registerViewerFilterPresetRoutes(app, { service, authenticateToken: createTestAuthenticateToken(), requireRole: createTestRequireRole(),
    requireTabAccess: tabGuard, rateLimiter: allowAllTabs() });
  app.use(errorHandler);
  const { server, baseUrl } = await startTestServer(app);
  const headers = { "x-test-username": "display-name", "x-test-role": "user", "x-test-userid": "owner-id", "content-type": "application/json" };
  const request = (method: string, suffix = "", input?: unknown, extra: Record<string, string> = {}) => fetch(`${baseUrl}/api/imports/file/viewer-presets${suffix}`,
    { method, headers: { ...headers, ...extra }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  try {
    assert.deepEqual(permissions, [["import", "saved", "viewer"]]);
    assert.equal((await fetch(`${baseUrl}/api/imports/file/viewer-presets`)).status, 401);
    assert.equal((await request("GET", "", undefined, { "x-test-userid": "" })).status, 401);
    assert.equal((await request("GET", "", undefined, { "x-test-deny": "1" })).status, 403);
    assert.equal(calls.length, 0);
    assert.deepEqual(await (await request("GET")).json(), { presets: [] });
    const created = await request("POST", "", body); assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), { preset: { id: uuid, ...body } });
    for (const invalid of [{ ...body, ownerUserId: "other" }, { ...body, name: "\nName" }, { ...body, columnFilters: [{ ...body.columnFilters[0], valueTo: "2024-02-30" }] }, { ...body, numericSort: { column: "Missing", direction: "asc" } }]) {
      assert.equal((await request("POST", "", invalid)).status, 400);
    }
    assert.equal(calls.length, 2);
    assert.equal((await request("PATCH", `/${uuid}`, { name: "Renamed" })).status, 200);
    assert.equal((await request("PATCH", `/${uuid}`, { name: "Renamed" }, { "x-test-userid": "foreign-id" })).status, 404);
    assert.equal((await request("DELETE", `/${uuid}`, undefined, { "x-test-userid": "foreign-id" })).status, 404);
    assert.deepEqual(await (await request("DELETE", `/${uuid}`)).json(), { ok: true });
    assert.equal((await request("PATCH", "/not-a-uuid", { name: "x" })).status, 400);
    assert.equal((calls[1] ?? [])[1], "owner-id");
  } finally { await stopTestServer(server); }
});
