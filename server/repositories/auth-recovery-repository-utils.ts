import { and, eq, isNull, sql } from "drizzle-orm";
import { accountActivationTokens, passwordResetRequests, userActivity, users, type User } from "../../shared/schema-postgres";
import { isManageableUserRole, normalizeAccountStatus } from "../auth/account-lifecycle";
import { db } from "../db-postgres";

export type CompleteAccountRecoveryParams = {
  kind: "activation" | "password_reset";
  userId: string;
  tokenId: string;
  tokenHash: string;
  passwordHash: string;
};

export type PrepareDeliveredPasswordResetParams = {
  userId: string;
  requestId: string;
  tokenHash: string;
  passwordHash: string;
  expectedPasswordHash: string;
  approvedBy: string;
};

/** Delivery occurs outside the database. Never overwrite a password which was
 * changed while SMTP was in flight, or finalize a link replaced by a resend. */
export async function prepareDeliveredPasswordReset(
  params: PrepareDeliveredPasswordResetParams,
  database: typeof db = db,
): Promise<{ user: User; closedSessionIds: string[] } | undefined> {
  return database.transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, params.userId)).for("update");
    if (!target || !isManageableUserRole(target.role) || target.status === "deleted"
      || normalizeAccountStatus(target.status, "active") === "pending_activation"
      || target.passwordHash !== params.expectedPasswordHash) return undefined;
    const [request] = await tx.select({ id: passwordResetRequests.id }).from(passwordResetRequests).where(and(
      eq(passwordResetRequests.id, params.requestId), eq(passwordResetRequests.userId, params.userId),
      eq(passwordResetRequests.tokenHash, params.tokenHash), isNull(passwordResetRequests.usedAt),
      sql`${passwordResetRequests.expiresAt} > clock_timestamp()`,
    )).for("update");
    if (!request) return undefined;
    const now = new Date();
    const [user] = await tx.update(users).set({
      passwordHash: params.passwordHash, passwordChangedAt: now,
      activatedAt: target.activatedAt ?? now, mustChangePassword: true, passwordResetBySuperuser: true,
      failedLoginAttempts: 0, lockedAt: null, lockedReason: null, lockedBySystem: false, updatedAt: now,
    }).where(eq(users.id, target.id)).returning();
    if (!user) throw new Error("Password reset preparation did not complete.");
    await tx.update(passwordResetRequests).set({ approvedBy: params.approvedBy, resetType: "email_link", usedAt: now })
      .where(and(eq(passwordResetRequests.userId, target.id), isNull(passwordResetRequests.approvedBy), isNull(passwordResetRequests.usedAt)));
    const closedSessions = await tx.update(userActivity).set({ isActive: false, logoutTime: now, logoutReason: "PASSWORD_RESET_BY_SUPERUSER" })
      .where(and(eq(userActivity.userId, target.id), eq(userActivity.isActive, true)))
      .returning({ id: userActivity.id });
    return { user, closedSessionIds: closedSessions.map((activity) => activity.id) };
  });
}

/** Password state and all token invalidations either commit together or roll back.
 * Every issuer/consumer takes the user lock first, including concurrent resends.
 * Hashing takes place before this transaction; expiry is checked after the lock.
 */
export async function completeAccountRecovery(
  params: CompleteAccountRecoveryParams,
  database: typeof db = db,
): Promise<{ user: User; lockCleared: boolean; closedSessionIds: string[] } | undefined> {
  return database.transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, params.userId)).for("update");
    if (!target || !isManageableUserRole(target.role) || target.status === "deleted") return undefined;
    const activation = params.kind === "activation";
    const status = normalizeAccountStatus(target.status, activation ? "pending_activation" : "active");
    if (activation ? (target.isBanned || status !== "pending_activation") : status === "pending_activation") {
      return undefined;
    }

    const table = activation ? accountActivationTokens : passwordResetRequests;
    const now = new Date();
    const consumed = await tx.update(table).set({ usedAt: now }).where(and(
      eq(table.id, params.tokenId),
      eq(table.userId, params.userId),
      eq(table.tokenHash, params.tokenHash),
      isNull(table.usedAt),
      sql`${table.expiresAt} > clock_timestamp()`,
    )).returning({ id: table.id });
    if (!consumed.length) return undefined;

    const [user] = await tx.update(users).set({
      passwordHash: params.passwordHash,
      passwordChangedAt: now,
      activatedAt: activation ? now : target.activatedAt ?? now,
      ...(activation ? { status: "active" } : {}),
      mustChangePassword: false,
      passwordResetBySuperuser: false,
      failedLoginAttempts: 0,
      lockedAt: null,
      lockedReason: null,
      lockedBySystem: false,
      updatedAt: now,
    }).where(eq(users.id, target.id)).returning();
    // Do not commit the consumed token if a trigger suppressed the user update.
    if (!user) throw new Error("Account recovery update did not complete.");
    await tx.update(table).set({ usedAt: now }).where(and(
      eq(table.userId, target.id), isNull(table.usedAt), sql`${table.tokenHash} IS NOT NULL`,
    ));
    // An external session-cleanup failure must not leave old authenticated
    // sessions usable after a committed password reset. Guards read this state.
    const closedSessions = await tx.update(userActivity).set({
      isActive: false, logoutTime: now,
      logoutReason: activation ? "ACCOUNT_ACTIVATED" : "PASSWORD_RESET_COMPLETED",
    }).where(and(eq(userActivity.userId, target.id), eq(userActivity.isActive, true)))
      .returning({ id: userActivity.id });
    return { user, lockCleared: Boolean(target.lockedAt), closedSessionIds: closedSessions.map((activity) => activity.id) };
  });
}
