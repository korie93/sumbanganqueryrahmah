import type { AuthenticatedUser } from "../auth/guards";
import {
  CREDENTIAL_EMAIL_REGEX,
  CREDENTIAL_USERNAME_REGEX,
  normalizeEmailInput,
} from "../auth/credentials";
import {
  isManageableUserRole,
} from "../auth/account-lifecycle";
import type {
  PostgresStorage,
} from "../storage-postgres";
import {
  type ActivationTokenValidationResult,
  type PasswordResetTokenValidationResult,
  AuthAccountError,
} from "./auth-account-types";
import {
  AuthAccountManagedOperations,
  type CreateManagedUserInput,
  type UpdateManagedStatusInput,
  type UpdateManagedUserInput,
} from "./auth-account-managed-operations";
import {
  AuthAccountSelfOperations,
  type ChangePasswordInput,
  type ConfirmTwoFactorSetupInput,
  type DisableTwoFactorInput,
  type StartTwoFactorSetupInput,
  type UpdateOwnCredentialsInput,
} from "./auth-account-self-operations";
import { AuthAccountAuthenticationOperations } from "./auth-account-authentication-operations";
export {
  type ActivationTokenValidationResult,
  type ManagedAccountActivationDelivery,
  type ManagedAccountPasswordResetDelivery,
  type PasswordResetTokenValidationResult,
  AuthAccountError,
} from "./auth-account-types";

type LoginInput = {
  username: string;
  password: string;
  fingerprint?: string | null;
  browserName: string;
  pcName?: string | null;
  ipAddress?: string | null;
};

type AuthAccountStorage = Pick<
  PostgresStorage,
  | "consumeActivationTokenById"
  | "consumePasswordResetRequestById"
  | "createActivationToken"
  | "createActivity"
  | "createAuditLog"
  | "createManagedUserAccount"
  | "createPasswordResetRequest"
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
  | "resolvePendingPasswordResetRequestsForUser"
  | "touchLastLogin"
  | "updateActivitiesUsername"
  | "updateUserAccount"
  | "updateUserCredentials"
>;

export class AuthAccountService {
  private readonly authenticationOperations: AuthAccountAuthenticationOperations;
  private readonly managedOperations: AuthAccountManagedOperations;
  private readonly selfOperations: AuthAccountSelfOperations;

  constructor(private readonly storage: AuthAccountStorage) {
    this.authenticationOperations = new AuthAccountAuthenticationOperations({
      storage: this.storage,
      requireManagedEmail: this.requireManagedEmail.bind(this),
    });
    this.managedOperations = new AuthAccountManagedOperations({
      storage: this.storage,
      ensureUniqueIdentity: this.ensureUniqueIdentity.bind(this),
      invalidateUserSessions: this.invalidateUserSessions.bind(this),
      requireManageableTarget: this.requireManageableTarget.bind(this),
      requireManagedEmail: this.requireManagedEmail.bind(this),
      requireSuperuser: this.requireSuperuser.bind(this),
      sendActivationEmail: this.authenticationOperations.sendActivationEmail.bind(this.authenticationOperations),
      sendPasswordResetEmail: this.authenticationOperations.sendPasswordResetEmail.bind(this.authenticationOperations),
      validateEmail: this.validateEmail.bind(this),
      validateUsername: this.validateUsername.bind(this),
    });
    this.selfOperations = new AuthAccountSelfOperations({
      storage: this.storage,
      ensureUniqueIdentity: this.ensureUniqueIdentity.bind(this),
      requireActor: this.requireActor.bind(this),
      validateUsername: this.validateUsername.bind(this),
    });
  }

  private requireManagedEmail(email: string | null, message: string) {
    const normalizedEmail = normalizeEmailInput(email);
    if (!normalizedEmail) {
      throw new AuthAccountError(400, "INVALID_EMAIL", message);
    }

    this.validateEmail(normalizedEmail);
    return normalizedEmail;
  }

