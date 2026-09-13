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
import { ERROR_CODES } from "../../shared/error-codes";

export class AuthAccountManagedRecoveryOperations {
  constructor(private readonly deps: AuthAccountManagedOpsDeps) {}

  async resendActivation(authUser: AuthenticatedUser | undefined, targetUserId: string) {
    const actor = await this.deps.requireSuperuser(authUser);
    const target = await this.deps.requireManageableTarget(targetUserId);

    if (normalizeAccountStatus(target.status, "active") !== "pending_activation") {
      throw new AuthAccountError(
        409,
        ERROR_CODES.ACCOUNT_UNAVAILABLE,
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
        ERROR_CODES.ACCOUNT_UNAVAILABLE,
        "Pending accounts must complete activation instead of password reset.",
      );
    }

    const recipientEmail = this.deps.requireManagedEmail(
      target.email,
      "Email is required to send password reset.",
    );
    const now = new Date();
    // Token issuance invalidates older links in the same repository transaction.
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

    const placeholderPasswordHash = await hashPassword(generateOneTimeToken());
    const prepared = await this.deps.storage.prepareDeliveredPasswordReset({
      userId: target.id,
      requestId: resetRequest.id,
      tokenHash: reset.tokenHash,
      expectedPasswordHash: target.passwordHash,
      passwordHash: placeholderPasswordHash,
      approvedBy: actor.username,
    });
    if (!prepared) {
      // The recipient may already have redeemed the link while delivery was
      // completing. Do not clobber that password or a newer reset operation.
      return { user: await this.deps.requireManageableTarget(target.id), closedSessionIds: [] as string[], reset: delivery };
    }
    const remainingSessionIds = await this.deps.invalidateUserSessions(
      target.username,
      "PASSWORD_RESET_BY_SUPERUSER",
    );
    // The transaction already deactivated these rows, so a later active-only
    // query cannot rediscover the IDs needed to close their live sockets.
    const closedSessionIds = [...new Set([...prepared.closedSessionIds, ...remainingSessionIds])];

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
      user: prepared.user,
      closedSessionIds,
      reset: delivery,
    };
  }
}
