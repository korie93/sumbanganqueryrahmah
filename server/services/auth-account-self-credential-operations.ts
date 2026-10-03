import { buildCredentialAuditDetails } from "../auth/credentials";
import { hashPassword, verifyPassword } from "../auth/passwords";
import type { PostgresStorage } from "../storage-postgres";
import { assertStrongPasswordInput } from "./auth-account-token-utils";
import { AuthAccountError } from "./auth-account-types";
import { ERROR_CODES } from "../../shared/error-codes";

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type UpdateOwnCredentialsInput = {
  hasUsernameField: boolean;
  hasPasswordField: boolean;
  newUsername?: string | undefined;
  currentPassword: string;
  newPassword: string;
};

type AuthAccountUser = NonNullable<Awaited<ReturnType<PostgresStorage["getUser"]>>>;

type AuthAccountSelfCredentialStorage = Pick<
  PostgresStorage,
  | "createAuditLog"
  | "deactivateUserActivities"
  | "getActiveActivitiesByUsername"
  | "updateUserAccount"
  | "updateActivitiesUsername"
  | "updateUserCredentials"
>;

type AuthAccountSelfCredentialDeps = {
  storage: AuthAccountSelfCredentialStorage;
  ensureUniqueIdentity: (params: {
    username?: string | undefined;
    email?: string | null | undefined;
    ignoreUserId?: string | undefined;
  }) => Promise<void>;
  validateUsername: (username: string) => void;
};

export class AuthAccountSelfCredentialOperations {
  constructor(private readonly deps: AuthAccountSelfCredentialDeps) {}

  private async invalidateUserSessions(username: string, reason: string) {
    const activeSessions = await this.deps.storage.getActiveActivitiesByUsername(username);
    await this.deps.storage.deactivateUserActivities(username, reason);
    return activeSessions.map((activity) => activity.id);
  }

  async changeOwnPassword(actor: AuthAccountUser, input: ChangePasswordInput) {
    const currentPassword = String(input.currentPassword || "");
    const newPassword = String(input.newPassword || "");

    if (!currentPassword) {
      throw new AuthAccountError(400, ERROR_CODES.INVALID_CURRENT_PASSWORD, "Current password is required.");
    }

    const currentPasswordMatch = await verifyPassword(currentPassword, actor.passwordHash);
    if (!currentPasswordMatch) {
      throw new AuthAccountError(400, ERROR_CODES.INVALID_CURRENT_PASSWORD, "Current password is invalid.");
    }

    assertStrongPasswordInput(newPassword);

    const sameAsCurrent = await verifyPassword(newPassword, actor.passwordHash);
    if (sameAsCurrent) {
      throw new AuthAccountError(
        400,
        ERROR_CODES.INVALID_PASSWORD,
        "New password must be different from current password.",
      );
    }

    const nextPasswordHash = await hashPassword(newPassword);
    const updatedUser = await this.deps.storage.updateUserAccount({
      userId: actor.id,
      expectedPasswordHash: actor.passwordHash,
      passwordHash: nextPasswordHash,
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      passwordResetBySuperuser: false,
      failedLoginAttempts: 0,
      lockedAt: null,
      lockedReason: null,
      lockedBySystem: false,
    });

    if (!updatedUser) {
      throw new AuthAccountError(
        409,
        ERROR_CODES.CONFLICT,
        "Account credentials changed while saving. Sign in again with your current password before retrying.",
      );
    }

    const closedSessionIds = await this.invalidateUserSessions(actor.username, "PASSWORD_CHANGED");

    await this.deps.storage.createAuditLog({
      action: "USER_PASSWORD_CHANGED",
      performedBy: actor.id,
      targetUser: actor.id,
      details: buildCredentialAuditDetails({
        actor_user_id: actor.id,
        target_user_id: actor.id,
        changedField: "password",
      }),
    });

    return {
      user: updatedUser,
      closedSessionIds,
    };
  }

  async changeOwnUsername(_actor: AuthAccountUser, _newUsernameRaw: string): Promise<AuthAccountUser> {
    // Keep the legacy service entry point fail-closed. Administrative Account
    // Management owns identity changes; the personal account page is read-only.
    throw new AuthAccountError(403, ERROR_CODES.PERMISSION_DENIED, "Username is read-only. Contact an administrator for account changes.");
  }

  async updateOwnCredentials(actor: AuthAccountUser, input: UpdateOwnCredentialsInput) {
    if (!input.hasUsernameField && !input.hasPasswordField) {
      return {
        user: actor,
        forceLogout: false,
        closedSessionIds: [] as string[],
      };
    }

    if (actor.mustChangePassword && !input.hasPasswordField) {
      throw new AuthAccountError(
        403,
        ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
        "Password change is required before other account updates.",
      );
    }

    let updatedUser: AuthAccountUser = actor;
    let forceLogout = false;
    let closedSessionIds: string[] = [];

    if (input.hasUsernameField) {
      // Reject mixed username/password payloads before writing either field.
      await this.changeOwnUsername(updatedUser, input.newUsername ?? "");
    }

    if (input.hasPasswordField) {
      const passwordResult = await this.changeOwnPassword(updatedUser, {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });
      updatedUser = passwordResult.user;
      forceLogout = true;
      closedSessionIds = passwordResult.closedSessionIds;
    }

    return {
      user: updatedUser,
      forceLogout,
      closedSessionIds,
    };
  }
}
