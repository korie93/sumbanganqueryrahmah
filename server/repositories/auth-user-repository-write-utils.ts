import crypto from "crypto";
import { eq } from "drizzle-orm";
import type {
  InsertUser,
  User,
} from "../../shared/schema-postgres";
import { users } from "../../shared/schema-postgres";
import { hashPassword } from "../auth/passwords";
import { db } from "../db-postgres";
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
  await db
    .update(users)
    .set(buildUserCredentialsUpdateRecord(params))
    .where(eq(users.id, params.userId));
  return getAuthUser(params.userId);
}

export async function updateAuthUserAccount(
  params: UpdateUserAccountParams,
): Promise<User | undefined> {
  await db
    .update(users)
    .set(buildUserAccountUpdateRecord(params))
    .where(eq(users.id, params.userId));
  return getAuthUser(params.userId);
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
      .where(eq(users.id, params.userId))
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
