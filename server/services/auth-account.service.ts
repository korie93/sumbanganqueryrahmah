import type { AuthenticatedUser } from "../auth/guards";
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
import { AuthAccountAuthenticationOperations } from "./auth-account-authentication-operations";
import { AuthAccountRecoveryOperations } from "./auth-account-recovery-operations";
import {
  AuthAccountSelfOperations,
  type ChangePasswordInput,
  type ConfirmTwoFactorSetupInput,
  type DisableTwoFactorInput,
  type StartTwoFactorSetupInput,
  type UpdateOwnCredentialsInput,
} from "./auth-account-self-operations";
import { createAuthAccountServiceOperations } from "./auth-account-service-operation-factory";
import type {
  ActivateAccountInput,
  AuthAccountStorage,
  LoginInput,
  ResetPasswordWithTokenInput,
  TwoFactorLoginInput,
} from "./auth-account-service-shared";
export {
  type ActivationTokenValidationResult,
  type ManagedAccountActivationDelivery,
  type ManagedAccountPasswordResetDelivery,
  type PasswordResetTokenValidationResult,
  AuthAccountError,
} from "./auth-account-types";

export class AuthAccountService {
  private readonly authenticationOperations: AuthAccountAuthenticationOperations;
  private readonly devMailOperations: AuthAccountDevMailOperations;
  private readonly managedOperations: AuthAccountManagedOperations;
  private readonly recoveryOperations: AuthAccountRecoveryOperations;
  private readonly selfOperations: AuthAccountSelfOperations;

  constructor(storage: AuthAccountStorage) {
    const operations = createAuthAccountServiceOperations(storage);
    this.authenticationOperations = operations.authenticationOperations;
    this.devMailOperations = operations.devMailOperations;
    this.managedOperations = operations.managedOperations;
    this.recoveryOperations = operations.recoveryOperations;
    this.selfOperations = operations.selfOperations;
  }

  async login(input: LoginInput) {
    return this.authenticationOperations.login(input);
  }

  async verifyTwoFactorLogin(input: TwoFactorLoginInput) {
    return this.authenticationOperations.verifyTwoFactorLogin(input);
  }

  async validateActivationToken(rawTokenInput: string): Promise<ActivationTokenValidationResult> {
    return this.recoveryOperations.validateActivationToken(rawTokenInput);
  }

  async activateAccount(params: ActivateAccountInput) {
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

  async resetPasswordWithToken(params: ResetPasswordWithTokenInput) {
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
