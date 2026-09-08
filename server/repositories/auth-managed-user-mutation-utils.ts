import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { getRequestIdFromContext } from "../lib/request-context";
import { type ManagedUserDeletionResult } from "./auth-repository-types";
import {
  accountActivationTokens,
  adminVisibleNicknames,
  auditLogs,
  collectionNicknameSessions,
  passwordResetRequests,
  userActivity,
  users,
  type InsertAuditLog,
} from "../../shared/schema-postgres";

export async function deleteManagedUserAccount(
  userId: string,
  audit: InsertAuditLog,
): Promise<ManagedUserDeletionResult> {
  const normalizedId = String(userId || "").trim();
  if (!normalizedId) {
    return { deleted: false, closedSessionIds: [] };
  }

  return db.transaction(async (tx) => {
    // Serialize concurrent deletes/role changes and block new FK-backed sessions
    // while capturing the sessions whose sockets can be closed AFTER commit.
    const [target] = await tx.select({ id: users.id, username: users.username }).from(users)
      .where(and(eq(users.id, normalizedId), sql`${users.status} <> 'deleted'`, inArray(users.role, ["admin", "manager", "user"])))
      .for("update");
    if (!target) return { deleted: false, closedSessionIds: [] };

    const sessions = await tx.select({ id: userActivity.id }).from(userActivity)
      .where(and(eq(userActivity.userId, target.id), eq(userActivity.isActive, true)));

    await tx.delete(accountActivationTokens).where(eq(accountActivationTokens.userId, target.id));
    await tx.delete(passwordResetRequests).where(eq(passwordResetRequests.userId, target.id));

    await tx.delete(collectionNicknameSessions).where(sql`${collectionNicknameSessions.activityId} IN (
      SELECT id FROM public.user_activity WHERE user_id = ${target.id}
    )`);
    await tx.delete(adminVisibleNicknames).where(eq(adminVisibleNicknames.adminUserId, target.id));
    await tx.update(userActivity).set({ isActive: false, logoutTime: new Date(), logoutReason: "ACCOUNT_DELETED" })
      .where(and(eq(userActivity.userId, target.id), eq(userActivity.isActive, true)));

    // A terminal, credential-free actor preserves BOTH username and stable-ID
    // history (including private owners). Unlike Disable, Delete is irreversible
    // through account controls and the identity cannot be reused by a new login.
    const deleted = await tx.update(users).set({
      status: "deleted", passwordHash: "!deleted-account!", email: null,
      isBanned: true, mustChangePassword: false, passwordResetBySuperuser: false,
      twoFactorEnabled: false, twoFactorSecretEncrypted: null, twoFactorConfiguredAt: null,
      failedLoginAttempts: 0, lockedAt: null, lockedReason: null, lockedBySystem: false,
      updatedAt: new Date(),
    }).where(eq(users.id, target.id)).returning({ id: users.id });
    if (deleted.length !== 1) throw new Error("Account deletion did not complete.");

    // Keep the same audit snapshots/request correlation as AuditRepository, but
    // commit the audit and account deletion together (audit failure rolls back).
    await tx.insert(auditLogs).values({
      id: randomUUID(),
      action: audit.action,
      performedBy: audit.performedBy,
      requestId: audit.requestId || getRequestIdFromContext() || null,
      targetUser: target.id,
      targetResource: audit.targetResource ?? null,
      details: audit.details ?? null,
      timestamp: new Date(),
    });
    return { deleted: true, closedSessionIds: sessions.map((session) => session.id) };
  });
}

export async function updateActivitiesUsername(oldUsername: string, newUsername: string): Promise<void> {
  await db
    .update(userActivity)
    .set({ username: newUsername })
    .where(sql`${userActivity.username} = ${oldUsername}`);
}

export async function updateUserBan(username: string, isBanned: boolean) {
  await db
    .update(users)
    .set({ isBanned, updatedAt: new Date() })
    .where(sql`${users.username} = ${username} AND ${users.status} <> 'deleted'`);

  const result = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${String(username || "").trim()})`)
    .limit(1);

  return result[0];
}

export async function touchLastLogin(userId: string, timestamp = new Date()): Promise<void> {
  await db
    .update(users)
    .set({
      lastLoginAt: timestamp,
      updatedAt: new Date(),
    })
    .where(and(eq(users.id, userId), sql`${users.status} <> 'deleted'`));
}
