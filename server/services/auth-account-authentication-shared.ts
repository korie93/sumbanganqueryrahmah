import type { PostgresStorage } from "../storage-postgres";

export type AuthAccountAuthenticationStorage = Pick<
  PostgresStorage,
  | "createActivationToken"
  | "createActivity"
  | "createAuditLog"
  | "deactivateUserActivities"
  | "getActiveActivitiesByUsername"
  | "getBooleanSystemSetting"
  | "invalidateUnusedActivationTokens"
  | "isVisitorBanned"
  | "recordFailedLoginAttempt"
  | "touchLastLogin"
  | "updateUserAccount"
> & Pick<
  PostgresStorage,
  | "consumeActivationTokenById"
  | "consumePasswordResetRequestById"
  | "createPasswordResetRequest"
  | "deactivateUserSessionsByFingerprint"
  | "getActivationTokenRecordByHash"
  | "getPasswordResetTokenRecordByHash"
  | "getUser"
  | "getUserByEmail"
  | "getUserByUsername"
  | "invalidateUnusedPasswordResetTokens"
> & {
  getAppConfig?: () => Promise<{ sessionTimeoutMinutes?: unknown } | null | undefined>;
};

export type AuthAccountUser = NonNullable<
  Awaited<ReturnType<AuthAccountAuthenticationStorage["getUser"]>>
>;

export type AuthenticatedSessionInput = {
  browserName: string;
  fingerprint?: string | null;
  ipAddress?: string | null;
  pcName?: string | null;
};
