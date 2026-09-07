import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import type { ErrorRequestHandler, RequestHandler } from "express";
import type { WebSocket } from "ws";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { db, dbRead } from "../../db-postgres";
import { ensureUsersBootstrapSchema } from "../../internal/users-bootstrap/schema";
import { ensureCollectionRecordBaseSchema } from "../../internal/collection-bootstrap-record-base-schema";
import { ensureCollectionAdminGroupsTables } from "../../internal/collection-bootstrap-admin-groups";
import { ensureCollectionStaffNicknamesTable } from "../../internal/collection-bootstrap-staff-nicknames";
import { ensureCoreAuditLogsTable, ensureCoreBannedSessionsTable, ensureCoreUserActivityTable } from "../../internal/core-schema-bootstrap-activity";
import { ensureCoreDataRowsTable, ensureCoreImportsTable } from "../../internal/core-schema-bootstrap-imports";
import { createAuthGuards } from "../../auth/guards";
import { signSessionJwtWithSecret } from "../../auth/session-jwt";
import { runWithRequestContext } from "../../lib/request-context";
import { errorHandler } from "../../middleware/error-handler";
import { AuthRepository } from "../auth.repository";
import { AuditRepository } from "../audit.repository";
import { deactivateUserActivities, getActiveActivitiesByUsername, getActivityById, updateActivity } from "../activity-repository-session-operations";
import { registerAuthRoutes } from "../../routes/auth.routes";
import { createJsonTestApp, startTestServer, stopTestServer } from "../../routes/tests/http-test-utils";
import type { PostgresStorage } from "../../storage-postgres";

const databaseConfig = {
  host: process.env.PG_HOST || "127.0.0.1", port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER || "postgres", password: process.env.PG_PASSWORD || "postgres",
};
const maintenanceDatabase = process.env.PG_MAINTENANCE_DATABASE || "postgres";
assert(["localhost", "127.0.0.1", "::1"].includes(databaseConfig.host), "Deletion integration fixtures require local PostgreSQL.");
const probe = new pg.Pool({ ...databaseConfig, database: maintenanceDatabase, max: 1, connectionTimeoutMillis: 1_500 });
const skipReason = await probe.query("SELECT 1").then(() => false as const, () => "Local PostgreSQL unavailable for isolated deletion integration.");
await probe.end();
const collectionRestriction = readFileSync(new URL("../../../drizzle/0035_reviewed_collection_record_created_by_delete_restrict.sql", import.meta.url), "utf8");
const supportingMigrations = [
  "0004_reviewed_collection_access_tables.sql",
  "0052_collection_source_governance_osp.sql",
  "0054_collection_osp_reconciliation_persistence.sql",
  "0062_collection_osp_private_client_ownership.sql",
].map((file) => readFileSync(new URL(`../../../drizzle/${file}`, import.meta.url), "utf8"));

