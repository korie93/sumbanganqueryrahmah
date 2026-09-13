import { normalizeAccountStatus } from "../auth/account-lifecycle";
import { normalizeUsernameInput } from "../auth/credentials";
import { hashPassword } from "../auth/passwords";
import type { PostgresStorage } from "../storage-postgres";
import {
  assertConfirmedStrongPassword,
  assertUsableActivationTokenRecord,
  findOpaqueTokenRecordByHashCandidates,
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

    const now = new Date();
    const lookup = await findOpaqueTokenRecordByHashCandidates(
      rawToken,
      (candidateHash) => this.deps.storage.getActivationTokenRecordByHash(candidateHash),
    );
    const record = assertUsableActivationTokenRecord(
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

    const now = new Date();
    const lookup = await findOpaqueTokenRecordByHashCandidates(
      rawToken,
      (candidateHash) => this.deps.storage.getActivationTokenRecordByHash(candidateHash),
    );
    const record = assertUsableActivationTokenRecord(
      lookup?.record,
      now,
    );
    const requestedUsername = normalizeUsernameInput(params.username);
    if (requestedUsername && requestedUsername !== record.username) {
      throw new AuthAccountError(400, ERROR_CODES.INVALID_TOKEN, "Activation token is invalid.");
    }

    const passwordHash = await hashPassword(newPassword);
    const completed = await this.deps.storage.completeAccountRecovery({
      kind: "activation",
      userId: record.userId,
      tokenId: record.tokenId,
      tokenHash: lookup!.tokenHash,
      passwordHash,
    });
    if (!completed) {
      const latest = lookup
        ? await this.deps.storage.getActivationTokenRecordByHash(lookup.tokenHash)
        : undefined;
      assertUsableActivationTokenRecord(latest, new Date());
      throw new AuthAccountError(409, ERROR_CODES.CONFLICT, "Account activation changed. Open the latest activation link again.");
    }

    const target = completed.user;
    await this.deps.storage.createAuditLog({
      action: "ACCOUNT_ACTIVATION_COMPLETED",
      performedBy: target.username,
      targetUser: target.id,
      details: "Account activation completed.",
    });

    return target;
  }
}
