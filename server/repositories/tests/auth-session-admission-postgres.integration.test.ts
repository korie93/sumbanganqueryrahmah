import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const isolated = process.env.SQR_AUTH_ISOLATED_CLUSTER === "1";
test("session admission serializes with recovery on disposable PostgreSQL", { skip: !isolated }, async (t) => {
  assert.equal(process.env.PG_HOST, "127.0.0.1");
  assert.equal(process.env.PG_DATABASE, "sqr_auth_recovery_test");
  assert.equal(process.env.PG_USER, "sqr_fixture");
  assert.equal(process.env.DATABASE_URL, undefined);
  delete process.env.SQR_AUTH_ISOLATED_CLUSTER;
  const applicationName = `sqr_admission_${randomUUID()}`;
  const config = {
    host: "127.0.0.1", port: Number(process.env.PG_PORT), user: "sqr_fixture",
    database: "sqr_auth_recovery_test", max: 5, connectionTimeoutMillis: 3_000,
    statement_timeout: 10_000,
  };
  const pool = new pg.Pool(config);
  const admissionPool = new pg.Pool({ ...config, max: 1, application_name: applicationName });
  const database = drizzle(pool);
  const admissionDatabase = drizzle(admissionPool);
  const runtime = await import("../../db-postgres");
  runtime.stopPgPoolBackgroundTasks();
  const { ensureUsersBootstrapSchema } = await import("../../internal/users-bootstrap/schema");
  const { ensureCoreUserActivityTable } = await import("../../internal/core-schema-bootstrap-activity");
  const { completeAccountRecovery } = await import("../auth-recovery-repository-utils");
  const { createPasswordResetRequest } = await import("../auth-password-reset-repository-utils");
  const { createActivity } = await import("../activity-repository-session-operations");
  const { invalidateUserSessions } = await import("../../services/auth-account-session-lifecycle-utils");
  const { buildTwoFactorCredentialState } = await import("../../auth/two-factor");
  const { userActivity, users } = await import("../../../shared/schema-postgres");
  const invalidCredentials = (error: unknown) => {
    assert.equal((error as { code?: string }).code, "INVALID_CREDENTIALS"); return true;
  };
  const expiredChallenge = (error: unknown) => {
    assert.equal((error as { code?: string }).code, "TWO_FACTOR_CHALLENGE_EXPIRED"); return true;
  };
  try {
    await ensureUsersBootstrapSchema(database);
    await ensureCoreUserActivityTable(database);
    async function fixture() {
      const userId = randomUUID();
      const email = `${userId}@example.test`;
      await pool.query("INSERT INTO users(id,username,email,password_hash,role,status) VALUES($1,$2,$3,'verified-old-hash','user','active')",
        [userId, `admission_${userId.replace(/-/g, "")}`, email]);
      const [user] = await database.select().from(users).where(eq(users.id, userId));
      const tokenHash = randomUUID().replace(/-/g, "");
      const token = await createPasswordResetRequest({
        userId, tokenHash, expiresAt: new Date(Date.now() + 60_000),
        requestedByUser: null, approvedBy: "fixture-admin", expectedRecipientEmail: email,
      }, database);
      return {
        user, input: { userId, username: user.username, role: user.role },
        expected: { kind: "password" as const, credentialState: buildTwoFactorCredentialState(user) },
        recovery: { kind: "password_reset" as const, userId, tokenId: token.id, tokenHash, passwordHash: "reset-new-hash" },
      };
    }
    const activeCount = async (userId: string) => (await pool.query(
      "SELECT count(*)::int AS count FROM user_activity WHERE user_id=$1 AND is_active=true", [userId],
    )).rows[0].count;
    const totalCount = async (userId: string) => (await pool.query(
      "SELECT count(*)::int AS count FROM user_activity WHERE user_id=$1", [userId],
    )).rows[0].count;
    async function waitForAdmissionLock() {
      const deadline = performance.now() + 5_000;
      while (performance.now() < deadline) {
        const result = await pool.query(
          "SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0",
          [applicationName],
        );
        if (result.rowCount) return;
        await delay(10);
      }
      assert.fail("Admission did not wait for the recovery user-row lock.");
    }

    await t.test("a paused old-password login cannot insert after both recovery cleanup passes", async () => {
      const f = await fixture();
      const previous = await createActivity(f.input, f.expected, admissionDatabase);
      const recovered = await completeAccountRecovery(f.recovery, database);
      assert.ok(recovered);
      assert.deepEqual(recovered.closedSessionIds, [previous.id]);
      // This is the service's second, post-commit cleanup. Resume admission only
      // after it finishes, reproducing the window left by unguarded insertion.
      await invalidateUserSessions({
        getActiveActivitiesByUsername: async (username) => (await database.select().from(userActivity))
          .filter((activity) => activity.username === username && activity.isActive),
        deactivateUserActivities: async (username, reason) => {
          await pool.query("UPDATE user_activity SET is_active=false,logout_time=now(),logout_reason=$2 WHERE username=$1 AND is_active=true", [username, reason]);
        },
      }, f.user.username, "PASSWORD_RESET_COMPLETED");
      await assert.rejects(createActivity(f.input, f.expected, admissionDatabase), invalidCredentials);
      assert.equal(await totalCount(f.user.id), 1);
      assert.equal(await activeCount(f.user.id), 0);
      const fresh = await createActivity(f.input, {
        kind: "password", credentialState: buildTwoFactorCredentialState(recovered.user),
      }, admissionDatabase);
      assert.equal(fresh.isActive, true, "A fresh proof after recovery must still admit login.");
    });

    await t.test("admission waiting behind a committed recovery rejects the pre-reset password proof", async () => {
      const f = await fixture();
      let releaseRecovery!: () => void;
      let recoveryHasLock!: () => void;
      const release = new Promise<void>((resolve) => { releaseRecovery = resolve; });
      const locked = new Promise<void>((resolve) => { recoveryHasLock = resolve; });
      const heldDatabase = {
        transaction: (callback: Parameters<typeof database.transaction>[0]) => database.transaction(async (tx) => {
          const result = await callback(tx);
          recoveryHasLock();
          await release;
          return result;
        }),
      } as typeof database;
      const recovery = completeAccountRecovery(f.recovery, heldDatabase);
      const recoveryResult = recovery.then((result) => ({ result }), (error: unknown) => ({ error }));
      let denied: Promise<void> | undefined;
      try {
        await Promise.race([locked, recoveryResult.then((outcome) => {
          if ("error" in outcome) throw outcome.error;
          throw new Error("Recovery completed before the lock barrier.");
        })]);
        denied = assert.rejects(createActivity(f.input, f.expected, admissionDatabase), invalidCredentials);
        void denied.catch(() => undefined);
        await waitForAdmissionLock();
      } finally {
        releaseRecovery();
        const outcome = await recoveryResult;
        if ("error" in outcome) throw outcome.error;
        assert.ok(outcome.result);
        await denied;
      }
      assert.equal(await totalCount(f.user.id), 0);
    });

    await t.test("a login ordered before recovery is included in its atomic revocation", async () => {
      const f = await fixture();
      const activity = await createActivity(f.input, f.expected, admissionDatabase);
      const recovered = await completeAccountRecovery(f.recovery, database);
      assert.ok(recovered);
      assert.deepEqual(recovered.closedSessionIds, [activity.id]);
      assert.equal(await activeCount(f.user.id), 0);
    });

    await t.test("password admission checks current identity, role, factor and eligibility under the lock", async () => {
      for (const mutation of [
        "username=username || '_changed'", "role='admin'", "two_factor_enabled=true",
        "two_factor_secret_encrypted='pending-factor'", "is_banned=true",
        "status='disabled'", "status='pending_activation'", "status='suspended'", "locked_at=now()",
      ]) {
        const f = await fixture();
        await pool.query(`UPDATE users SET ${mutation} WHERE id=$1`, [f.user.id]);
        await assert.rejects(createActivity(f.input, f.expected, admissionDatabase), invalidCredentials);
        assert.equal(await totalCount(f.user.id), 0, mutation);
      }
    });

    await t.test("MFA admission retains expiry, credential and enabled-factor guards", async () => {
      const f = await fixture();
      await pool.query("UPDATE users SET two_factor_enabled=true,two_factor_secret_encrypted='confirmed-factor' WHERE id=$1", [f.user.id]);
      const [user] = await database.select().from(users).where(eq(users.id, f.user.id));
      const expected = { kind: "two_factor" as const, credentialState: buildTwoFactorCredentialState(user), expiresAtMs: Date.now() + 60_000 };
      await assert.rejects(createActivity(f.input, { ...expected, expiresAtMs: Date.now() - 1 }, admissionDatabase), expiredChallenge);
      await assert.rejects(createActivity(f.input, { ...expected, credentialState: "stale-proof" }, admissionDatabase), expiredChallenge);
      await assert.rejects(createActivity(f.input, { kind: "password", credentialState: expected.credentialState }, admissionDatabase), invalidCredentials);
      await pool.query("UPDATE users SET two_factor_enabled=false WHERE id=$1", [f.user.id]);
      await assert.rejects(createActivity(f.input, expected, admissionDatabase), expiredChallenge);
      await pool.query("UPDATE users SET two_factor_enabled=true WHERE id=$1", [f.user.id]);
      assert.equal((await createActivity(f.input, expected, admissionDatabase)).isActive, true);
      // The original MFA repository shape remains supported.
      assert.equal((await createActivity(f.input, { credentialState: expected.credentialState, expiresAtMs: expected.expiresAtMs }, admissionDatabase)).isActive, true);
    });

    await t.test("MFA expiry is checked after waiting for the admission lock", async (t) => {
      const f = await fixture();
      await pool.query("UPDATE users SET two_factor_enabled=true,two_factor_secret_encrypted='confirmed-factor' WHERE id=$1", [f.user.id]);
      const [user] = await database.select().from(users).where(eq(users.id, f.user.id));
      let now = Date.now();
      t.mock.method(Date, "now", () => now);
      const expected = { kind: "two_factor" as const, credentialState: buildTwoFactorCredentialState(user), expiresAtMs: now + 1_000 };
      const holder = await pool.connect();
      let denied: Promise<void> | undefined;
      try {
        await holder.query("BEGIN");
        await holder.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [f.user.id]);
        denied = assert.rejects(createActivity(f.input, expected, admissionDatabase), expiredChallenge);
        void denied.catch(() => undefined);
        await waitForAdmissionLock();
        now += 2_000;
      } finally {
        await holder.query("COMMIT");
        holder.release();
        await denied;
      }
      assert.equal(await totalCount(f.user.id), 0);
    });

    await t.test("maintenance callers can continue creating activity without login proof", async () => {
      const f = await fixture();
      await pool.query("UPDATE users SET locked_at=now() WHERE id=$1", [f.user.id]);
      assert.equal((await createActivity(f.input, undefined, admissionDatabase)).isActive, true);
    });
  } finally {
    await admissionPool.end();
    await pool.end();
    await runtime.pool.end();
    if (runtime.readReplicaPool) await runtime.readReplicaPool.end();
  }
});
