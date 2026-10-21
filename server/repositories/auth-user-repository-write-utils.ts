import crypto from "crypto";
import { and, eq, sql } from "drizzle-orm";
import type {
  InsertUser,
  User,
} from "../../shared/schema-postgres";
import { users } from "../../shared/schema-postgres";
import { hashPassword } from "../auth/passwords";
import { db } from "../db-postgres";
import { z } from "zod";
import { badRequest } from "../http/errors";
import { setCollectionDashboardAccountInTransaction } from "./collection-dashboard-account-repository";
import {
  buildLegacyUserInsertRecord,
  buildManagedUserInsertRecord,
  buildUserAccountUpdateRecord,
  buildUserCredentialsUpdateRecord,
  deriveFailedLoginAttemptState,
  type CreateManagedUserAccountParams,
  type RecordFailedLoginAttemptParams,
  type UpdateUserAccountParams,
  type UpdateUserCredentialsParams,
} from "./auth-user-repository-shared";
import {
  getAuthUser,
} from "./auth-user-repository-read-utils";

export async function createLegacyAuthUser(user: InsertUser): Promise<User> {
  const id = crypto.randomUUID();
  const now = new Date();
  const hashedPassword = await hashPassword(user.password);

  await db.insert(users).values(buildLegacyUserInsertRecord({
    user,
    id,
    now,
    hashedPassword,
  }));

  return (await getAuthUser(id))!;
}

export async function createManagedAuthUserAccount(
  params: CreateManagedUserAccountParams,
): Promise<User> {
  const id = crypto.randomUUID();
  const now = new Date();
  const dashboardNicknameId = params.dashboardNicknameId;

  if (dashboardNicknameId !== undefined && dashboardNicknameId !== null) {
    if (!z.string().uuid().safeParse(dashboardNicknameId).success || (params.role !== "user" && params.role !== "admin")) {
      throw badRequest("Choose a valid Dashboard nickname for a User or Admin account.");
    }
    // The nickname is revalidated/locked inside the same transaction as the
    // account insert and mapping audit. Any failure rolls back all three.
    return db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values(buildManagedUserInsertRecord({ account: params, id, now })).returning();
      await setCollectionDashboardAccountInTransaction(tx, {
        userId: id, nicknameId: dashboardNicknameId, actor: params.createdBy,
      });
      return user!;
    });
  }

  await db.insert(users).values(buildManagedUserInsertRecord({
    account: params,
    id,
    now,
  }));

  return (await getAuthUser(id))!;
}

export async function updateAuthUserCredentials(
  params: UpdateUserCredentialsParams,
): Promise<User | undefined> {
  const updated = await db
    .update(users)
    .set(buildUserCredentialsUpdateRecord(params))
    .where(and(eq(users.id, params.userId), sql`${users.status} <> 'deleted'`))
    .returning();
  return updated[0];
}

export async function updateAuthUserAccount(
  params: UpdateUserAccountParams,
  database: typeof db = db,
): Promise<User | undefined> {
  const expected = params.expectedTwoFactorState;
  const updated = await database
    .update(users)
    .set(buildUserAccountUpdateRecord(params))
    .where(and(
      eq(users.id, params.userId),
      sql`${users.status} <> 'deleted'`,
      params.expectedPasswordHash !== undefined ? eq(users.passwordHash, params.expectedPasswordHash) : undefined,
      expected ? sql`coalesce(${users.twoFactorEnabled}, false) = ${expected.enabled}` : undefined,
      expected ? sql`${users.twoFactorSecretEncrypted} is not distinct from ${expected.encryptedSecret}` : undefined,
      expected ? eq(users.passwordHash, expected.passwordHash) : undefined,
    ))
    .returning();
  return updated[0];
}

export async function recordAuthFailedLoginAttempt(
  params: RecordFailedLoginAttemptParams,
): Promise<{
  user: User | undefined;
  failedLoginAttempts: number;
  locked: boolean;
  newlyLocked: boolean;
}> {
  const now = params.now ?? new Date();

  return db.transaction(async (tx) => {
    const currentRows = await tx
      .select({
        failedLoginAttempts: users.failedLoginAttempts,
        lockedAt: users.lockedAt,
      })
      .from(users)
      .where(and(eq(users.id, params.userId), sql`${users.status} <> 'deleted'`))
      .for("update");

    const current = currentRows[0];
    if (!current) {
      return {
        user: undefined,
        failedLoginAttempts: 0,
        locked: false,
        newlyLocked: false,
      };
    }

    const nextState = deriveFailedLoginAttemptState({
      previousAttempts: current.failedLoginAttempts,
      lockedAt: current.lockedAt,
      maxAllowedAttempts: params.maxAllowedAttempts,
      lockedReason: params.lockedReason,
      now,
    });

    const updatedRows = await tx
      .update(users)
      .set({
        failedLoginAttempts: nextState.nextAttempts,
        lockedAt: nextState.nextLockedAt,
        lockedReason: nextState.nextLockedReason,
        lockedBySystem: nextState.nextLockedBySystem,
        updatedAt: now,
      })
      .where(eq(users.id, params.userId))
      .returning();

    return {
      user: updatedRows[0],
      failedLoginAttempts: nextState.nextAttempts,
      locked: nextState.locked,
      newlyLocked: nextState.newlyLocked,
    };
  });
}
