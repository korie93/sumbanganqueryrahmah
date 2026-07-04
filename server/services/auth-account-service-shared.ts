import type { PostgresStorage } from "../storage-postgres";

export type LoginInput = {
  username: string;
  password: string;
  fingerprint?: string | null | undefined;
  browserName: string;
  deviceType?: string | undefined;
  pcName?: string | null | undefined;
  ipAddress?: string | null | undefined;
  platform?: string | undefined;
};

export type TwoFactorLoginInput = {
  userId: string;
  code: string;
  fingerprint?: string | null | undefined;
  browserName: string;
  deviceType?: string | undefined;
  pcName?: string | null | undefined;
  ipAddress?: string | null | undefined;
  platform?: string | undefined;
};

export type ActivateAccountInput = {
  username?: string | undefined;
  token: string;
  newPassword: string;
  confirmPassword: string;
};

export type ResetPasswordWithTokenInput = {
  token: string;
  newPassword: string;
  confirmPassword: string;
};

export type AuthAccountStorage = Pick<
  PostgresStorage,
  | "consumeActivationTokenById"
  | "consumePasswordResetRequestById"
  | "createActivationToken"
  | "createActivity"
  | "createAuditLog"
  | "createManagedUserAccount"
  | "createPasswordResetRequest"
  | "clearBannedSessionsForUsername"
  | "deactivateUserActivities"
  | "deactivateUserSessionsByFingerprint"
  | "deleteManagedUserAccount"
  | "getActivationTokenRecordByHash"
  | "getActiveActivitiesByUsername"
  | "getBooleanSystemSetting"
  | "getAccounts"
  | "getManagedUsers"
  | "getPasswordResetTokenRecordByHash"
  | "getUser"
  | "getUserByEmail"
  | "getUserByUsername"
  | "invalidateUnusedActivationTokens"
  | "invalidateUnusedPasswordResetTokens"
  | "isVisitorBanned"
  | "listManagedUsersPage"
  | "listPendingPasswordResetRequests"
  | "listPendingPasswordResetRequestsPage"
  | "recordFailedLoginAttempt"
  | "resolvePendingPasswordResetRequestsForUser"
  | "touchLastLogin"
  | "updateActivitiesUsername"
  | "updateUserAccount"
  | "updateUserCredentials"
>;
