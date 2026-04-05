import type { AuthenticatedUser } from "../auth/guards";
import { buildPasswordResetUrl } from "../auth/activation-links";
import { normalizeAccountStatus } from "../auth/account-lifecycle";
import {
  generateOneTimeToken,
  hashPassword,
} from "../auth/passwords";
import { createPasswordResetTokenPayload } from "./auth-account-token-utils";
import type { PaginatedListMeta } from "./auth-account-pagination-utils";
import { listPendingPasswordResetRequestsPageOrAll } from "./auth-account-managed-list-utils";
import { AuthAccountError } from "./auth-account-types";
import {
  buildManagedActivationDeliveryResponse,
  buildPasswordResetApprovedAuditDetails,
  buildPasswordResetSendFailedAuditDetails,
} from "./auth-account-managed-utils";
import type { AuthAccountManagedOpsDeps } from "./auth-account-managed-shared";

export class AuthAccountManagedRecoveryOperations {
  constructor(private readonly deps: AuthAccountManagedOpsDeps) {}

  async resendActivation(authUser: AuthenticatedUser | undefined, targetUserId: string) {
    const actor = await this.deps.requireSuperuser(authUser);
    const target = await this.deps.requireManageableTarget(targetUserId);

    if (normalizeAccountStatus(target.status, "active") !== "pending_activation") {
      throw new AuthAccountError(
        409,
        "ACCOUNT_UNAVAILABLE",
        "Activation can only be resent for pending accounts.",
      );
    }

    const activation = await this.deps.sendActivationEmail({
      actorUsername: actor.username,
      user: target,
      resent: true,
    });

    return {
      user: target,
      activation: buildManagedActivationDeliveryResponse(activation.delivery),
    };
  }

  async listPendingPasswordResetRequests(
    authUser: AuthenticatedUser | undefined,
    query: Record<string, unknown> = {},
  ): Promise<{
    requests: Awaited<ReturnType<typeof listPendingPasswordResetRequestsPageOrAll>>["requests"];
    pagination: PaginatedListMeta;
  }> {
    await this.deps.requireSuperuser(authUser);
    return listPendingPasswordResetRequestsPageOrAll(this.deps.storage, query);
  }

  async resetManagedUserPassword(authUser: AuthenticatedUser | undefined, targetUserId: string) {
    const actor = await this.deps.requireSuperuser(authUser);
    const target = await this.deps.requireManageableTarget(targetUserId);

    if (normalizeAccountStatus(target.status, "active") === "pending_activation") {
      throw new AuthAccountError(
        409,
        "ACCOUNT_UNAVAILABLE",
        "Pending accounts must complete activation instead of password reset.",
      );
    }

    const recipientEmail = this.deps.requireManagedEmail(
      target.email,
      "Email is required to send password reset.",
    );
    const now = new Date();
    await this.deps.storage.invalidateUnusedPasswordResetTokens(target.id, now);
    const reset = createPasswordResetTokenPayload();
    const resetUrl = buildPasswordResetUrl(reset.token);
    const resetRequest = await this.deps.storage.createPasswordResetRequest({
      userId: target.id,
      requestedByUser: null,
      approvedBy: actor.username,
      resetType: "email_link",
      tokenHash: reset.tokenHash,
      expiresAt: reset.expiresAt,
      usedAt: null,
    });
    const delivery = await this.deps.sendPasswordResetEmail({
      expiresAt: reset.expiresAt,
      resetUrl,
      user: target,
    });

    if (!delivery.sent) {
      await this.deps.storage.consumePasswordResetRequestById({
        requestId: resetRequest.id,
        now,
      });
      await this.deps.storage.createAuditLog({
        action: "PASSWORD_RESET_SEND_FAILED",
        performedBy: actor.username,
        targetUser: target.id,
        details: buildPasswordResetSendFailedAuditDetails({
          recipientEmail,
          reset,
          delivery,
        }),
      });

      return {
        user: target,
        closedSessionIds: [] as string[],
        reset: delivery,
      };
    }

    await this.deps.storage.resolvePendingPasswordResetRequestsForUser({
      userId: target.id,
      approvedBy: actor.username,
      resetType: "email_link",
      usedAt: now,
    });

    const placeholderPasswordHash = await hashPassword(generateOneTimeToken());
    const updatedUser = await this.deps.storage.updateUserAccount({
      userId: target.id,
      passwordHash: placeholderPasswordHash,
      passwordChangedAt: now,
      mustChangePassword: true,
      passwordResetBySuperuser: true,
      activatedAt: target.activatedAt ?? now,
      failedLoginAttempts: 0,
      lockedAt: null,
      lockedReason: null,
      lockedBySystem: false,
    });
    const closedSessionIds = await this.deps.invalidateUserSessions(
      target.username,
      "PASSWORD_RESET_BY_SUPERUSER",
    );

    await this.deps.storage.createAuditLog({
      action: "PASSWORD_RESET_APPROVED",
      performedBy: actor.username,
      targetUser: target.id,
      details: buildPasswordResetApprovedAuditDetails({
        recipientEmail,
        reset,
        delivery,
        targetLockedAt: target.lockedAt,
      }),
    });

    return {
      user: updatedUser ?? target,
      closedSessionIds,
      reset: delivery,
    };
  }
}
