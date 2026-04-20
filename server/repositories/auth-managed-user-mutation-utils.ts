import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db-postgres";
import {
  accountActivationTokens,
  backupJobs,
  backups,
  collectionRecords,
  passwordResetRequests,
  userActivity,
  users,
} from "../../shared/schema-postgres";
import {
  INTERNAL_SYSTEM_ACCOUNT_USERNAME,
  MANAGED_ACCOUNT_DELETED_LOCK_REASON,
} from "../auth/managed-account-constants";

export async function deleteManagedUserAccount(userId: string): Promise<boolean> {
  const normalizedId = String(userId || "").trim();
  if (!normalizedId) {
    return false;
  }

  return db.transaction(async (tx) => {
    const targetRows = await tx
      .select({
        id: users.id,
        username: users.username,
      })
      .from(users)
      .where(and(eq(users.id, normalizedId), inArray(users.role, ["admin", "user"])))
      .limit(1);

    const target = targetRows[0];
    if (!target) {
      return false;
    }

    if (String(target.username || "").trim().toLowerCase() === INTERNAL_SYSTEM_ACCOUNT_USERNAME) {
      return false;
    }

    await tx.delete(accountActivationTokens).where(eq(accountActivationTokens.userId, normalizedId));
    await tx.delete(passwordResetRequests).where(eq(passwordResetRequests.userId, normalizedId));

    if (await hasManagedUserDeletionDependencies(tx, target.username)) {
      const updated = await tx
        .update(users)
        .set(buildManagedUserDeletedAccountUpdate())
        .where(eq(users.id, normalizedId))
        .returning({ id: users.id });

      return updated.length > 0;
    }

    const deleted = await tx
      .delete(users)
      .where(eq(users.id, normalizedId))
      .returning({ id: users.id });

    return deleted.length > 0;
  });
}

export function buildManagedUserDeletedAccountUpdate(now = new Date()) {
  return {
    activatedAt: null,
    email: null,
    failedLoginAttempts: 0,
    fullName: null,
    isBanned: false,
    lastLoginAt: null,
    lockedAt: null,
    lockedBySystem: true,
    lockedReason: MANAGED_ACCOUNT_DELETED_LOCK_REASON,
    mustChangePassword: false,
    passwordChangedAt: null,
    passwordResetBySuperuser: false,
    status: "disabled" as const,
    twoFactorConfiguredAt: null,
    twoFactorEnabled: false,
    twoFactorSecretEncrypted: null,
    updatedAt: now,
  };
}

async function hasManagedUserDeletionDependencies(
  tx: Pick<typeof db, "select">,
  username: string,
) {
  const [collectionRecordRows, backupRows, backupJobRows] = await Promise.all([
    tx
      .select({ id: collectionRecords.id })
      .from(collectionRecords)
      .where(eq(collectionRecords.createdByLogin, username))
      .limit(1),
    tx
      .select({ id: backups.id })
      .from(backups)
      .where(eq(backups.createdBy, username))
      .limit(1),
    tx
      .select({ id: backupJobs.id })
      .from(backupJobs)
      .where(eq(backupJobs.requestedBy, username))
      .limit(1),
  ]);

  return collectionRecordRows.length > 0
    || backupRows.length > 0
    || backupJobRows.length > 0;
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
