import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const isolated = process.env.SQR_AUTH_ISOLATED_CLUSTER === "1";
test("authentication recovery transactions on disposable PostgreSQL", { skip: !isolated }, async (t) => {
  assert.equal(process.env.PG_HOST, "127.0.0.1");
  assert.equal(process.env.PG_DATABASE, "sqr_auth_recovery_test");
  assert.equal(process.env.PG_USER, "sqr_fixture");
  assert.equal(process.env.DATABASE_URL, undefined);
  delete process.env.SQR_AUTH_ISOLATED_CLUSTER;
  const pool = new pg.Pool({
    host: "127.0.0.1", port: Number(process.env.PG_PORT), user: "sqr_fixture",
    database: "sqr_auth_recovery_test", max: 5, connectionTimeoutMillis: 3_000,
    statement_timeout: 10_000,
  });
  const database = drizzle(pool);
  const runtime = await import("../../db-postgres");
  runtime.stopPgPoolBackgroundTasks();
  const { ensureUsersBootstrapSchema } = await import("../../internal/users-bootstrap/schema");
  const { ensureCoreUserActivityTable } = await import("../../internal/core-schema-bootstrap-activity");
  const { completeAccountRecovery, prepareDeliveredPasswordReset } = await import("../auth-recovery-repository-utils");
  const { createActivationToken } = await import("../auth-activation-token-repository-utils");
  const { createPasswordResetRequest } = await import("../auth-password-reset-repository-utils");
  const { updateAuthUserAccount } = await import("../auth-user-repository-write-utils");
  const { createActivity } = await import("../activity-repository-session-operations");
  const { buildTwoFactorCredentialState } = await import("../../auth/two-factor");
  try {
    await ensureUsersBootstrapSchema(database);
    await ensureCoreUserActivityTable(database);
    async function fixture(kind: "activation" | "password_reset" = "password_reset", extra = {}) {
      const userId = randomUUID();
      await pool.query("INSERT INTO users(id,username,password_hash,role,status,locked_at,locked_by_system,failed_login_attempts) VALUES($1,$2,$3,'admin',$4,now(),true,5)",
        [userId, `fixture_${userId.replace(/-/g, "")}`, "original-hash", kind === "activation" ? "pending_activation" : "active"]);
      const activityId = randomUUID();
      await pool.query("INSERT INTO user_activity(id,user_id,username,role,is_active,login_time,last_activity_time) SELECT $2,id,username,role,true,now(),now() FROM users WHERE id=$1", [userId, activityId]);
      const tokenHash = randomUUID().replace(/-/g, "");
      const expiresAt = new Date(Date.now() + 60_000);
      const token = kind === "activation"
        ? await createActivationToken({ userId, tokenHash, expiresAt, createdBy: "fixture-admin", ...extra }, database)
        : await createPasswordResetRequest({ userId, tokenHash, expiresAt, requestedByUser: null, approvedBy: "fixture-admin", ...extra }, database);
      const params = { kind, userId, tokenId: token.id, tokenHash, passwordHash: "chosen-new-hash" };
      return { params, token, userId, activityId, table: kind === "activation" ? "account_activation_tokens" : "password_reset_requests" };
    }
    const userState = async (userId: string) => (await pool.query("SELECT password_hash,status,must_change_password,password_reset_by_superuser,locked_at FROM users WHERE id=$1", [userId])).rows[0];
    const sessionActive = async (userId: string) => (await pool.query("SELECT is_active FROM user_activity WHERE user_id=$1", [userId])).rows[0].is_active;
    const tokenUsed = async (f: Awaited<ReturnType<typeof fixture>>) => (await pool.query(`SELECT used_at FROM ${f.table} WHERE id=$1`, [f.token.id])).rows[0].used_at;

    for (const kind of ["activation", "password_reset"] as const) {
      await t.test(`${kind}: success changes hash, consumes once and revokes sessions atomically`, async () => {
        const f = await fixture(kind);
        const result = await completeAccountRecovery(f.params, database);
        assert.ok(result);
        assert.equal(result.lockCleared, true);
        assert.equal(result.user.passwordHash, "chosen-new-hash");
        assert.equal(result.user.mustChangePassword, false);
        assert.equal(result.user.status, "active");
        assert.deepEqual(result.closedSessionIds, [f.activityId], "Committed revocation must retain socket IDs after rows become inactive.");
        assert.ok(await tokenUsed(f));
        assert.equal(await sessionActive(f.userId), false);
        assert.equal(await completeAccountRecovery({ ...f.params, passwordHash: "replay-hash" }, database), undefined);
        assert.equal((await userState(f.userId)).password_hash, "chosen-new-hash");
      });
      await t.test(`${kind}: competing consumers cannot redeem the same token twice`, async () => {
        const f = await fixture(kind);
        const results = await Promise.all([
          completeAccountRecovery({ ...f.params, passwordHash: "winner-one" }, database),
          completeAccountRecovery({ ...f.params, passwordHash: "winner-two" }, database),
        ]);
        assert.equal(results.filter(Boolean).length, 1);
        assert.equal((await userState(f.userId)).password_hash, results.find(Boolean)!.user.passwordHash);
      });
      await t.test(`${kind}: concurrent resends leave exactly one unused link`, async () => {
        const f = await fixture(kind);
        const issue = (tokenHash: string) => kind === "activation"
          ? createActivationToken({ userId: f.userId, tokenHash, expiresAt: new Date(Date.now() + 60_000), createdBy: "fixture-admin" }, database)
          : createPasswordResetRequest({ userId: f.userId, tokenHash, expiresAt: new Date(Date.now() + 60_000), requestedByUser: null, approvedBy: "fixture-admin" }, database);
        await Promise.all([issue("resend-one"), issue("resend-two")]);
        assert.equal((await pool.query(`SELECT count(*)::int AS count FROM ${f.table} WHERE user_id=$1 AND used_at IS NULL`, [f.userId])).rows[0].count, 1);
        assert.equal(await completeAccountRecovery(f.params, database), undefined);
        assert.equal((await userState(f.userId)).password_hash, "original-hash");
      });
    }
    await t.test("password update trigger failure rolls back consumed token and preserves session", async () => {
      const f = await fixture();
      await pool.query("CREATE FUNCTION fixture_reject_password() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.password_hash='fail-trigger-hash' THEN RAISE EXCEPTION 'fixture rejection'; END IF; RETURN NEW; END $$");
      await pool.query("CREATE TRIGGER fixture_reject_password BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fixture_reject_password()");
      try {
        await assert.rejects(completeAccountRecovery({ ...f.params, passwordHash: "fail-trigger-hash" }, database));
        assert.equal(await tokenUsed(f), null);
        assert.equal((await userState(f.userId)).password_hash, "original-hash");
        assert.equal(await sessionActive(f.userId), true);
      } finally { await pool.query("DROP TRIGGER fixture_reject_password ON users; DROP FUNCTION fixture_reject_password()"); }
    });
    await t.test("session revocation failure rolls back hash and token consumption", async () => {
      const f = await fixture();
      await pool.query("CREATE FUNCTION fixture_reject_revoke() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture revocation rejection'; END $$");
      await pool.query("CREATE TRIGGER fixture_reject_revoke BEFORE UPDATE ON user_activity FOR EACH ROW EXECUTE FUNCTION fixture_reject_revoke()");
      try {
        await assert.rejects(completeAccountRecovery(f.params, database));
        assert.equal(await tokenUsed(f), null);
        assert.equal((await userState(f.userId)).password_hash, "original-hash");
        assert.equal(await sessionActive(f.userId), true);
      } finally { await pool.query("DROP TRIGGER fixture_reject_revoke ON user_activity; DROP FUNCTION fixture_reject_revoke()"); }
    });
    await t.test("expiry is evaluated after waiting for the user lock", async () => {
      const f = await fixture("password_reset", { expiresAt: new Date(Date.now() + 400) });
      const holder = await pool.connect();
      try {
        await holder.query("BEGIN");
        await holder.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [f.userId]);
        const result = completeAccountRecovery(f.params, database);
        await delay(650);
        await holder.query("COMMIT");
        assert.equal(await result, undefined);
        assert.equal(await tokenUsed(f), null);
        assert.equal(await sessionActive(f.userId), true);
      } finally { await holder.query("ROLLBACK"); holder.release(); }
    });
    await t.test("wrong hashes, expired links and forbidden target states cannot change credentials", async () => {
      const f = await fixture();
      assert.equal(await completeAccountRecovery({ ...f.params, tokenHash: "wrong-hash" }, database), undefined);
      await pool.query("UPDATE users SET role='superuser' WHERE id=$1", [f.userId]);
      assert.equal(await completeAccountRecovery(f.params, database), undefined);
      const activation = await fixture("activation");
      await pool.query("UPDATE users SET is_banned=true WHERE id=$1", [activation.userId]);
      assert.equal(await completeAccountRecovery(activation.params, database), undefined);
      await pool.query("UPDATE users SET is_banned=false,status='active' WHERE id=$1", [activation.userId]);
      assert.equal(await completeAccountRecovery(activation.params, database), undefined);
      assert.equal(await tokenUsed(f), null);
      assert.equal(await tokenUsed(activation), null);
    });
    await t.test("delivered reset preparation preserves the live link and atomically revokes old sessions", async () => {
      const f = await fixture();
      await createPasswordResetRequest({ userId: f.userId, requestedByUser: f.userId }, database);
      const result = await prepareDeliveredPasswordReset({
        userId: f.userId, requestId: f.token.id, tokenHash: f.params.tokenHash,
        expectedPasswordHash: "original-hash", passwordHash: "temporary-placeholder", approvedBy: "fixture-admin",
      }, database);
      assert.ok(result);
      assert.equal(result.user.mustChangePassword, true);
      assert.deepEqual(result.closedSessionIds, [f.activityId]);
      assert.equal(await tokenUsed(f), null);
      assert.equal(await sessionActive(f.userId), false);
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM password_reset_requests WHERE user_id=$1 AND approved_by IS NULL AND used_at IS NULL", [f.userId])).rows[0].count, 0);
      const completed = await completeAccountRecovery(f.params, database);
      assert.ok(completed);
      assert.deepEqual(completed.closedSessionIds, [], "Already revoked sessions must not appear as newly closed.");
    });
    await t.test("SMTP completion after token redemption cannot overwrite the user's new password", async () => {
      const f = await fixture();
      await completeAccountRecovery(f.params, database);
      assert.equal(await prepareDeliveredPasswordReset({
        userId: f.userId, requestId: f.token.id, tokenHash: f.params.tokenHash,
        expectedPasswordHash: "original-hash", passwordHash: "temporary-placeholder", approvedBy: "fixture-admin",
      }, database), undefined);
      assert.equal((await userState(f.userId)).password_hash, "chosen-new-hash");
    });
    await t.test("SMTP completion for superseded link or changed credentials fails closed", async () => {
      const f = await fixture();
      const prepare = { userId: f.userId, requestId: f.token.id, tokenHash: f.params.tokenHash,
        expectedPasswordHash: "original-hash", passwordHash: "temporary-placeholder", approvedBy: "fixture-admin" };
      assert.equal(await prepareDeliveredPasswordReset({ ...prepare, expectedPasswordHash: "stale-hash" }, database), undefined);
      await createPasswordResetRequest({ userId: f.userId, requestedByUser: null, approvedBy: "fixture-admin", tokenHash: "newer-token", expiresAt: new Date(Date.now() + 60_000) }, database);
      assert.equal(await prepareDeliveredPasswordReset(prepare, database), undefined);
      assert.equal((await userState(f.userId)).password_hash, "original-hash");
      assert.equal(await sessionActive(f.userId), true);
    });
    await t.test("self-password CAS cannot overwrite a completed reset and competing changes have one winner", async () => {
      const f = await fixture();
      assert.ok(await completeAccountRecovery(f.params, database));
      const stale = await updateAuthUserAccount({
        userId: f.userId, expectedPasswordHash: "original-hash", passwordHash: "stale-overwrite",
      }, database);
      assert.equal(stale, undefined);
      assert.equal((await userState(f.userId)).password_hash, "chosen-new-hash");
      const results = await Promise.all([
        updateAuthUserAccount({ userId: f.userId, expectedPasswordHash: "chosen-new-hash", passwordHash: "first-change" }, database),
        updateAuthUserAccount({ userId: f.userId, expectedPasswordHash: "chosen-new-hash", passwordHash: "second-change" }, database),
      ]);
      assert.equal(results.filter(Boolean).length, 1);
      assert.equal((await userState(f.userId)).password_hash, results.find(Boolean)!.passwordHash);
    });
    await t.test("2FA compare-and-set rejects stale setup, password and enabled state", async () => {
      const f = await fixture();
      const expected = { enabled: false, encryptedSecret: null, passwordHash: "original-hash" };
      assert.ok(await updateAuthUserAccount({ userId: f.userId, twoFactorSecretEncrypted: "setup-one", expectedTwoFactorState: expected }, database));
      assert.equal(await updateAuthUserAccount({ userId: f.userId, twoFactorEnabled: true, expectedTwoFactorState: expected }, database), undefined);
      const pending = { ...expected, encryptedSecret: "setup-one" };
      await pool.query("UPDATE users SET password_hash='changed-hash' WHERE id=$1", [f.userId]);
      assert.equal(await updateAuthUserAccount({ userId: f.userId, twoFactorEnabled: true, expectedTwoFactorState: pending }, database), undefined);
      assert.ok(await updateAuthUserAccount({ userId: f.userId, twoFactorEnabled: true, expectedTwoFactorState: { ...pending, passwordHash: "changed-hash" } }, database));
      assert.equal(await updateAuthUserAccount({ userId: f.userId, twoFactorEnabled: false, expectedTwoFactorState: { ...pending, passwordHash: "changed-hash" } }, database), undefined);
      assert.equal((await pool.query("SELECT two_factor_enabled FROM users WHERE id=$1", [f.userId])).rows[0].two_factor_enabled, true);
    });
    await t.test("2FA session insertion serializes with credential changes and never uses stale proof", async () => {
      const f = await fixture();
      const user = await updateAuthUserAccount({ userId: f.userId, twoFactorEnabled: true,
        twoFactorSecretEncrypted: "confirmed-factor", lockedAt: null, lockedBySystem: false }, database);
      assert.ok(user);
      const expected = { credentialState: buildTwoFactorCredentialState(user), expiresAtMs: Date.now() + 60_000 };
      const input = { userId: user.id, username: user.username, role: user.role };
      const holder = await pool.connect();
      try {
        await holder.query("BEGIN");
        await holder.query("UPDATE users SET password_hash='changed-during-otp' WHERE id=$1", [f.userId]);
        const pending = createActivity(input, expected, database);
        // Attach rejection handling before releasing the lock.
        const rejected = assert.rejects(pending, (error: unknown) => {
          assert.equal((error as { code?: string }).code, "TWO_FACTOR_CHALLENGE_EXPIRED"); return true;
        });
        await delay(40);
        await holder.query("COMMIT");
        await rejected;
        assert.equal((await pool.query("SELECT count(*)::int AS count FROM user_activity WHERE user_id=$1", [f.userId])).rows[0].count, 1);
      } finally { await holder.query("ROLLBACK"); holder.release(); }
      const freshUser = { ...user, passwordHash: "changed-during-otp" };
      const fresh = await createActivity(input, { ...expected, credentialState: buildTwoFactorCredentialState(freshUser) }, database);
      assert.equal(fresh.isActive, true);
      await completeAccountRecovery(f.params, database);
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM user_activity WHERE user_id=$1 AND is_active=true", [f.userId])).rows[0].count, 0);
    });
  } finally {
    await pool.end();
    await runtime.pool.end();
    if (runtime.readReplicaPool) await runtime.readReplicaPool.end();
  }
});