async function withFixture(run: (pool: pg.Pool) => Promise<void>) {
  const maintenance = new pg.Pool({ ...databaseConfig, database: maintenanceDatabase, max: 1, connectionTimeoutMillis: 3_000 });
  const name = `sqr_auth_delete_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  let created = false;
  try {
    await maintenance.query(`CREATE DATABASE ${pg.escapeIdentifier(name)}`);
    created = true;
    const pool = new pg.Pool({ ...databaseConfig, database: name, max: 4 });
    try {
      const fixtureDatabase = drizzle(pool);
      await ensureUsersBootstrapSchema(fixtureDatabase);
      await ensureCoreUserActivityTable(fixtureDatabase);
      await ensureCoreBannedSessionsTable(fixtureDatabase);
      await ensureCoreAuditLogsTable(fixtureDatabase);
      await ensureCollectionRecordBaseSchema(fixtureDatabase);
      await pool.query(collectionRestriction);
      await ensureCoreImportsTable(fixtureDatabase);
      await ensureCoreDataRowsTable(fixtureDatabase);
      for (const migration of supportingMigrations) await pool.query(migration);
      const replacements = ["execute", "transaction", "select", "insert", "update", "delete"] as const;
      const originals = Array.from(new Set([db, dbRead])).map((database) => {
        const mutable = database as unknown as Record<string, unknown>;
        const entries = replacements.map((key) => ({ key, value: mutable[key] }));
        for (const key of replacements) mutable[key] = fixtureDatabase[key].bind(fixtureDatabase);
        return { mutable, entries };
      });
      try {
        await ensureCollectionStaffNicknamesTable();
        await ensureCollectionAdminGroupsTables();
        await run(pool);
      } finally {
        for (const { mutable, entries } of originals) for (const { key, value } of entries) mutable[key] = value;
      }
    } finally { await pool.end(); }
  } finally {
    try {
      if (created) {
        assert.match(name, /^sqr_auth_delete_\d+_[a-f0-9]{10}$/);
        let drained = false;
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const result = await maintenance.query("SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname = $1 AND backend_type = 'client backend'", [name]);
          if (result.rows[0].count === 0) { drained = true; break; }
          await delay(50 * (attempt + 1));
        }
        assert.equal(drained, true, "Do not terminate sessions to clean a disposable fixture.");
        await maintenance.query(`DROP DATABASE ${pg.escapeIdentifier(name)}`);
      }
    } finally { await maintenance.end(); }
  }
}

async function seedUser(pool: pg.Pool, role = "user") {
  const id = randomUUID();
  const username = `delete_${id.slice(0, 8)}`;
  await pool.query("INSERT INTO users (id, username, password_hash, role, status) VALUES ($1, $2, 'fixture-not-a-login-password', $3, 'active')", [id, username, role]);
  const activityId = randomUUID();
  await pool.query("INSERT INTO user_activity (id, user_id, username, role, is_active, login_time, last_activity_time) VALUES ($1, $2, $3, $4, true, now(), now())", [activityId, id, username, role]);
  return { id, username, role, activityId };
}

async function seedAuth(pool: pg.Pool, user: Awaited<ReturnType<typeof seedUser>>) {
  const activityId = randomUUID();
  await pool.query("INSERT INTO user_activity (id, user_id, username, role, is_active, login_time, last_activity_time) VALUES ($1, $2, $3, $4, true, now(), now())", [activityId, user.id, user.username, user.role]);
  await pool.query("INSERT INTO account_activation_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '1 day')", [randomUUID(), user.id, randomUUID()]);
  await pool.query("INSERT INTO password_reset_requests (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '1 day')", [randomUUID(), user.id, randomUUID()]);
  return activityId;
}

function buildStorage() {
  const auth = new AuthRepository();
  const audit = new AuditRepository();
  const methods = {
    deactivateUserActivities, getActiveActivitiesByUsername, getActivityById, updateActivity,
    createAuditLog: audit.createAuditLog.bind(audit),
    clearCollectionNicknameSessionByActivity: async () => undefined,
    isVisitorBanned: async () => false,
  };
  return new Proxy(methods, {
    get(target, property) {
      if (property in target) return target[property as keyof typeof target];
      const value = Reflect.get(auth, property);
      if (typeof value === "function") return value.bind(auth);
      return undefined;
    },
  }) as unknown as PostgresStorage;
}

type FixtureUser = Awaited<ReturnType<typeof seedUser>>;
type HttpFixture = {
  baseUrl: string;
  request: (pathname: string, options?: RequestInit) => Promise<Response>;
  errors: unknown[];
  tokenFor: (user: FixtureUser) => string;
  sockets: Map<string, WebSocket>;
  requestId: string;
};

async function withHttp(actor: FixtureUser, run: (fixture: HttpFixture) => Promise<void>) {
  const app = createJsonTestApp();
  const errors: unknown[] = [];
  const pass: RequestHandler = (_req, _res, next) => next();
  const secret = `delete-fixture-${randomUUID()}-${randomUUID()}`;
  const requestId = `api-delete-fixture-${randomUUID()}`;
  const storage = buildStorage();
  const guards = createAuthGuards({ storage, secret, activityUpdateThrottleMs: 60_000 });
  const tokenFor = (user: FixtureUser) => signSessionJwtWithSecret({
    userId: user.id, username: user.username, role: user.role, activityId: user.activityId,
  }, secret, { expiresIn: "1h" });
  const sockets = new Map<string, WebSocket>();
  app.use((_req, _res, next) => runWithRequestContext({ requestId }, next));
  app.get("/fixture/authenticated", guards.authenticateToken, (_req, res) => res.json({ ok: true }));
  registerAuthRoutes(app, {
    storage, authenticateToken: guards.authenticateToken,
    requireRole: guards.requireRole, connectedClients: sockets,
    rateLimiters: { adminAction: pass, adminDestructiveAction: pass },
  });
  const errorsHandler: ErrorRequestHandler = (error, _req, _res, next) => {
    errors.push(error);
    next(error);
  };
  app.use(errorsHandler);
  app.use(errorHandler);
  const { baseUrl, server } = await startTestServer(app);
  const token = tokenFor(actor);
  const request = (pathname: string, options: RequestInit = {}) => fetch(`${baseUrl}${pathname}`, {
    ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  try { await run({ baseUrl, errors, request, tokenFor, sockets, requestId }); } finally { await stopTestServer(server); }
}

async function captureState(pool: pg.Pool) {
  const tables = ["users", "account_activation_tokens", "password_reset_requests", "user_activity", "banned_sessions", "audit_logs", "admin_visible_nicknames", "collection_staff_nicknames", "collection_nickname_sessions", "admin_groups", "admin_group_members", "collection_records", "collection_source_configs", "collection_osp_saved_targets", "collection_osp_target_revisions", "collection_osp_private_client_results"];
  const state: Record<string, unknown> = {};
  for (const table of tables) {
    state[table] = (await pool.query(`SELECT to_jsonb(row) AS value FROM public.${pg.escapeIdentifier(table)} row ORDER BY to_jsonb(row)::text`)).rows;
  }
  return state;
}

test("PostgreSQL delete: Collection creator conflict is HTTP 409 and rolls back tokens, sessions and history", { skip: skipReason }, async () => {
  await withFixture(async (pool) => {
    const actor = await seedUser(pool, "superuser");
    const target = await seedUser(pool);
    await seedAuth(pool, target);
    await pool.query("INSERT INTO collection_records (id, batch, payment_date, amount, created_by_login, collection_staff_nickname, staff_username) VALUES ($1, 'fixture', '2026-09-07', 100, $2, 'Fixture Nickname', 'Fixture Nickname')", [randomUUID(), target.username]);
    await withHttp(actor, async ({ request, errors, tokenFor }) => {
      // Warm the actor's activity heartbeat before the transaction-only snapshot.
      assert.equal((await request("/fixture/authenticated")).status, 200);
      const before = await captureState(pool);
      const response = await request(`/api/admin/users/${target.id}`, { method: "DELETE" });
      assert.equal(response.status, 409);
      const payload = await response.json();
      assert.equal(payload.error.code, "ACCOUNT_UNAVAILABLE");
      assert.doesNotMatch(JSON.stringify(payload), /23503|fk_collection|DELETE FROM|stack/i);
      assert.equal(errors.length, 0);
      assert.deepEqual(await captureState(pool), before);
      assert.equal((await request("/fixture/authenticated", { headers: { Authorization: `Bearer ${tokenFor(target)}` } })).status, 200);
    });
  });
});

test("PostgreSQL delete: eligible accounts cascade only auth/visibility data, preserve history, audit once and reject old JWTs", { skip: skipReason }, async (t) => {
  await withFixture(async (pool) => {
    const actor = await seedUser(pool, "superuser");
    const unrelated = await seedUser(pool);
    await seedAuth(pool, unrelated);
    for (const role of ["user", "manager", "admin"]) {
      await t.test(role, async () => {
        const target = await seedUser(pool, role);
        const extraActivityId = await seedAuth(pool, target);
        const oldAuditId = randomUUID();
        await pool.query("INSERT INTO audit_logs (id, action, performed_by, target_user, details) VALUES ($1, 'ACCOUNT_CREATED', $2, $3, 'Historical actor and target snapshots')", [oldAuditId, target.username, target.id]);
        await pool.query("INSERT INTO banned_sessions (id, username, role, activity_id) VALUES ($1, $2, $3, $4)", [randomUUID(), target.username, target.role, extraActivityId]);
        const nicknameId = randomUUID();
        const groupId = randomUUID();
        const memberId = randomUUID();
        if (role === "admin") {
          await pool.query("INSERT INTO collection_staff_nicknames (id, nickname, created_by) VALUES ($1, $2, $3), ($4, $5, $3)", [nicknameId, `Fixture ${nicknameId}`, target.username, memberId, `Member ${memberId}`]);
          await pool.query("INSERT INTO admin_visible_nicknames (id, admin_user_id, nickname_id) VALUES ($1, $2, $3)", [randomUUID(), target.id, nicknameId]);
          await pool.query("INSERT INTO admin_groups (id, leader_nickname_id, leader_nickname, created_by) VALUES ($1, $2, $3, $4)", [groupId, nicknameId, `Fixture ${nicknameId}`, target.username]);
          await pool.query("INSERT INTO admin_group_members (id, admin_group_id, member_nickname_id, member_nickname) VALUES ($1, $2, $3, $4)", [randomUUID(), groupId, memberId, `Member ${memberId}`]);
          await pool.query("INSERT INTO collection_nickname_sessions (activity_id, username, user_role, nickname) VALUES ($1, $2, $3, $4)", [extraActivityId, target.username, role, `Fixture ${nicknameId}`]);
        }
        await withHttp(actor, async ({ request, errors, tokenFor, sockets, requestId }) => {
          const oldToken = tokenFor(target);
          assert.equal((await request("/fixture/authenticated", { headers: { Authorization: `Bearer ${oldToken}` } })).status, 200);
          const beforeList = await (await request("/api/admin/users")).json();
          assert.ok(beforeList.users.some((user: { id: string }) => user.id === target.id));
          let closed = 0;
          let logoutMessage = "";
          sockets.set(target.activityId, {
            readyState: 1,
            send(message: string) { logoutMessage = message; },
            close() { closed += 1; },
          } as unknown as WebSocket);
          // A transport race after DB commit must not turn a successful deletion into 500.
          sockets.set(extraActivityId, {
            readyState: 1,
            send() { throw new Error("fixture socket closed concurrently"); },
            close() { throw new Error("fixture socket already closed"); },
          } as unknown as WebSocket);
          const response = await request(`/api/admin/users/${target.id}`, {
            method: "DELETE", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: actor.id, role: "superuser" }),
          });
          assert.equal(response.status, 200);
          const payload = await response.json();
          assert.equal(payload.ok, true);
          assert.equal(payload.deleted, true);
          assert.equal(payload.user.id, target.id);
          assert.equal(errors.length, 0);
          assert.equal(closed, 1);
          assert.equal(sockets.size, 0, "Transport failures must not retain revoked clients.");
          assert.match(logoutMessage, /Account deleted by superuser/);
          assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id = $1", [target.id])).rows[0].n, 0);
          for (const table of ["account_activation_tokens", "password_reset_requests", "user_activity"]) {
            assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${pg.escapeIdentifier(table)} WHERE user_id = $1`, [target.id])).rows[0].n, 0, table);
          }
          assert.equal((await pool.query("SELECT count(*)::int AS n FROM banned_sessions WHERE username = $1", [target.username])).rows[0].n, 0);
          assert.equal((await pool.query("SELECT count(*)::int AS n FROM admin_visible_nicknames WHERE admin_user_id = $1", [target.id])).rows[0].n, 0);
          if (role === "admin") {
            assert.equal((await pool.query("SELECT created_by FROM collection_staff_nicknames WHERE id = $1", [nicknameId])).rows[0].created_by, null);
            assert.equal((await pool.query("SELECT created_by FROM admin_groups WHERE id = $1", [groupId])).rows[0].created_by, null);
            assert.equal((await pool.query("SELECT member_nickname_id FROM admin_group_members WHERE admin_group_id = $1", [groupId])).rows[0].member_nickname_id, memberId);
            assert.equal((await pool.query("SELECT 1 FROM collection_nickname_sessions WHERE activity_id = $1", [extraActivityId])).rowCount, 0);
          }
          assert.equal((await pool.query("SELECT details FROM audit_logs WHERE id = $1", [oldAuditId])).rows[0].details, "Historical actor and target snapshots");
          const logs = (await pool.query("SELECT * FROM audit_logs WHERE action = 'ACCOUNT_DELETED' AND target_user = $1", [target.id])).rows;
          assert.equal(logs.length, 1);
          assert.equal(logs[0].performed_by, actor.username);
          assert.equal(logs[0].request_id, requestId);
          assert.deepEqual(JSON.parse(logs[0].details), {
            metadata: { deleted_role: role, deleted_status: "active", was_banned: false },
          });
          const afterList = await (await request("/api/admin/users")).json();
          assert.ok(!afterList.users.some((user: { id: string }) => user.id === target.id));
          assert.equal((await request("/fixture/authenticated", { headers: { Authorization: `Bearer ${oldToken}` } })).status, 401);
          assert.equal((await request(`/api/admin/users/${target.id}`, { method: "DELETE" })).status, 404);
          assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id = $1", [unrelated.id])).rows[0].n, 1);
          assert.equal((await pool.query("SELECT count(*)::int AS n FROM account_activation_tokens WHERE user_id = $1", [unrelated.id])).rows[0].n, 1);
        });
      });
    }
  });
});

