import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { readMigrationFiles } from "drizzle-orm/migrator";
import pg from "pg";

// The runner creates a new loopback cluster using OS-only environment values.
// Never import dotenv or run this against an existing application database.
const isolated = process.env.SQR_AUTH_ISOLATED_CLUSTER === "1"
  && process.env.PG_DATABASE === "sqr_dashboard_scope_test";
test("Dashboard account scope on disposable PostgreSQL", { skip: !isolated }, async (t) => {
  assert.equal(process.env.PG_HOST, "127.0.0.1");
  assert.equal(process.env.PG_USER, "sqr_fixture");
  assert.equal(process.env.DATABASE_URL, undefined);
  delete process.env.SQR_AUTH_ISOLATED_CLUSTER;
  const pool = new pg.Pool({
    host: "127.0.0.1", port: Number(process.env.PG_PORT), user: "sqr_fixture",
    database: "sqr_dashboard_scope_test", max: 3, connectionTimeoutMillis: 3_000, statement_timeout: 30_000,
  });
  const runtime = await import("../../db-postgres");
  runtime.stopPgPoolBackgroundTasks();
  const repo = await import("../collection-dashboard-account-repository");
  const nicknameRepo = await import("../collection-repository-nickname-operations");
  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
  const scopeMigration = migrations.find((entry) => entry.sql.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS public.collection_dashboard_accounts")));
  assert.ok(scopeMigration);
  try {
    const migrate = async (migration: (typeof migrations)[number]) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const sql of migration.sql) await client.query(sql);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    };
    // Apply the real schema through 0063, seed historical sessions, then migrate.
    for (const migration of migrations) {
      if (migration === scopeMigration) break;
      await migrate(migration);
    }
    async function account(role = "user") {
      const id = randomUUID();
      const username = `fixture_${id.replace(/-/g, "")}`;
      await pool.query("INSERT INTO users (id,username,password_hash,role,status) VALUES ($1,$2,'synthetic-hash',$3,'active')", [id, username, role]);
      return { id, username, role };
    }
    async function nickname(role = "user") {
      const id = randomUUID();
      const name = `NICK_${id.replace(/-/g, "")}`;
      await pool.query("INSERT INTO collection_staff_nicknames (id,nickname,role_scope,nickname_password_hash,must_change_password,password_reset_by_superuser,password_updated_at) VALUES ($1,$2,$3,'synthetic-nickname-hash',false,false,now()-interval '1 hour')", [id, name, role]);
      return { id, name };
    }
    async function activity(user: Awaited<ReturnType<typeof account>>) {
      const id = randomUUID();
      await pool.query("INSERT INTO user_activity (id,user_id,username,role,is_active,login_time,last_activity_time) VALUES ($1,$2,$3,$4,true,now(),now())", [id, user.id, user.username, user.role]);
      return id;
    }
    async function historical(user: Awaited<ReturnType<typeof account>>, nick: Awaited<ReturnType<typeof nickname>>) {
      const id = await activity(user);
      await pool.query("INSERT INTO collection_nickname_sessions (activity_id,username,user_role,nickname,verified_at) VALUES($1,$2,$3,$4,now())", [id, user.username, user.role, nick.name]);
      return id;
    }
    const valid = await account();
    const validNick = await nickname();
    await historical(valid, validNick);
    const ambiguous = await account();
    await historical(ambiguous, await nickname());
    await historical(ambiguous, await nickname());
    const invalid = await account();
    const invalidNick = await nickname();
    await historical(invalid, invalidNick);
    await pool.query("UPDATE collection_staff_nicknames SET password_reset_by_superuser=true WHERE id=$1", [invalidNick.id]);
    const stale = await account();
    const staleSession = await historical(stale, await nickname());
    await pool.query("UPDATE user_activity SET is_active=false WHERE id=$1", [staleSession]);
    await migrate(scopeMigration);
    await t.test("migration backfills only unambiguous, valid server-verified account ownership", async () => {
      assert.equal((await repo.getCollectionDashboardAccount(valid.id))?.nicknameId, validNick.id);
      for (const user of [ambiguous, invalid, stale]) assert.equal(await repo.getCollectionDashboardAccount(user.id), null);
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM collection_dashboard_accounts")).rows[0].count, 1);
    });
    await t.test("real nickname session transaction remembers first login, persists logout and never changes to another nickname", async () => {
      const user = await account();
      const nick = await nickname();
      const session = await activity(user);
      const params = { activityId: session, username: user.username, userRole: user.role, nickname: nick.name, verifiedAt: new Date() };
      await nicknameRepo.setCollectionNicknameSessionRepository(params);
      assert.equal((await repo.getCollectionDashboardAccount(user.id))?.nicknameId, nick.id);
      await nicknameRepo.clearCollectionNicknameSessionByActivityRepository(session);
      assert.equal((await repo.getCollectionDashboardAccount(user.id))?.nicknameId, nick.id);
      await nicknameRepo.setCollectionNicknameSessionRepository({ ...params, nickname: (await nickname()).name });
      assert.equal((await repo.getCollectionDashboardAccount(user.id))?.nicknameId, nick.id);
    });
    await t.test("browser username hints, wrong roles, inactive and unverified nicknames cannot establish links", async () => {
      for (const invalidCase of ["username", "role", "inactive", "password", "reset", "old-password"]) {
        const user = await account();
        const nick = await nickname();
        const session = await activity(user);
        if (invalidCase === "inactive") await pool.query("UPDATE collection_staff_nicknames SET is_active=false WHERE id=$1", [nick.id]);
        if (invalidCase === "password") await pool.query("UPDATE collection_staff_nicknames SET nickname_password_hash=NULL WHERE id=$1", [nick.id]);
        if (invalidCase === "reset") await pool.query("UPDATE collection_staff_nicknames SET must_change_password=true WHERE id=$1", [nick.id]);
        await nicknameRepo.setCollectionNicknameSessionRepository({
          activityId: session, username: invalidCase === "username" ? "other" : user.username,
          userRole: invalidCase === "role" ? "admin" : user.role, nickname: nick.name,
          verifiedAt: invalidCase === "old-password" ? new Date("2000-01-01") : new Date(),
        });
        assert.equal(await repo.getCollectionDashboardAccount(user.id), null, invalidCase);
      }
    });
    await t.test("superuser assignment and deliberate removal are audited; removal cannot auto-regrant", async () => {
      const user = await account();
      const nick = await nickname();
      await repo.setCollectionDashboardAccount({ userId: user.id, nicknameId: nick.id, actor: "fixture.operator" });
      assert.equal((await repo.getCollectionDashboardAccount(user.id))?.isActive, true);
      await repo.setCollectionDashboardAccount({ userId: user.id, nicknameId: null, actor: "fixture.operator" });
      const session = await activity(user);
      await nicknameRepo.setCollectionNicknameSessionRepository({ activityId: session, username: user.username, userRole: user.role, nickname: nick.name, verifiedAt: new Date() });
      assert.equal((await repo.getCollectionDashboardAccount(user.id))?.nicknameId, null);
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM audit_logs WHERE action='COLLECTION_DASHBOARD_ACCOUNT_LINK_UPDATED' AND target_user=$1", [user.id])).rows[0].count, 2);
    });
    await t.test("competing verified first logins establish only one immutable default link", async () => {
      const user = await account();
      const nicknames = await Promise.all([nickname(), nickname()]);
      const sessions = await Promise.all([activity(user), activity(user)]);
      await Promise.all(sessions.map((session, index) => nicknameRepo.setCollectionNicknameSessionRepository({
        activityId: session, username: user.username, userRole: user.role,
        nickname: nicknames[index]!.name, verifiedAt: new Date(),
      })));
      const original = await repo.getCollectionDashboardAccount(user.id);
      assert.ok(nicknames.some((nick) => nick.id === original?.nicknameId));
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM collection_dashboard_accounts WHERE user_id=$1", [user.id])).rows[0].count, 1);
      await nicknameRepo.setCollectionNicknameSessionRepository({
        activityId: sessions[0]!, username: user.username, userRole: user.role,
        nickname: nicknames.find((nick) => nick.id !== original?.nicknameId)!.name, verifiedAt: new Date(),
      });
      assert.deepEqual(await repo.getCollectionDashboardAccount(user.id), original);
    });
    await t.test("role, active nickname and target account rules enforced again inside assignment transaction", async () => {
      const user = await account();
      const admin = await account("admin");
      const userNick = await nickname("user");
      const adminNick = await nickname("admin");
      await assert.rejects(repo.setCollectionDashboardAccount({ userId: user.id, nicknameId: adminNick.id, actor: "fixture" }));
      await assert.rejects(repo.setCollectionDashboardAccount({ userId: admin.id, nicknameId: userNick.id, actor: "fixture" }));
      const manager = await account("manager");
      await assert.rejects(repo.setCollectionDashboardAccount({ userId: manager.id, nicknameId: userNick.id, actor: "fixture" }));
      await assert.rejects(repo.setCollectionDashboardAccount({ userId: "unknown", nicknameId: null, actor: "fixture" }));
      await repo.setCollectionDashboardAccount({ userId: admin.id, nicknameId: adminNick.id, actor: "fixture" });
      assert.equal((await repo.getCollectionDashboardAccount(admin.id))?.isActive, true);
    });
    await t.test("stable IDs follow renames but role changes and inactive nicknames fail closed", async () => {
      const user = await account();
      const nick = await nickname("both");
      await repo.setCollectionDashboardAccount({ userId: user.id, nicknameId: nick.id, actor: "fixture" });
      await pool.query("UPDATE collection_staff_nicknames SET nickname=$2 WHERE id=$1", [nick.id, `${nick.name}_NEW`]);
      assert.equal((await repo.getCollectionDashboardAccount(user.id))?.nickname, `${nick.name}_NEW`);
      await pool.query("UPDATE users SET role='admin' WHERE id=$1", [user.id]);
      assert.equal((await repo.getCollectionDashboardAccount(user.id))?.isActive, false);
      await repo.setCollectionDashboardAccount({ userId: user.id, nicknameId: nick.id, actor: "fixture" });
      assert.equal((await repo.getCollectionDashboardAccount(user.id))?.isActive, true);
      await pool.query("UPDATE collection_staff_nicknames SET is_active=false WHERE id=$1", [nick.id]);
      assert.equal((await repo.getCollectionDashboardAccount(user.id))?.isActive, false);
    });
    await t.test("audit failure rolls back assignment atomically", async () => {
      const user = await account();
      const nick = await nickname();
      await pool.query("CREATE FUNCTION fixture_reject_dashboard_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit rejection'; END $$");
      await pool.query("CREATE TRIGGER fixture_reject_dashboard_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fixture_reject_dashboard_audit()");
      try {
        await assert.rejects(repo.setCollectionDashboardAccount({ userId: user.id, nicknameId: nick.id, actor: "fixture" }));
        assert.equal(await repo.getCollectionDashboardAccount(user.id), null);
      } finally { await pool.query("DROP TRIGGER fixture_reject_dashboard_audit ON audit_logs; DROP FUNCTION fixture_reject_dashboard_audit()"); }
    });
    await t.test("nickname deletion revokes link without deleting account; account deletion cascades only mapping", async () => {
      const user = await account();
      const nick = await nickname();
      await repo.setCollectionDashboardAccount({ userId: user.id, nicknameId: nick.id, actor: "fixture" });
      await pool.query("DELETE FROM collection_staff_nicknames WHERE id=$1", [nick.id]);
      assert.equal((await repo.getCollectionDashboardAccount(user.id))?.nicknameId, null);
      await pool.query("DELETE FROM users WHERE id=$1", [user.id]);
      assert.equal(await repo.getCollectionDashboardAccount(user.id), null);
    });
    await t.test("runtime bootstrap and migration rerun preserve mappings and explicit revocations", async () => {
      const before = (await pool.query("SELECT * FROM collection_dashboard_accounts ORDER BY user_id")).rows;
      const { ensureCollectionNicknameSessionsTable } = await import("../../internal/collection-bootstrap-nickname-sessions");
      await ensureCollectionNicknameSessionsTable();
      await migrate(scopeMigration);
      // A migration rerun may pick up newly verified accounts, but never replaces
      // an existing link or null revocation.
      for (const row of before) {
        const after = (await pool.query("SELECT * FROM collection_dashboard_accounts WHERE user_id=$1", [row.user_id])).rows[0];
        assert.deepEqual(after, row);
      }
    });
    await t.test("real summary SQL yields own / group / all monthly totals with no nickname session", async () => {
      const { PostgresStorage } = await import("../../storage-postgres");
      const { CollectionRecordSummaryReadOperations } = await import("../../services/collection/collection-record-summary-read-operations");
      const storage = new PostgresStorage();
      const service = new CollectionRecordSummaryReadOperations(storage);
      const user = await account();
      const admin = await account("admin");
      const operator = await account("superuser");
      const own = await nickname("user");
      const leader = await nickname("admin");
      const other = await nickname("user");
      await repo.setCollectionDashboardAccount({ userId: user.id, nicknameId: own.id, actor: operator.username });
      await repo.setCollectionDashboardAccount({ userId: admin.id, nicknameId: leader.id, actor: operator.username });
      const groupId = randomUUID();
      await pool.query("INSERT INTO admin_groups(id,leader_nickname_id,leader_nickname,created_by) VALUES($1,$2,$3,$4)", [groupId, leader.id, leader.name, operator.username]);
      await pool.query("INSERT INTO admin_group_members(id,admin_group_id,member_nickname_id,member_nickname) VALUES($1,$2,$3,$4)", [randomUUID(), groupId, own.id, own.name]);
      for (const [name, amount] of [[own.name, 100], [leader.name, 25], [other.name, 300]]) {
        await pool.query("INSERT INTO collection_record_monthly_rollups(year,month,created_by_login,collection_staff_nickname,total_records,total_amount) VALUES(2026,10,$1,$2,1,$3)", [operator.username, name, amount]);
        await pool.query("INSERT INTO collection_record_daily_rollups(payment_date,created_by_login,collection_staff_nickname,total_records,total_amount) VALUES('2026-10-15',$1,$2,1,$3)", [operator.username, name, amount]);
      }
      await pool.query("INSERT INTO collection_record_monthly_rollups(year,month,created_by_login,collection_staff_nickname,total_records,total_amount) VALUES(2026,9,$1,$2,1,999)", [operator.username, own.name]);
      for (const [viewer, amount] of [[user, 100], [admin, 125], [operator, 425], [{ ...operator, role: "manager" }, 425]] as const) {
        const summary = await service.getSummary({ userId: viewer.id, username: viewer.username, role: viewer.role, activityId: "no-nickname-session" },
          { year: "2026", month: "10", includeDashboard: "1" });
        assert.deepEqual(summary.summary.map((row) => [row.month, row.totalAmount]), [[10, amount]], viewer.role);
      }
      const session = await activity(user);
      await nicknameRepo.setCollectionNicknameSessionRepository({ activityId: session, username: user.username, userRole: user.role, nickname: other.name, verifiedAt: new Date() });
      const after = await service.getSummary({ userId: user.id, username: user.username, role: "user", activityId: session }, { year: "2026", month: "10", includeDashboard: "1" });
      assert.equal(after.summary[0]?.totalAmount, 100, "A different Collection login must not change Dashboard ownership");
    });
  } finally {
    await pool.end();
    await runtime.closePostgresPools();
  }
});
