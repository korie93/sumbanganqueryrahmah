import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { db } from "../../db-postgres";
import { ensureUsersBootstrapSchema } from "../../internal/users-bootstrap/schema";
import { ensureCoreAuditLogsTable } from "../../internal/core-schema-bootstrap-activity";
import { ensureSettingsSchema } from "../../internal/settings-bootstrap-schema";
import { seedEnterpriseSettings } from "../../internal/settings-bootstrap-seed-operations";
import { SettingsRepository } from "../settings.repository";
import { createAuthGuards } from "../../auth/guards";
import { registerSettingsRoutes } from "../../routes/settings.routes";
import { registerSearchRoutes } from "../../routes/search.routes";
import { errorHandler } from "../../middleware/error-handler";
import { createJsonTestApp, createTestAuthenticateToken, startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import type { PostgresStorage } from "../../storage-postgres";

const config = { host: process.env.PG_HOST || "127.0.0.1", port: Number(process.env.PG_PORT || 5432), user: process.env.PG_USER || "postgres", password: process.env.PG_PASSWORD || "postgres" };
const maintenanceDatabase = process.env.PG_MAINTENANCE_DATABASE || "postgres";
const postgresRequired = process.env.ROLE_PERMISSIONS_POSTGRES_REQUIRED === "1";
assert(["127.0.0.1", "localhost", "::1"].includes(config.host), "Role permission fixtures must use local PostgreSQL.");

test("real PostgreSQL role permissions: atomic ON/OFF, rollback, cache, repeated saves, restart and API boundaries", async (t) => {
  const maintenance = new pg.Pool({ ...config, database: maintenanceDatabase, max: 1, connectionTimeoutMillis: 1_500 });
  const name = `sqr_role_permissions_${Date.now()}_${randomUUID().slice(0, 8)}`;
  let created = false;
  try {
    // The general repository sweep also runs without PostgreSQL. The dedicated
    // CI/release database gates require this fixture and must fail, never skip.
    try {
      await maintenance.query("SELECT 1");
    } catch (error) {
      if (postgresRequired) throw error;
      t.skip("Local PostgreSQL unavailable for isolated role permission integration.");
      return;
    }
    await maintenance.query(`CREATE DATABASE ${pg.escapeIdentifier(name)}`);
    created = true;
    const pool = new pg.Pool({ ...config, database: name, max: 4 });
    try {
      const database = drizzle(pool);
      await ensureUsersBootstrapSchema(database);
      await ensureCoreAuditLogsTable(database);
      await ensureSettingsSchema(database);
      await seedEnterpriseSettings(database);
      const mutable = db as unknown as Record<string, unknown>;
      const originals = new Map(["execute", "transaction"].map((key) => [key, mutable[key]]));
      mutable.execute = database.execute.bind(database);
      mutable.transaction = database.transaction.bind(database);
      try {
        const repository = new SettingsRepository();
        const storage = new Proxy(repository, { get(target, key) {
          if (key === "createAuditLog") return async () => undefined;
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        } }) as unknown as PostgresStorage;
        const guards = createAuthGuards({ storage, secret: "permission-fixture-not-a-production-secret" });
        const broadcasts: Record<string, unknown>[] = [];
        const app = createJsonTestApp();
        const authenticateToken = createTestAuthenticateToken({ username: "system" });
        registerSettingsRoutes(app, { storage, authenticateToken, requireRole: guards.requireRole, requireTabAccess: guards.requireTabAccess,
          clearTabVisibilityCache: guards.clearTabVisibilityCache, invalidateRuntimeSettingsCache() {}, invalidateMaintenanceCache() {},
          getMaintenanceStateCached: () => repository.getMaintenanceState(), broadcastWsMessage: (value) => broadcasts.push(value),
        });
        app.get("/fixture/activity", authenticateToken, guards.requireTabAccess("activity"), (_req, res) => res.json({ ok: true }));
        app.get("/fixture/viewer", authenticateToken, guards.requireTabAccess("import", "saved", "viewer"), (_req, res) => res.json({ ok: true }));
        const respond = (_req: unknown, res: { json: (data: unknown) => unknown }) => res.json({ ok: true });
        registerSearchRoutes(app, { authenticateToken, requireTabAccess: guards.requireTabAccess, searchRateLimiter: (_req, _res, next) => next(),
          searchController: { getColumns: respond, searchGlobal: respond, searchSimple: respond, advancedSearch: respond, getCollectionHistory: respond } as never,
        });
        app.use(errorHandler);
        const { server, baseUrl } = await startTestServer(app);
        const request = (path: string, role = "superuser", body?: unknown) => fetch(`${baseUrl}${path}`, { method: body ? "PATCH" : "GET",
          headers: { "x-test-role": role, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const updates = (enabled: boolean) => ["activity", "general_search"].map((feature) => ({ key: `tab_manager_${feature}_enabled`, value: enabled }));
        const save = (enabled: boolean) => request("/api/settings/role-permissions", "superuser", { updates: updates(enabled), confirmCritical: true });
        const snapshot = async () => Promise.all(["system_settings", "setting_versions", "audit_logs", "role_setting_permissions"].map(async (table) =>
          (await pool.query(`SELECT to_jsonb(r) AS row FROM ${pg.escapeIdentifier(table)} r ORDER BY to_jsonb(r)::text`)).rows));
        try {
          const beforeUser = await repository.getRoleTabVisibility("user");
          const beforeManager = await repository.getRoleTabVisibility("manager");
          assert.equal((await request("/fixture/activity", "manager")).status, 403);
          assert.equal((await save(true)).status, 200);
          assert.equal((await request("/fixture/activity", "manager")).status, 200, "Save must clear a previously cached denial.");
          assert.equal((await repository.getRoleTabVisibility("manager")).activity, true);
          assert.equal((await save(false)).status, 200);
          assert.equal((await request("/fixture/activity", "manager")).status, 403, "Save must clear cached allowance.");
          for (const path of ["/api/search", "/api/search/global", "/api/search/columns", "/api/columns", "/api/search/collection-history"]) {
            assert.equal((await request(path, "manager")).status, 403, path);
          }
          assert.deepEqual(await repository.getRoleTabVisibility("user"), beforeUser);
          const manager = await repository.getRoleTabVisibility("manager");
          assert.deepEqual({ ...manager, activity: beforeManager.activity, "general-search": beforeManager["general-search"] }, beforeManager);
          const count = (await pool.query("SELECT count(*)::int AS n FROM system_settings")).rows[0].n;
          const versions = (await pool.query("SELECT count(*)::int AS n FROM setting_versions")).rows[0].n;
          assert.equal((await (await save(false)).json()).status, "unchanged");
          assert.equal((await pool.query("SELECT count(*)::int AS n FROM setting_versions")).rows[0].n, versions);
          assert.equal((await pool.query("SELECT count(*)::int AS n FROM system_settings")).rows[0].n, count);
          const beforeFailure = await snapshot();
          const broadcastsBefore = broadcasts.length;
          for (const role of ["manager", "admin", "user"]) {
            assert.equal((await request("/api/settings/role-permissions", role, { updates: updates(true), confirmCritical: true })).status, 403);
            assert.equal((await request("/api/settings", role, { key: updates(true)[0].key, value: true, confirmCritical: true })).status, 403);
          }
          for (const [entries, status] of [[[{ key: "tab_manager_backup_enabled", value: true }], 403], [[{ key: "tab_manager_unknown_enabled", value: true }], 400], [[...updates(true), updates(true)[0]], 400]] as const) {
            assert.equal((await request("/api/settings/role-permissions", "superuser", { updates: entries, confirmCritical: true })).status, status);
          }
          assert.deepEqual(await snapshot(), beforeFailure);
          await pool.query(`CREATE FUNCTION fixture_permission_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
            IF NEW.target_resource = 'tab_manager_general_search_enabled' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END $$;
            CREATE TRIGGER fixture_permission_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fixture_permission_audit_failure()`);
          const failedSave = await save(true);
          assert.equal(failedSave.status, 500);
          assert.doesNotMatch(JSON.stringify(await failedSave.json()), /INSERT INTO|fixture audit failure|stack|23503/i);
          assert.deepEqual(await snapshot(), beforeFailure, "Second-key audit failure must rollback both permissions and every version/audit write.");
          assert.equal(broadcasts.length, broadcastsBefore);
          await pool.query("DROP TRIGGER fixture_permission_audit_failure ON audit_logs");
          assert.equal((await request("/api/settings", "superuser", { key: updates(true)[0].key, value: true, confirmCritical: true })).status, 200);
          assert.equal((await request("/fixture/activity", "manager")).status, 200);
          await seedEnterpriseSettings(database);
          assert.equal((await new SettingsRepository().getRoleTabVisibility("manager")).activity, true, "Startup must preserve configured values.");
          // A user can enable a shared read consumer without enabling Import upload.
          assert.equal((await request("/api/settings/role-permissions", "superuser", { updates: [{ key: "tab_user_viewer_enabled", value: true }], confirmCritical: true })).status, 200);
          assert.equal((await request("/fixture/viewer", "user")).status, 200);
          const concurrent = await Promise.all([save(false), save(true)]);
          assert.deepEqual(concurrent.map((response) => response.status), [200, 200]);
          const finalTabs = await repository.getRoleTabVisibility("manager");
          assert.equal(finalTabs.activity, finalTabs["general-search"], "Concurrent multi-key saves cannot interleave into a mixed state.");
          const auditVersionCounts = (await pool.query(`SELECT
            (SELECT count(*)::int FROM setting_versions WHERE setting_key LIKE 'tab_manager_%') AS versions,
            (SELECT count(*)::int FROM audit_logs WHERE target_resource LIKE 'tab_manager_%') AS audits`)).rows[0];
          assert.equal(auditVersionCounts.versions, auditVersionCounts.audits);
          const settings = (await repository.getSettingsForRole("superuser")).flatMap((category) => category.settings);
          assert.equal(settings.find((setting) => setting.key === "tab_manager_backup_enabled")?.permission.canEdit, false);
        } finally { await stopTestServer(server); guards.stopActivityUpdateCacheSweep(); guards.stopTabVisibilityCacheSweep(); }
      } finally { for (const [key, value] of originals) mutable[key] = value; }
    } finally { await pool.end(); }
  } finally {
    if (created) { assert.match(name, /^sqr_role_permissions_\d+_[a-f0-9]{8}$/); await maintenance.query(`DROP DATABASE ${pg.escapeIdentifier(name)}`); }
    await maintenance.end();
  }
});
