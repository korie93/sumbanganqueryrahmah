import type { AccountStatus, ManageableUserRole } from "../auth/account-lifecycle";

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
