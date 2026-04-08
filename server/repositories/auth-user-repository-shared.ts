import type {
  InsertUser,
} from "../../shared/schema-postgres";
import { users } from "../../shared/schema-postgres";
import type {
  AccountStatus,
  ManageableUserRole,
} from "../auth/account-lifecycle";
import {
  normalizeAccountStatus,
  normalizeManageableUserRole,
  normalizeUserRole,
} from "../auth/account-lifecycle";

export type CreateManagedUserAccountParams = {
  username: string;
  fullName?: string | null;
  email?: string | null;
  role: ManageableUserRole;
  passwordHash: string;
  status?: AccountStatus;
  mustChangePassword?: boolean;
  passwordResetBySuperuser?: boolean;
  createdBy: string;
  activatedAt?: Date | null;
  passwordChangedAt?: Date | null;
};

export type UpdateUserCredentialsParams = {
  userId: string;
  newUsername?: string | undefined;
  newPasswordHash?: string | undefined;
  passwordChangedAt?: Date | null | undefined;
  mustChangePassword?: boolean | undefined;
  passwordResetBySuperuser?: boolean | undefined;
};

export type UpdateUserAccountParams = {
  userId: string;
  username?: string | undefined;
  fullName?: string | null | undefined;
  email?: string | null | undefined;
  role?: ManageableUserRole | undefined;
  status?: AccountStatus | undefined;
  isBanned?: boolean | undefined;
  mustChangePassword?: boolean | undefined;
  passwordResetBySuperuser?: boolean | undefined;
  passwordHash?: string | undefined;
  passwordChangedAt?: Date | null | undefined;
  activatedAt?: Date | null | undefined;
  lastLoginAt?: Date | null | undefined;
  twoFactorEnabled?: boolean | undefined;
  twoFactorSecretEncrypted?: string | null | undefined;
  twoFactorConfiguredAt?: Date | null | undefined;
  failedLoginAttempts?: number | undefined;
  lockedAt?: Date | null | undefined;
  lockedReason?: string | null | undefined;
  lockedBySystem?: boolean | undefined;
};

export type RecordFailedLoginAttemptParams = {
  userId: string;
  maxAllowedAttempts: number;
  lockedReason: string;
  now?: Date;
};

export type DerivedFailedLoginAttemptState = {
  nextAttempts: number;
  locked: boolean;
  newlyLocked: boolean;
  nextLockedAt: Date | null;
  nextLockedReason: string | null;
  nextLockedBySystem: boolean;
};

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
    fullName: user.fullName?.trim() || null,
    email: user.email?.trim().toLowerCase() || null,
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
    username: account.username.trim().toLowerCase(),
    fullName: String(account.fullName || "").trim() || null,
    email: String(account.email || "").trim().toLowerCase() || null,
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
    next.username = params.newUsername.trim().toLowerCase();
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
    next.username = params.username.trim().toLowerCase();
  }

  if (params.fullName !== undefined) {
    next.fullName = String(params.fullName || "").trim() || null;
  }

  if (params.email !== undefined) {
    next.email = String(params.email || "").trim().toLowerCase() || null;
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

export function deriveFailedLoginAttemptState(params: {
  previousAttempts: number;
  lockedAt: unknown;
  maxAllowedAttempts: number;
  lockedReason: string;
  now: Date;
}): DerivedFailedLoginAttemptState {
  const previousAttempts = Math.max(0, Number(params.previousAttempts || 0));
  const nextAttempts = previousAttempts + 1;
  const wasLocked = params.lockedAt instanceof Date
    ? !Number.isNaN(params.lockedAt.getTime())
    : Boolean(params.lockedAt);
  const safeMaxAllowedAttempts = Math.max(0, Math.floor(Number(params.maxAllowedAttempts) || 0));
  const locked = wasLocked || nextAttempts > safeMaxAllowedAttempts;
  const newlyLocked = !wasLocked && locked;

  return {
    nextAttempts,
    locked,
    newlyLocked,
    nextLockedAt: locked
      ? (params.lockedAt instanceof Date ? params.lockedAt : params.now)
      : null,
    nextLockedReason: locked ? params.lockedReason : null,
    nextLockedBySystem: locked,
  };
}