test("PostgreSQL delete: source configuration and Billing ownership remain restrictive, untouched HTTP 409 conflicts", { skip: skipReason }, async (t) => {
  await withFixture(async (pool) => {
    const actor = await seedUser(pool, "superuser");
    for (const relationship of ["source-configurator", "billing-creator", "billing-assigned-admin", "private-table-b-owner"]) {
      await t.test(relationship, async () => {
        const target = await seedUser(pool, "admin");
        await seedAuth(pool, target);
        const billingId = randomUUID();
        if (relationship === "source-configurator") {
          const sourceId = randomUUID();
          await pool.query("INSERT INTO imports (id, name, filename) VALUES ($1, 'Deletion fixture source', 'fixture.xlsx')", [sourceId]);
          await pool.query("INSERT INTO collection_source_configs (source_import_id, valid_from, valid_to, cycle_key, enabled, configured_by) VALUES ($1, '2026-09-01', '2026-09-30', 'fixture', false, $2)", [sourceId, target.username]);
        } else {
          await pool.query("INSERT INTO collection_osp_saved_targets (id, target_name, normalized_name, created_by, updated_by, assigned_admin_user_id) VALUES ($1, $2, $2, $3, $4, $5)", [billingId, `target ${billingId}`, relationship === "billing-creator" ? target.username : actor.username, actor.username, relationship === "billing-assigned-admin" ? target.id : null]);
          if (relationship === "private-table-b-owner") {
            const revisionId = randomUUID();
            await pool.query("INSERT INTO collection_osp_target_revisions (id, target_id, revision_number, source_scope_hash, period_from, period_to, tracking_start_date, created_by) VALUES ($1, $2, 1, $3, '2026-09-01', '2026-09-30', '2026-09-01', $4)", [revisionId, billingId, "a".repeat(64), actor.username]);
            await pool.query("INSERT INTO collection_osp_private_client_results (id, target_id, target_revision_id, owner_user_id, aging_bucket, target_percentage, result_percentage, osp_closed, as_of_date, created_by, updated_by) VALUES ($1, $2, $3, $4, 'D3', 50, 20, 400, '2026-09-07', $5, $5)", [randomUUID(), billingId, revisionId, target.id, actor.username]);
          }
        }
        await withHttp(actor, async ({ request, errors }) => {
          assert.equal((await request("/fixture/authenticated")).status, 200);
          const before = await captureState(pool);
          const response = await request(`/api/admin/users/${target.id}`, { method: "DELETE" });
          assert.equal(response.status, 409);
          assert.equal((await response.json()).error.code, "ACCOUNT_UNAVAILABLE");
          assert.equal(errors.length, 0);
          assert.deepEqual(await captureState(pool), before);
        });
      });
    }
  });
});

