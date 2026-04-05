import type { PostgresStorage } from "../storage-postgres";

export type AuthAccountRecoveryStorage = Pick<
  PostgresStorage,
  | "consumeActivationTokenById"
  | "consumePasswordResetRequestById"
  | "createActivationToken"
  | "createAuditLog"
  | "createPasswordResetRequest"
  | "getActivationTokenRecordByHash"
  | "getPasswordResetTokenRecordByHash"
  | "getUser"
  | "getUserByEmail"
  | "getUserByUsername"
  | "invalidateUnusedActivationTokens"
  | "invalidateUnusedPasswordResetTokens"
  | "updateUserAccount"
>;

export type AuthAccountRecoveryDeps = {
  storage: AuthAccountRecoveryStorage;
  invalidateUserSessions: (username: string, reason: string) => Promise<string[]>;
  requireManagedEmail: (email: string | null, message: string) => string;
};
