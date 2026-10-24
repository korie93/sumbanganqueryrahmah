import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";
import express, { type RequestHandler } from "express";
import { registerSearchRoutes } from "../../server/routes/search.routes";
import { registerAiRoutes } from "../../server/routes/ai.routes";
import { registerOperationsBackupRoutes } from "../../server/routes/operations-backup-routes";
import { registerCollectionReceiptRoutes } from "../../server/routes/collection/collection-receipt-routes";

// Tests the real route registration and short-circuit order with injected denials.
// This does NOT replace JWT verification, per-record scope or full middleware tests.
// Run only in the OS-isolated test environment described in README.md.
type Boundary = "auth" | "role" | "tab";
type RouteCase = readonly [method: "GET" | "POST" | "DELETE", path: string];
const searchCases: readonly RouteCase[] = [
  ["GET", "/api/search/columns"], ["GET", "/api/columns"],
  ["GET", "/api/search/global"], ["GET", "/api/search/collection-history"],
  ["GET", "/api/search"], ["POST", "/api/search/advanced"],
];
const backupCases: readonly RouteCase[] = [
  ["GET", "/api/backups"], ["POST", "/api/backups"],
  ["GET", "/api/backups/jobs/audit-job"], ["GET", "/api/backups/audit-backup"],
  ["GET", "/api/backups/audit-backup/export"],
  ["POST", "/api/backups/audit-backup/restore"], ["DELETE", "/api/backups/audit-backup"],
];
const aiCases: readonly RouteCase[] = [
  ["GET", "/api/ai/config"], ["POST", "/api/ai/search"],
  ["POST", "/api/ai/index/import/audit-import"],
  ["POST", "/api/ai/branches/import/audit-import"], ["POST", "/api/ai/chat"],
];
const receiptCases: readonly RouteCase[] = [
  ["GET", "/api/collection/audit-record/receipt/view"],
  ["GET", "/api/collection/audit-record/receipt/download"],
  ["GET", "/api/collection/audit-record/receipts/audit-receipt/view"],
  ["GET", "/api/collection/audit-record/receipts/audit-receipt/download"],
  ["GET", "/api/receipts/audit-record/view"],
  ["GET", "/api/receipts/audit-record/download"],
];

for (const denyAt of ["auth", "role", "tab"] as const) {
  test(`sensitive route aliases stop at the injected ${denyAt} denial before their sink`, async (t) => {
    const app = express();
    const visited: Boundary[] = [];
    let sinkCalls = 0;
    const guard = (boundary: Boundary): RequestHandler => (_req, res, next) => {
      visited.push(boundary);
      if (boundary === denyAt) {
        res.status(boundary === "auth" ? 401 : 403).json({ deniedAt: boundary });
        return;
      }
      next();
    };
    const authenticateToken = guard("auth");
    const requireRole = (..._roles: string[]) => guard("role");
    const requireTabAccess = (..._tabs: string[]) => guard("tab");
    const unreachable = async () => {
      sinkCalls += 1;
      throw new Error("A denied request reached a sensitive sink.");
    };
    const searchController = {
      getColumns: unreachable, searchGlobal: unreachable, getCollectionHistory: unreachable,
      searchSimple: unreachable, advancedSearch: unreachable,
    } as unknown as Parameters<typeof registerSearchRoutes>[1]["searchController"];
    registerSearchRoutes(app, {
      searchController, authenticateToken, requireTabAccess,
      searchRateLimiter: (_req, _res, next) => next(),
    });
    const aiController = {
      getConfig: unreachable, search: unreachable, chat: unreachable,
      indexImport: unreachable, importBranches: unreachable,
    } as unknown as Parameters<typeof registerAiRoutes>[1]["aiController"];
    registerAiRoutes(app, {
      aiController, authenticateToken, requireRole,
      withAiConcurrencyGate: (_route, handler) => handler,
    });
    registerOperationsBackupRoutes({
      app, authenticateToken, requireRole, requireTabAccess,
      operationsController: {
        listBackups: unreachable, createBackup: unreachable, getBackupJob: unreachable,
        getBackup: unreachable, exportBackup: unreachable, restoreBackup: unreachable,
        deleteBackup: unreachable,
      },
    } as unknown as Parameters<typeof registerOperationsBackupRoutes>[0]);
    registerCollectionReceiptRoutes({
      app,
      reportAccess: [authenticateToken, requireRole("user", "admin", "manager", "superuser"), requireTabAccess("collection-report")],
      storage: { getCollectionRecordById: unreachable },
    } as unknown as Parameters<typeof registerCollectionReceiptRoutes>[0]);

    const server = http.createServer(app);
    t.after(() => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }));
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    // Search has no role gate; AI currently has no tab gate. Test only boundaries
    // actually required by those registrations, not an invented allow policy.
    const cases = [
      ...backupCases, ...receiptCases,
      ...(denyAt === "role" ? [] : searchCases),
      ...(denyAt === "tab" ? [] : aiCases),
    ];
    for (const [method, requestPath] of cases) {
      visited.length = 0;
      const response = await fetch(`http://127.0.0.1:${address.port}${requestPath}`, {
        method, redirect: "error", signal: AbortSignal.timeout(3_000),
      });
      assert.equal(response.status, denyAt === "auth" ? 401 : 403, `${method} ${requestPath}`);
      assert.deepEqual(await response.json(), { deniedAt: denyAt });
      assert.equal(visited[visited.length - 1], denyAt);
      assert.equal(sinkCalls, 0, `${method} ${requestPath} must not invoke controller/storage/provider`);
    }
  });
}