test("PostgreSQL delete: audit insertion failure remains sanitized HTTP 500 with complete rollback", { skip: skipReason }, async () => {
  await withFixture(async (pool) => {
    const actor = await seedUser(pool, "superuser");
    const target = await seedUser(pool);
    await seedAuth(pool, target);
    // SQLSTATE 23503 outside the users DELETE must never be misclassified as a normal dependency conflict.
    await pool.query("CREATE FUNCTION fixture_reject_delete_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'ACCOUNT_DELETED' THEN RAISE EXCEPTION 'fixture mandatory audit failed' USING ERRCODE = '23503'; END IF; RETURN NEW; END $$");
    await pool.query("CREATE TRIGGER fixture_reject_delete_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fixture_reject_delete_audit()");
    await withHttp(actor, async ({ request, errors, sockets }) => {
      let notified = false;
      sockets.set(target.activityId, { readyState: 1, send() { notified = true; }, close() { notified = true; } } as unknown as WebSocket);
      assert.equal((await request("/fixture/authenticated")).status, 200);
      const before = await captureState(pool);
      const response = await request(`/api/admin/users/${target.id}`, { method: "DELETE" });
      assert.equal(response.status, 500);
      assert.doesNotMatch(await response.text(), /23503|fixture mandatory|INSERT INTO|stack|node_modules/i);
      assert.equal(errors.length, 1);
      assert.deepEqual(await captureState(pool), before);
      assert.equal(notified, false);
    });
  });
});

