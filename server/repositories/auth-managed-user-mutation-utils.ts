import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db-postgres";
import {
  accountActivationTokens,
  passwordResetRequests,
  userActivity,
  users,
} from "../../shared/schema-postgres";

export async function deleteManagedUserAccount(userId: string): Promise<boolean> {
  const normalizedId = String(userId || "").trim();
  if (!normalizedId) {
    return false;
  }

  await db.delete(accountActivationTokens).where(eq(accountActivationTokens.userId, normalizedId));
  await db.delete(passwordResetRequests).where(eq(passwordResetRequests.userId, normalizedId));

  const deleted = await db
    .delete(users)
    .where(and(eq(users.id, normalizedId), inArray(users.role, ["admin", "user"])))
    .returning({ id: users.id });

  return deleted.length > 0;
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
