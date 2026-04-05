import type { AuthenticatedUser } from "../auth/guards";
import type {
  PostgresStorage,
} from "../storage-postgres";
import type {
  ManagedAccountActivationDelivery,
  ManagedAccountPasswordResetDelivery,
} from "./auth-account-types";

export type CreateManagedUserInput = {
  username: string;
  fullName?: string | null;
  email?: string | null;
  role: string;
};

export type UpdateManagedUserInput = {
  username?: string;
  fullName?: string | null;
  email?: string | null;
};

export type UpdateManagedStatusInput = {
  status?: string;
  isBanned?: boolean;
};

export type AuthAccountManagedUser = NonNullable<
  Awaited<ReturnType<PostgresStorage["getUser"]>>
>;

export type AuthAccountManagedStorage = Pick<
  PostgresStorage,
  | "consumePasswordResetRequestById"
  | "createAuditLog"
  | "createManagedUserAccount"
  | "createPasswordResetRequest"
  | "deleteManagedUserAccount"
  | "getAccounts"
  | "getManagedUsers"
  | "invalidateUnusedPasswordResetTokens"
  | "listManagedUsersPage"
  | "listPendingPasswordResetRequests"
  | "listPendingPasswordResetRequestsPage"
  | "resolvePendingPasswordResetRequestsForUser"
  | "updateActivitiesUsername"
  | "updateUserAccount"
>;

export type AuthAccountManagedOpsDeps = {
  storage: AuthAccountManagedStorage;
  ensureUniqueIdentity: (params: {
    username?: string;
    email?: string | null;
    ignoreUserId?: string;
  }) => Promise<void>;
  invalidateUserSessions: (username: string, reason: string) => Promise<string[]>;
  requireManageableTarget: (userId: string) => Promise<AuthAccountManagedUser>;
  requireManagedEmail: (email: string | null, message: string) => string;
  requireSuperuser: (
    authUser: AuthenticatedUser | undefined,
  ) => Promise<AuthAccountManagedUser>;
  sendActivationEmail: (params: {
    actorUsername: string;
    user: Awaited<ReturnType<PostgresStorage["getUser"]>>;
    resent?: boolean;
  }) => Promise<{
    delivery: ManagedAccountActivationDelivery;
  }>;
  sendPasswordResetEmail: (params: {
    expiresAt: Date;
    resetUrl: string;
    user: Awaited<ReturnType<PostgresStorage["getUser"]>>;
  }) => Promise<ManagedAccountPasswordResetDelivery>;
  validateEmail: (email: string | null) => void;
  validateUsername: (username: string) => void;
};