test("PostgreSQL delete: canceled deletion rolls back earlier auth cleanup and never emits success or audit", { skip: skipReason }, async () => {
  await withFixture(async (pool) => {
    const actor = await seedUser(pool, "superuser");
    const target = await seedUser(pool);
    await seedAuth(pool, target);
    await pool.query("CREATE FUNCTION fixture_cancel_user_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$");
    await pool.query("CREATE TRIGGER fixture_cancel_user_delete BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION fixture_cancel_user_delete()");
    await withHttp(actor, async ({ request }) => {
      assert.equal((await request("/fixture/authenticated")).status, 200);
      const before = await captureState(pool);
      const response = await request(`/api/admin/users/${target.id}`, { method: "DELETE" });
      assert.equal(response.status, 500);
      assert.deepEqual(await captureState(pool), before);
    });
  });
});

test("PostgreSQL delete: role protection and system history retained; unknown and malformed IDs are deterministic", { skip: skipReason }, async (t) => {
  await withFixture(async (pool) => {
    const actor = await seedUser(pool, "superuser");
    const target = await seedUser(pool);
    await seedAuth(pool, target);
    await withHttp(actor, async ({ baseUrl, request, errors }) => {
      assert.equal((await fetch(`${baseUrl}/api/admin/users/${target.id}`, { method: "DELETE" })).status, 401);
      assert.equal((await request(`/api/admin/users/${actor.id}`, { method: "DELETE" })).status, 403);
      const anotherSuperuser = await seedUser(pool, "superuser");
      assert.equal((await request(`/api/admin/users/${anotherSuperuser.id}`, { method: "DELETE" })).status, 403);
      // The built-in actor is role=user, not protected by a fabricated role rule.
      // Its real historical ownership constraint is the existing protection.
      const system = (await pool.query("SELECT id, username FROM users WHERE username = 'system'")).rows[0];
      await pool.query("INSERT INTO collection_records (id, batch, payment_date, amount, created_by_login, collection_staff_nickname, staff_username) VALUES ($1, 'fixture-system', '2026-09-07', 100, $2, 'System History', 'System History')", [randomUUID(), system.username]);
      assert.equal((await request(`/api/admin/users/${system.id}`, { method: "DELETE" })).status, 409);
      assert.equal((await request(`/api/admin/users/${randomUUID()}`, { method: "DELETE" })).status, 404);
      // User IDs are TEXT, including legitimate legacy IDs: malformed-but-printable unknown IDs remain 404.
      assert.equal((await request("/api/admin/users/not-a-uuid", { method: "DELETE" })).status, 404);
      assert.equal((await request("/api/admin/users/%00", { method: "DELETE" })).status, 400);
      assert.equal((await request("/api/admin/users/%20", { method: "DELETE" })).status, 400);
      assert.equal((await request(`/api/admin/users/${"x".repeat(5000)}`, { method: "DELETE" })).status, 400);
      assert.equal(errors.length, 0);
    });
    for (const role of ["user", "manager", "admin"]) {
      await t.test(`${role} denied even with forged body`, async () => {
        const caller = await seedUser(pool, role);
        await withHttp(caller, async ({ request }) => {
          const response = await request(`/api/admin/users/${target.id}`, {
            method: "DELETE", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: "superuser", userId: actor.id }),
          });
          assert.equal(response.status, 403);
        });
      });
    }
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE id = $1", [target.id])).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM account_activation_tokens WHERE user_id = $1", [target.id])).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'ACCOUNT_DELETED'")).rows[0].n, 0);
  });
});

test("PostgreSQL delete: concurrent requests commit exactly once and legacy TEXT identifiers remain supported", { skip: skipReason }, async () => {
  await withFixture(async (pool) => {
    const actor = await seedUser(pool, "superuser");
    const target = await seedUser(pool);
    await seedAuth(pool, target);
    const legacyId = `legacy-user-${randomUUID()}`;
    await pool.query("UPDATE users SET id = $1 WHERE id = $2", [legacyId, target.id]);
    await withHttp(actor, async ({ request }) => {
      const responses = await Promise.all([
        request(`/api/admin/users/${legacyId}`, { method: "DELETE" }),
        request(`/api/admin/users/${legacyId}`, { method: "DELETE" }),
      ]);
      assert.deepEqual(responses.map((response) => response.status).sort(), [200, 404]);
      assert.equal((await pool.query("SELECT 1 FROM users WHERE id = $1", [legacyId])).rowCount, 0);
      assert.equal((await pool.query("SELECT 1 FROM audit_logs WHERE action = 'ACCOUNT_DELETED' AND target_user = $1", [legacyId])).rowCount, 1);
      assert.equal((await pool.query("SELECT 1 FROM account_activation_tokens WHERE user_id = $1", [legacyId])).rowCount, 0);
    });
  });
});
