import type { AuthenticatedUser } from "../auth/guards";
import { buildCredentialAuditDetails, normalizeUsernameInput } from "../auth/credentials";
import { hashPassword, verifyPassword } from "../auth/passwords";
import type { PostgresStorage } from "../storage-postgres";
import { assertStrongPasswordInput } from "./auth-account-token-utils";
import { AuthAccountError } from "./auth-account-types";

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type UpdateOwnCredentialsInput = {
  hasUsernameField: boolean;
  hasPasswordField: boolean;
  newUsername?: string;
  currentPassword: string;
  newPassword: string;
};

type AuthAccountUser = NonNullable<Awaited<ReturnType<PostgresStorage["getUser"]>>>;

type AuthAccountSelfStorage = Pick<
  PostgresStorage,
  | "createAuditLog"
  | "deactivateUserActivities"
  | "getActiveActivitiesByUsername"
  | "updateActivitiesUsername"
  | "updateUserCredentials"
>;

type AuthAccountSelfDeps = {
  storage: AuthAccountSelfStorage;
  ensureUniqueIdentity: (params: {
    username?: string;
    email?: string | null;
    ignoreUserId?: string;
  }) => Promise<void>;
  requireActor: (authUser: AuthenticatedUser | undefined) => Promise<AuthAccountUser>;
  validateUsername: (username: string) => void;
};

export class AuthAccountSelfOperations {
  constructor(private readonly deps: AuthAccountSelfDeps) {}

  private async invalidateUserSessions(username: string, reason: string) {
    const activeSessions = await this.deps.storage.getActiveActivitiesByUsername(username);
    await this.deps.storage.deactivateUserActivities(username, reason);
    return activeSessions.map((activity) => activity.id);
  }

  private async updateOwnPassword(actor: AuthAccountUser, input: ChangePasswordInput) {
    const currentPassword = String(input.currentPassword || "");
    const newPassword = String(input.newPassword || "");

    if (!currentPassword) {
      throw new AuthAccountError(400, "INVALID_CURRENT_PASSWORD", "Current password is required.");
    }

    const currentPasswordMatch = await verifyPassword(currentPassword, actor.passwordHash);
    if (!currentPasswordMatch) {
      throw new AuthAccountError(400, "INVALID_CURRENT_PASSWORD", "Current password is invalid.");
    }

    assertStrongPasswordInput(newPassword);

    const sameAsCurrent = await verifyPassword(newPassword, actor.passwordHash);
    if (sameAsCurrent) {
      throw new AuthAccountError(
        400,
        "INVALID_PASSWORD",
        "New password must be different from current password.",
      );
    }

    const nextPasswordHash = await hashPassword(newPassword);
    const updatedUser = await this.deps.storage.updateUserCredentials({
      userId: actor.id,
      newPasswordHash: nextPasswordHash,
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      passwordResetBySuperuser: false,
    });

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
      user: updatedUser ?? actor,
      closedSessionIds,
    };
  }

  private async updateOwnUsername(actor: AuthAccountUser, newUsernameRaw: string) {
    const newUsername = normalizeUsernameInput(newUsernameRaw);
    const previousUsername = actor.username;

    this.deps.validateUsername(newUsername);
    await this.deps.ensureUniqueIdentity({ username: newUsername, ignoreUserId: actor.id });

    if (newUsername === previousUsername) {
      return actor;
    }

    const updatedUser = await this.deps.storage.updateUserCredentials({
      userId: actor.id,
      newUsername,
    });

    await this.deps.storage.updateActivitiesUsername(previousUsername, newUsername);
    await this.deps.storage.createAuditLog({
      action: "USER_USERNAME_CHANGED",
      performedBy: actor.id,
      targetUser: actor.id,
      details: buildCredentialAuditDetails({
        actor_user_id: actor.id,
        target_user_id: actor.id,
        changedField: "username",
      }),
    });

    return updatedUser ?? actor;
  }

  async changeOwnPassword(authUser: AuthenticatedUser | undefined, input: ChangePasswordInput) {
    const actor = await this.deps.requireActor(authUser);
    return this.updateOwnPassword(actor, input);
  }

  async changeOwnUsername(authUser: AuthenticatedUser | undefined, newUsernameRaw: string) {
    const actor = await this.deps.requireActor(authUser);
    return this.updateOwnUsername(actor, newUsernameRaw);
  }

  async getCurrentUser(authUser: AuthenticatedUser | undefined) {
    return this.deps.requireActor(authUser);
  }

  async updateOwnCredentials(
    authUser: AuthenticatedUser | undefined,
    input: UpdateOwnCredentialsInput,
  ) {
    const actor = await this.deps.requireActor(authUser);

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
        "PASSWORD_CHANGE_REQUIRED",
        "Password change is required before other account updates.",
      );
    }

    let updatedUser: AuthAccountUser = actor;
    let forceLogout = false;
    let closedSessionIds: string[] = [];

    if (input.hasUsernameField) {
      updatedUser = await this.updateOwnUsername(updatedUser, input.newUsername ?? "");
    }

    if (input.hasPasswordField) {
      const passwordResult = await this.updateOwnPassword(updatedUser, {
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
