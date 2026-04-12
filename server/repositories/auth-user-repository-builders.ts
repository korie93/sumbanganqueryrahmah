import type { InsertUser } from "../../shared/schema-postgres";
import { users } from "../../shared/schema-postgres";
import { normalizeAccountStatus, normalizeManageableUserRole, normalizeUserRole } from "../auth/account-lifecycle";
import { normalizeAuthUsername, normalizeOptionalAuthEmail, normalizeOptionalAuthFullName } from "./auth-user-repository-normalize";
import type {
  CreateManagedUserAccountParams,
  UpdateUserAccountParams,
  UpdateUserCredentialsParams,
} from "./auth-user-repository-types";

export function buildLegacyUserInsertRecord(params: {
  user: InsertUser;
  id: string;
  now: Date;
  hashedPassword: string;
}): typeof users.$inferInsert {
  const { user, id, now, hashedPassword } = params;
  return {
    id,
    username: user.username,
    fullName: normalizeOptionalAuthFullName(user.fullName),
    email: normalizeOptionalAuthEmail(user.email),
    passwordHash: hashedPassword,
    role: normalizeUserRole(user.role),
    status: "active",
    mustChangePassword: false,
    passwordResetBySuperuser: false,
    createdBy: "legacy-create-user",
    createdAt: now,
    updatedAt: now,
    passwordChangedAt: now,
    activatedAt: now,
    isBanned: false,
    twoFactorEnabled: false,
    twoFactorSecretEncrypted: null,
    twoFactorConfiguredAt: null,
    failedLoginAttempts: 0,
    lockedAt: null,
    lockedReason: null,
    lockedBySystem: false,
  };
}

export function buildManagedUserInsertRecord(params: {
  account: CreateManagedUserAccountParams;
  id: string;
  now: Date;
}): typeof users.$inferInsert {
  const { account, id, now } = params;
  return {
    id,
    username: normalizeAuthUsername(account.username),
    fullName: normalizeOptionalAuthFullName(account.fullName),
    email: normalizeOptionalAuthEmail(account.email),
    passwordHash: account.passwordHash,
    role: normalizeManageableUserRole(account.role),
    status: normalizeAccountStatus(account.status, "pending_activation"),
    mustChangePassword: account.mustChangePassword === true,
    passwordResetBySuperuser: account.passwordResetBySuperuser === true,
    createdBy: account.createdBy,
    createdAt: now,
    updatedAt: now,
    passwordChangedAt: account.passwordChangedAt ?? null,
    activatedAt: account.activatedAt ?? null,
    isBanned: false,
    twoFactorEnabled: false,
    twoFactorSecretEncrypted: null,
    twoFactorConfiguredAt: null,
    failedLoginAttempts: 0,
    lockedAt: null,
    lockedReason: null,
    lockedBySystem: false,
  };
}

export function buildUserCredentialsUpdateRecord(
  params: UpdateUserCredentialsParams,
): Partial<typeof users.$inferInsert> {
  const next: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (typeof params.newUsername === "string" && params.newUsername.trim()) {
    next.username = normalizeAuthUsername(params.newUsername);
  }

  if (typeof params.newPasswordHash === "string" && params.newPasswordHash.trim()) {
    next.passwordHash = params.newPasswordHash.trim();
    next.passwordChangedAt = params.passwordChangedAt ?? new Date();
  } else if (params.passwordChangedAt !== undefined) {
    next.passwordChangedAt = params.passwordChangedAt;
  }

  if (params.mustChangePassword !== undefined) {
    next.mustChangePassword = params.mustChangePassword;
  }

  if (params.passwordResetBySuperuser !== undefined) {
    next.passwordResetBySuperuser = params.passwordResetBySuperuser;
  }

  return next;
}

export function buildUserAccountUpdateRecord(
  params: UpdateUserAccountParams,
): Partial<typeof users.$inferInsert> {
  const next: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (typeof params.username === "string" && params.username.trim()) {
    next.username = normalizeAuthUsername(params.username);
  }

  if (params.fullName !== undefined) {
    next.fullName = normalizeOptionalAuthFullName(params.fullName);
  }

  if (params.email !== undefined) {
    next.email = normalizeOptionalAuthEmail(params.email);
  }

  if (params.role !== undefined) {
    next.role = normalizeManageableUserRole(params.role);
  }

  if (params.status !== undefined) {
    next.status = normalizeAccountStatus(params.status);
  }

  if (params.isBanned !== undefined) {
    next.isBanned = params.isBanned;
  }

  if (params.mustChangePassword !== undefined) {
    next.mustChangePassword = params.mustChangePassword;
  }

  if (params.passwordResetBySuperuser !== undefined) {
    next.passwordResetBySuperuser = params.passwordResetBySuperuser;
  }

  if (params.passwordHash !== undefined) {
    next.passwordHash = params.passwordHash;
  }

  if (params.passwordChangedAt !== undefined) {
    next.passwordChangedAt = params.passwordChangedAt;
  }

  if (params.activatedAt !== undefined) {
    next.activatedAt = params.activatedAt;
  }

  if (params.lastLoginAt !== undefined) {
    next.lastLoginAt = params.lastLoginAt;
  }

  if (params.twoFactorEnabled !== undefined) {
    next.twoFactorEnabled = params.twoFactorEnabled;
  }

  if (params.twoFactorSecretEncrypted !== undefined) {
    next.twoFactorSecretEncrypted = params.twoFactorSecretEncrypted;
  }

  if (params.twoFactorConfiguredAt !== undefined) {
    next.twoFactorConfiguredAt = params.twoFactorConfiguredAt;
  }

  if (params.failedLoginAttempts !== undefined) {
    next.failedLoginAttempts = params.failedLoginAttempts;
  }

  if (params.lockedAt !== undefined) {
    next.lockedAt = params.lockedAt;
  }

  if (params.lockedReason !== undefined) {
    next.lockedReason = params.lockedReason;
  }

  if (params.lockedBySystem !== undefined) {
    next.lockedBySystem = params.lockedBySystem;
  }

  return next;
}
