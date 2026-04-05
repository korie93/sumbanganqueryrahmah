import type { AuthenticatedUser } from "../auth/guards";
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
import { AuthAccountDevMailOperations } from "./auth-account-dev-mail-operations";
import { AuthAccountRecoveryOperations } from "./auth-account-recovery-operations";
import {
  AuthAccountSelfOperations,
  type ChangePasswordInput,
  type ConfirmTwoFactorSetupInput,
  type DisableTwoFactorInput,
  type StartTwoFactorSetupInput,
  type UpdateOwnCredentialsInput,
} from "./auth-account-self-operations";
import { AuthAccountAuthenticationOperations } from "./auth-account-authentication-operations";
import { createAuthAccountServicePolicies } from "./auth-account-service-policies";
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
  | "recordFailedLoginAttempt"
  | "resolvePendingPasswordResetRequestsForUser"
  | "touchLastLogin"
  | "updateActivitiesUsername"
  | "updateUserAccount"
  | "updateUserCredentials"
>;

export class AuthAccountService {
  private readonly authenticationOperations: AuthAccountAuthenticationOperations;
  private readonly devMailOperations: AuthAccountDevMailOperations;
  private readonly managedOperations: AuthAccountManagedOperations;
  private readonly recoveryOperations: AuthAccountRecoveryOperations;
  private readonly selfOperations: AuthAccountSelfOperations;
  private readonly policyHelpers: ReturnType<typeof createAuthAccountServicePolicies>;

  constructor(private readonly storage: AuthAccountStorage) {
    this.policyHelpers = createAuthAccountServicePolicies(this.storage);
    this.authenticationOperations = new AuthAccountAuthenticationOperations({
      storage: this.storage,
    });
    this.recoveryOperations = new AuthAccountRecoveryOperations({
      storage: this.storage,
      invalidateUserSessions: this.invalidateUserSessions.bind(this),
      requireManagedEmail: this.policyHelpers.requireManagedEmail,
    });
    this.managedOperations = new AuthAccountManagedOperations({
      storage: this.storage,
      ensureUniqueIdentity: this.policyHelpers.ensureUniqueIdentity,
      invalidateUserSessions: this.invalidateUserSessions.bind(this),
      requireManageableTarget: this.policyHelpers.requireManageableTarget,
      requireManagedEmail: this.policyHelpers.requireManagedEmail,
      requireSuperuser: this.policyHelpers.requireSuperuser,
      sendActivationEmail: this.recoveryOperations.sendActivationEmail.bind(this.recoveryOperations),
      sendPasswordResetEmail: this.recoveryOperations.sendPasswordResetEmail.bind(this.recoveryOperations),
      validateEmail: this.policyHelpers.validateEmail,
      validateUsername: this.policyHelpers.validateUsername,
    });
    this.devMailOperations = new AuthAccountDevMailOperations({
      storage: this.storage,
      requireSuperuser: this.policyHelpers.requireSuperuser,
    });
    this.selfOperations = new AuthAccountSelfOperations({
      storage: this.storage,
      ensureUniqueIdentity: this.policyHelpers.ensureUniqueIdentity,
      requireActor: this.policyHelpers.requireActor,
      validateUsername: this.policyHelpers.validateUsername,
    });
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
    return this.recoveryOperations.validateActivationToken(rawTokenInput);
  }

  async activateAccount(params: {
    username?: string;
    token: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    return this.recoveryOperations.activateAccount(params);
  }

  async requestPasswordReset(identifier: string) {
    return this.recoveryOperations.requestPasswordReset(identifier);
  }

  async validatePasswordResetToken(
    rawTokenInput: string,
  ): Promise<PasswordResetTokenValidationResult> {
    return this.recoveryOperations.validatePasswordResetToken(rawTokenInput);
  }

  async resetPasswordWithToken(params: {
    token: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    return this.recoveryOperations.resetPasswordWithToken(params);
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
    return this.devMailOperations.getDevMailPreviewHtml(previewId);
  }

  async listDevMailOutbox(
    authUser: AuthenticatedUser | undefined,
    query: Record<string, unknown> = {},
  ) {
    return this.devMailOperations.listDevMailOutbox(authUser, query);
  }

  async deleteDevMailPreview(authUser: AuthenticatedUser | undefined, previewId: string) {
    return this.devMailOperations.deleteDevMailPreview(authUser, previewId);
  }

  async clearDevMailOutbox(authUser: AuthenticatedUser | undefined) {
    return this.devMailOperations.clearDevMailOutbox(authUser);
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
