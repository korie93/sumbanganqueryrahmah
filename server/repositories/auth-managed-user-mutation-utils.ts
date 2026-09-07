import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db-postgres";
import { getRequestIdFromContext } from "../lib/request-context";
import { ManagedUserDeletionConflictError, type ManagedUserDeletionResult } from "./auth-repository-types";
import {
  accountActivationTokens,
  auditLogs,
  passwordResetRequests,
  userActivity,
  users,
  type InsertAuditLog,
} from "../../shared/schema-postgres";

function isForeignKeyViolation(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === "23503") return true;
    current = candidate.cause;
  }
  return false;
}

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
    const [target] = await tx.select({ id: users.id }).from(users)
      .where(and(eq(users.id, normalizedId), inArray(users.role, ["admin", "manager", "user"])))
      .for("update");
    if (!target) return { deleted: false, closedSessionIds: [] };

    const sessions = await tx.select({ id: userActivity.id }).from(userActivity)
      .where(and(eq(userActivity.userId, target.id), eq(userActivity.isActive, true)));

    await tx.delete(accountActivationTokens).where(eq(accountActivationTokens.userId, target.id));
    await tx.delete(passwordResetRequests).where(eq(passwordResetRequests.userId, target.id));

    try {
      // Preserve the existing CASCADE/SET NULL/RESTRICT decisions. In particular,
      // Collection and private Billing history must NEVER be deleted or reassigned.
      const deleted = await tx.delete(users).where(eq(users.id, target.id)).returning({ id: users.id });
      if (deleted.length !== 1) throw new Error("Account deletion did not complete.");
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new ManagedUserDeletionConflictError(error);
      throw error;
    }

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
    .where(sql`${users.username} = ${username}`);

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
    .where(eq(users.id, userId));
}