  private async requireActor(authUser: AuthenticatedUser | undefined) {
    if (!authUser) {
      throw new AuthAccountError(401, "PERMISSION_DENIED", "Authentication required.");
    }

    const actor = authUser.userId
      ? await this.storage.getUser(authUser.userId)
      : await this.storage.getUserByUsername(authUser.username);

    if (!actor) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "User not found.");
    }

    return actor;
  }

  private async requireSuperuser(authUser: AuthenticatedUser | undefined) {
    const actor = await this.requireActor(authUser);
    if (actor.role !== "superuser") {
      throw new AuthAccountError(403, "PERMISSION_DENIED", "Only superuser can access this resource.");
    }
    return actor;
  }

  private async requireManageableTarget(userId: string) {
    const normalizedId = String(userId || "").trim();
    if (!normalizedId) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
    }

    const target = await this.storage.getUser(normalizedId);
    if (!target) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
    }

    if (!isManageableUserRole(target.role)) {
      throw new AuthAccountError(403, "PERMISSION_DENIED", "Target role is not allowed.");
    }

    return target;
  }

  private validateUsername(username: string) {
    if (!CREDENTIAL_USERNAME_REGEX.test(username)) {
      throw new AuthAccountError(
        400,
        "USERNAME_TAKEN",
        "Username must match ^[a-zA-Z0-9._-]{3,32}$.",
      );
    }
  }

  private validateEmail(email: string | null) {
    if (!email) return;
    if (!CREDENTIAL_EMAIL_REGEX.test(email)) {
      throw new AuthAccountError(400, "INVALID_EMAIL", "Email address is invalid.");
    }
  }

  private async ensureUniqueIdentity(params: {
    username?: string;
    email?: string | null;
    ignoreUserId?: string;
  }) {
    if (params.username) {
      const existingByUsername = await this.storage.getUserByUsername(params.username);
      if (existingByUsername && existingByUsername.id !== params.ignoreUserId) {
        throw new AuthAccountError(409, "USERNAME_TAKEN", "Username already exists.");
      }
    }

    if (params.email) {
      const existingByEmail = await this.storage.getUserByEmail(params.email);
      if (existingByEmail && existingByEmail.id !== params.ignoreUserId) {
        throw new AuthAccountError(409, "INVALID_EMAIL", "Email already exists.");
      }
    }
  }

  private async invalidateUserSessions(username: string, reason: string) {
    return this.authenticationOperations.invalidateUserSessions(username, reason);
  }

  async login(input: LoginInput) {
    return this.authenticationOperations.login(input);
  }

  async verifyTwoFactorLogin(input: {
    userId: string;
    code: string;
    fingerprint?: string | null;
    browserName: string;
    pcName?: string | null;
    ipAddress?: string | null;
  }) {
    return this.authenticationOperations.verifyTwoFactorLogin(input);
  }

  async validateActivationToken(rawTokenInput: string): Promise<ActivationTokenValidationResult> {
    return this.authenticationOperations.validateActivationToken(rawTokenInput);
  }

  async activateAccount(params: {
    username?: string;
    token: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    return this.authenticationOperations.activateAccount(params);
  }

  async requestPasswordReset(identifier: string) {
    return this.authenticationOperations.requestPasswordReset(identifier);
  }

  async validatePasswordResetToken(
    rawTokenInput: string,
  ): Promise<PasswordResetTokenValidationResult> {
    return this.authenticationOperations.validatePasswordResetToken(rawTokenInput);
  }

  async resetPasswordWithToken(params: {
    token: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    return this.authenticationOperations.resetPasswordWithToken(params);
  }

  async changeOwnPassword(authUser: AuthenticatedUser | undefined, input: ChangePasswordInput) {
    return this.selfOperations.changeOwnPassword(authUser, input);
  }

  async changeOwnUsername(authUser: AuthenticatedUser | undefined, newUsernameRaw: string) {
    return this.selfOperations.changeOwnUsername(authUser, newUsernameRaw);
  }

  async getCurrentUser(authUser: AuthenticatedUser | undefined) {
    return this.selfOperations.getCurrentUser(authUser);
  }

  async startTwoFactorSetup(
    authUser: AuthenticatedUser | undefined,
    input: StartTwoFactorSetupInput,
  ) {
    return this.selfOperations.startTwoFactorSetup(authUser, input);
  }

  async confirmTwoFactorSetup(
    authUser: AuthenticatedUser | undefined,
    input: ConfirmTwoFactorSetupInput,
  ) {
    return this.selfOperations.confirmTwoFactorSetup(authUser, input);
  }

  async disableTwoFactor(
    authUser: AuthenticatedUser | undefined,
    input: DisableTwoFactorInput,
  ) {
    return this.selfOperations.disableTwoFactor(authUser, input);
  }

  async updateOwnCredentials(
    authUser: AuthenticatedUser | undefined,
    input: UpdateOwnCredentialsInput,
  ) {
    return this.selfOperations.updateOwnCredentials(authUser, input);
  }

  async getManagedUsers(
    authUser: AuthenticatedUser | undefined,
    query: Record<string, unknown> = {},
  ) {
    return this.managedOperations.getManagedUsers(authUser, query);
  }

  async getAccounts(authUser: AuthenticatedUser | undefined) {
    return this.managedOperations.getAccounts(authUser);
  }

  async getDevMailPreviewHtml(previewId: string) {
    return this.managedOperations.getDevMailPreviewHtml(previewId);
  }

  async listDevMailOutbox(
    authUser: AuthenticatedUser | undefined,
    query: Record<string, unknown> = {},
  ) {
    return this.managedOperations.listDevMailOutbox(authUser, query);
  }

  async deleteDevMailPreview(authUser: AuthenticatedUser | undefined, previewId: string) {
    return this.managedOperations.deleteDevMailPreview(authUser, previewId);
  }

  async clearDevMailOutbox(authUser: AuthenticatedUser | undefined) {
    return this.managedOperations.clearDevMailOutbox(authUser);
  }

  async deleteManagedUser(authUser: AuthenticatedUser | undefined, targetUserId: string) {
    return this.managedOperations.deleteManagedUser(authUser, targetUserId);
  }

  async createManagedUser(authUser: AuthenticatedUser | undefined, input: CreateManagedUserInput) {
    return this.managedOperations.createManagedUser(authUser, input);
  }

  async updateManagedUser(
    authUser: AuthenticatedUser | undefined,
    targetUserId: string,
    input: UpdateManagedUserInput,
  ) {
    return this.managedOperations.updateManagedUser(authUser, targetUserId, input);
  }

  async updateManagedUserRole(
    authUser: AuthenticatedUser | undefined,
    targetUserId: string,
    nextRoleRaw: string,
  ) {
    return this.managedOperations.updateManagedUserRole(authUser, targetUserId, nextRoleRaw);
  }

  async updateManagedUserStatus(
    authUser: AuthenticatedUser | undefined,
    targetUserId: string,
    input: UpdateManagedStatusInput,
  ) {
    return this.managedOperations.updateManagedUserStatus(authUser, targetUserId, input);
  }

  async resendActivation(authUser: AuthenticatedUser | undefined, targetUserId: string) {
    return this.managedOperations.resendActivation(authUser, targetUserId);
  }

  async listPendingPasswordResetRequests(
    authUser: AuthenticatedUser | undefined,
    query: Record<string, unknown> = {},
  ) {
    return this.managedOperations.listPendingPasswordResetRequests(authUser, query);
  }

  async resetManagedUserPassword(authUser: AuthenticatedUser | undefined, targetUserId: string) {
    return this.managedOperations.resetManagedUserPassword(authUser, targetUserId);
  }
}
