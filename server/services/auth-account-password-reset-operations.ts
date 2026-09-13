import { CREDENTIAL_EMAIL_REGEX } from "../auth/credentials";
import { hashPassword } from "../auth/passwords";
import type { PostgresStorage } from "../storage-postgres";
import {
  assertConfirmedStrongPassword,
  assertUsablePasswordResetTokenRecord,
  findOpaqueTokenRecordByHashCandidates,
} from "./auth-account-token-utils";
import { sendPasswordResetEmailOperation } from "./auth-account-authentication-utils";
import {
  type ManagedAccountPasswordResetDelivery,
  type PasswordResetTokenValidationResult,
  AuthAccountError,
} from "./auth-account-types";
import type { AuthAccountRecoveryDeps } from "./auth-account-recovery-shared";
import { ERROR_CODES } from "../../shared/error-codes";

export class AuthAccountPasswordResetOperations {
  constructor(private readonly deps: AuthAccountRecoveryDeps) {}

  async sendPasswordResetEmail(params: {
    expiresAt: Date;
    resetUrl: string;
    user: Awaited<ReturnType<PostgresStorage["getUser"]>>;
  }): Promise<ManagedAccountPasswordResetDelivery> {
    return sendPasswordResetEmailOperation({
      expiresAt: params.expiresAt,
      requireManagedEmail: this.deps.requireManagedEmail,
      resetUrl: params.resetUrl,
      user: params.user,
    });
  }

  async requestPasswordReset(identifier: string) {
    const normalized = String(identifier || "").trim().toLowerCase();
    if (!normalized) {
      throw new AuthAccountError(400, ERROR_CODES.INVALID_IDENTIFIER, "Username or email is required.");
    }

    const user = CREDENTIAL_EMAIL_REGEX.test(normalized)
      ? await this.deps.storage.getUserByEmail(normalized)
      : await this.deps.storage.getUserByUsername(normalized)
        || await this.deps.storage.getUserByEmail(normalized);

    if (!user || user.role === "superuser" || user.status === "deleted") {
      return { accepted: true };
    }

    await this.deps.storage.createPasswordResetRequest({
      userId: user.id,
      requestedByUser: normalized,
    });

    await this.deps.storage.createAuditLog({
      action: "PASSWORD_RESET_REQUESTED",
      performedBy: user.username,
      targetUser: user.id,
      details: "Password reset request submitted.",
    });

    return { accepted: true };
  }

  async validatePasswordResetToken(
    rawTokenInput: string,
  ): Promise<PasswordResetTokenValidationResult> {
    const rawToken = String(rawTokenInput || "").trim();
    if (!rawToken) {
      throw new AuthAccountError(400, ERROR_CODES.INVALID_TOKEN, "Password reset token is invalid.");
    }

    const now = new Date();
    const lookup = await findOpaqueTokenRecordByHashCandidates(
      rawToken,
      (candidateHash) => this.deps.storage.getPasswordResetTokenRecordByHash(candidateHash),
    );
    const record = assertUsablePasswordResetTokenRecord(
      lookup?.record,
      now,
    );

    return {
      email: record.email,
      expiresAt: record.expiresAt,
      fullName: record.fullName,
      role: record.role,
      username: record.username,
    };
  }

  async resetPasswordWithToken(params: {
    token: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    const rawToken = String(params.token || "").trim();
    const newPassword = String(params.newPassword || "");
    const confirmPassword = String(params.confirmPassword || "");

    if (!rawToken) {
      throw new AuthAccountError(400, ERROR_CODES.INVALID_TOKEN, "Password reset token is invalid.");
    }

    assertConfirmedStrongPassword(newPassword, confirmPassword);

    const now = new Date();
    const lookup = await findOpaqueTokenRecordByHashCandidates(
      rawToken,
      (candidateHash) => this.deps.storage.getPasswordResetTokenRecordByHash(candidateHash),
    );
    const record = assertUsablePasswordResetTokenRecord(
      lookup?.record,
      now,
    );
    const tokenHash = lookup?.tokenHash;
    if (!tokenHash) {
      throw new AuthAccountError(400, ERROR_CODES.INVALID_TOKEN, "Password reset token is invalid.");
    }
    const passwordHash = await hashPassword(newPassword);
    const completed = await this.deps.storage.completeAccountRecovery({
      kind: "password_reset",
      userId: record.userId,
      tokenId: record.requestId,
      tokenHash,
      passwordHash,
    });
    if (!completed) {
      const latest = await this.deps.storage.getPasswordResetTokenRecordByHash(tokenHash);
      assertUsablePasswordResetTokenRecord(latest, new Date());
      throw new AuthAccountError(409, ERROR_CODES.CONFLICT, "Password reset changed. Open the latest reset link again.");
    }

    const target = completed.user;
    const remainingSessionIds = await this.deps.invalidateUserSessions(target.username, "PASSWORD_RESET_COMPLETED");
    const closedSessionIds = [...new Set([...completed.closedSessionIds, ...remainingSessionIds])];
    await this.deps.storage.createAuditLog({
      action: "PASSWORD_RESET_COMPLETED",
      performedBy: target.username,
      targetUser: target.id,
      details: JSON.stringify({
        metadata: {
          reset_type: "email_link",
          lock_cleared: completed.lockCleared,
        },
      }),
    });

    return { user: target, closedSessionIds };
  }
}
