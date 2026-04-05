import type { PostgresStorage } from "../storage-postgres";
import { AuthAccountActivationOperations } from "./auth-account-activation-operations";
import { AuthAccountPasswordResetOperations } from "./auth-account-password-reset-operations";
import type { AuthAccountRecoveryDeps } from "./auth-account-recovery-shared";

export class AuthAccountRecoveryOperations {
  private readonly activationOperations: AuthAccountActivationOperations;
  private readonly passwordResetOperations: AuthAccountPasswordResetOperations;

  constructor(deps: AuthAccountRecoveryDeps) {
    this.activationOperations = new AuthAccountActivationOperations(deps);
    this.passwordResetOperations = new AuthAccountPasswordResetOperations(deps);
  }

  async sendActivationEmail(params: {
    actorUsername: string;
    user: Awaited<ReturnType<PostgresStorage["getUser"]>>;
    resent?: boolean;
  }) {
    return this.activationOperations.sendActivationEmail(params);
  }

  async sendPasswordResetEmail(params: {
    expiresAt: Date;
    resetUrl: string;
    user: Awaited<ReturnType<PostgresStorage["getUser"]>>;
  }) {
    return this.passwordResetOperations.sendPasswordResetEmail(params);
  }

  async validateActivationToken(rawTokenInput: string) {
    return this.activationOperations.validateActivationToken(rawTokenInput);
  }

  async activateAccount(params: {
    username?: string;
    token: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    return this.activationOperations.activateAccount(params);
  }

  async requestPasswordReset(identifier: string) {
    return this.passwordResetOperations.requestPasswordReset(identifier);
  }

  async validatePasswordResetToken(rawTokenInput: string) {
    return this.passwordResetOperations.validatePasswordResetToken(rawTokenInput);
  }

  async resetPasswordWithToken(params: {
    token: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    return this.passwordResetOperations.resetPasswordWithToken(params);
  }
}
