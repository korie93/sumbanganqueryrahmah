import { normalizeAccountStatus } from "../auth/account-lifecycle";
import { normalizeUsernameInput } from "../auth/credentials";
import {
  hashOpaqueToken,
  hashPassword,
} from "../auth/passwords";
import type { PostgresStorage } from "../storage-postgres";
import {
  assertConfirmedStrongPassword,
  assertUsableActivationTokenRecord,
} from "./auth-account-token-utils";
import { sendActivationEmailOperation } from "./auth-account-authentication-utils";
import {
  type ActivationTokenValidationResult,
  AuthAccountError,
} from "./auth-account-types";
import type { AuthAccountRecoveryDeps } from "./auth-account-recovery-shared";
import { ERROR_CODES } from "../../shared/error-codes";

export class AuthAccountActivationOperations {
  constructor(private readonly deps: AuthAccountRecoveryDeps) {}

  async sendActivationEmail(params: {
    actorUsername: string;
    user: Awaited<ReturnType<PostgresStorage["getUser"]>>;
    resent?: boolean | undefined;
  }) {
    if (!params.user) {
      throw new AuthAccountError(404, ERROR_CODES.USER_NOT_FOUND, "Target user not found.");
    }

    if (normalizeAccountStatus(params.user.status, "pending_activation") !== "pending_activation") {
      throw new AuthAccountError(
        409,
        ERROR_CODES.ACCOUNT_UNAVAILABLE,
        "Activation can only be sent to pending accounts.",
      );
    }

    if (params.user.isBanned) {
      throw new AuthAccountError(
        409,
        ERROR_CODES.ACCOUNT_UNAVAILABLE,
        "Activation can only be sent to non-banned accounts.",
      );
    }

    return sendActivationEmailOperation({
      actorUsername: params.actorUsername,
      requireManagedEmail: this.deps.requireManagedEmail,
      resent: params.resent,
      storage: this.deps.storage,
      user: params.user,
    });
  }

  async validateActivationToken(rawTokenInput: string): Promise<ActivationTokenValidationResult> {
    const rawToken = String(rawTokenInput || "").trim();
    if (!rawToken) {
      throw new AuthAccountError(400, ERROR_CODES.INVALID_TOKEN, "Activation token is invalid.");
    }

    const tokenHash = hashOpaqueToken(rawToken);
    const now = new Date();
    const record = assertUsableActivationTokenRecord(
      await this.deps.storage.getActivationTokenRecordByHash(tokenHash),
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

  async activateAccount(params: {
    username?: string | undefined;
    token: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    const rawToken = String(params.token || "").trim();
    const newPassword = String(params.newPassword || "");
    const confirmPassword = String(params.confirmPassword || "");

    if (!rawToken) {
      throw new AuthAccountError(400, ERROR_CODES.INVALID_TOKEN, "Activation token is invalid.");
    }

    assertConfirmedStrongPassword(newPassword, confirmPassword);

    const tokenHash = hashOpaqueToken(rawToken);
    const now = new Date();
    const record = assertUsableActivationTokenRecord(
      await this.deps.storage.getActivationTokenRecordByHash(tokenHash),
      now,
    );
    const requestedUsername = normalizeUsernameInput(params.username);
    if (requestedUsername && requestedUsername !== record.username) {
      throw new AuthAccountError(400, ERROR_CODES.INVALID_TOKEN, "Activation token is invalid.");
    }

    const consumed = await this.deps.storage.consumeActivationTokenById({
      tokenId: record.tokenId,
      now,
    });
    if (!consumed) {
      const latest = await this.deps.storage.getActivationTokenRecordByHash(tokenHash);
      assertUsableActivationTokenRecord(latest, now);
      throw new AuthAccountError(400, ERROR_CODES.INVALID_TOKEN, "Activation token is invalid.");
    }

    const target = await this.deps.storage.getUser(record.userId);
    if (!target) {
      throw new AuthAccountError(404, ERROR_CODES.USER_NOT_FOUND, "Target user not found.");
    }
    if (
      target.isBanned
      || normalizeAccountStatus(target.status, "pending_activation") !== "pending_activation"
    ) {
      throw new AuthAccountError(
        409,
        ERROR_CODES.ACCOUNT_UNAVAILABLE,
        "Account activation is no longer available.",
      );
    }

    const passwordHash = await hashPassword(newPassword);
    const updatedUser = await this.deps.storage.updateUserAccount({
      userId: target.id,
      passwordHash,
      passwordChangedAt: now,
      activatedAt: now,
      status: "active",
      mustChangePassword: false,
      passwordResetBySuperuser: false,
      failedLoginAttempts: 0,
      lockedAt: null,
      lockedReason: null,
      lockedBySystem: false,
    });

    await this.deps.storage.invalidateUnusedActivationTokens(target.id);
    await this.deps.storage.createAuditLog({
      action: "ACCOUNT_ACTIVATION_COMPLETED",
      performedBy: target.username,
      targetUser: target.id,
      details: "Account activation completed.",
    });

    return updatedUser ?? target;
  }
}
