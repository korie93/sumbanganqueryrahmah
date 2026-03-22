import type { AuthenticatedUser } from "../auth/guards";
import { buildPasswordResetUrl } from "../auth/activation-links";
import {
  normalizeAccountStatus,
  normalizeManageableUserRole,
} from "../auth/account-lifecycle";
import {
  normalizeEmailInput,
  normalizeUsernameInput,
} from "../auth/credentials";
import {
  generateOneTimeToken,
  generateTemporaryPassword,
  hashPassword,
} from "../auth/passwords";
import { readOptionalString } from "../http/validation";
import {
  clearDevMailOutbox as clearDevMailOutboxFiles,
  deleteDevMailPreview as deleteDevMailPreviewFile,
  isDevMailOutboxEnabled,
  listDevMailPreviewsPage,
  readDevMailPreview,
  renderDevMailPreviewHtml,
} from "../mail/dev-mail-outbox";
import type {
  ManagedUserAccount,
  PendingPasswordResetRequestSummary,
  PostgresStorage,
} from "../storage-postgres";
import { createPasswordResetTokenPayload } from "./auth-account-token-utils";
import {
  buildLocalPaginationMeta,
  parseManageableStatusFilter,
  readPaginationMeta,
  type PaginatedListMeta,
} from "./auth-account-pagination-utils";
import {
  AuthAccountError,
  type ManagedAccountActivationDelivery,
  type ManagedAccountPasswordResetDelivery,
} from "./auth-account-types";

export type CreateManagedUserInput = {
  username: string;
  fullName?: string | null;
  email?: string | null;
  role: string;
};

export type UpdateManagedUserInput = {
  username?: string;
  fullName?: string | null;
  email?: string | null;
};

export type UpdateManagedStatusInput = {
  status?: string;
  isBanned?: boolean;
};

type AuthAccountManagedUser = NonNullable<Awaited<ReturnType<PostgresStorage["getUser"]>>>;

type AuthAccountManagedStorage = Pick<
  PostgresStorage,
  | "consumePasswordResetRequestById"
  | "createAuditLog"
  | "createManagedUserAccount"
  | "createPasswordResetRequest"
  | "deleteManagedUserAccount"
  | "getAccounts"
  | "getManagedUsers"
  | "invalidateUnusedPasswordResetTokens"
  | "listManagedUsersPage"
  | "listPendingPasswordResetRequests"
  | "listPendingPasswordResetRequestsPage"
  | "resolvePendingPasswordResetRequestsForUser"
  | "updateActivitiesUsername"
  | "updateUserAccount"
>;

type AuthAccountManagedOpsDeps = {
  storage: AuthAccountManagedStorage;
  ensureUniqueIdentity: (params: {
    username?: string;
    email?: string | null;
    ignoreUserId?: string;
  }) => Promise<void>;
  invalidateUserSessions: (username: string, reason: string) => Promise<string[]>;
  requireManageableTarget: (userId: string) => Promise<AuthAccountManagedUser>;
  requireManagedEmail: (email: string | null, message: string) => string;
  requireSuperuser: (authUser: AuthenticatedUser | undefined) => Promise<AuthAccountManagedUser>;
  sendActivationEmail: (params: {
    actorUsername: string;
    user: Awaited<ReturnType<PostgresStorage["getUser"]>>;
    resent?: boolean;
  }) => Promise<{
    delivery: ManagedAccountActivationDelivery;
  }>;
  sendPasswordResetEmail: (params: {
    expiresAt: Date;
    resetUrl: string;
    user: Awaited<ReturnType<PostgresStorage["getUser"]>>;
  }) => Promise<ManagedAccountPasswordResetDelivery>;
  validateEmail: (email: string | null) => void;
  validateUsername: (username: string) => void;
};

export class AuthAccountManagedOperations {
  constructor(private readonly deps: AuthAccountManagedOpsDeps) {}

  async getManagedUsers(
    authUser: AuthenticatedUser | undefined,
    query: Record<string, unknown> = {},
  ): Promise<{ users: ManagedUserAccount[]; pagination: PaginatedListMeta }> {
    await this.deps.requireSuperuser(authUser);

    const hasQueryFilters =
      query.page !== undefined
      || query.pageSize !== undefined
      || query.search !== undefined
      || query.role !== undefined
      || query.status !== undefined;

    if (!hasQueryFilters) {
      const users = await this.deps.storage.getManagedUsers();
      return {
        users,
        pagination: buildLocalPaginationMeta(users.length),
      };
    }

    const { page, pageSize } = readPaginationMeta(query, {
      pageSize: 50,
      maxPageSize: 100,
    });

    const result = await this.deps.storage.listManagedUsersPage({
      page,
      pageSize,
      search: readOptionalString(query.search),
      role: (() => {
        const value = String(readOptionalString(query.role) || "all").toLowerCase();
        return value === "admin" || value === "user" ? value : "all";
      })(),
      status: parseManageableStatusFilter(query.status),
    });

    return {
      users: result.users,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  async getAccounts(authUser: AuthenticatedUser | undefined) {
    await this.deps.requireSuperuser(authUser);
    return this.deps.storage.getAccounts();
  }

  async getDevMailPreviewHtml(previewId: string) {
    if (!isDevMailOutboxEnabled()) {
      return null;
    }

    const preview = await readDevMailPreview(previewId);
    if (!preview) {
      return null;
    }

    return renderDevMailPreviewHtml(preview);
  }

  async listDevMailOutbox(
    authUser: AuthenticatedUser | undefined,
    query: Record<string, unknown> = {},
  ) {
    await this.deps.requireSuperuser(authUser);
    const { page, pageSize } = readPaginationMeta(query, {
      pageSize: 25,
      maxPageSize: 100,
    });
    const searchEmail = readOptionalString(query.searchEmail ?? query.email ?? query.searchTo);
    const searchSubject = readOptionalString(
      query.searchSubject ?? query.subject ?? query.search,
    );
    const sortDirection = String(readOptionalString(query.sortDirection) || "").toLowerCase() === "asc"
      ? "asc"
      : "desc";
    const previewPage = await listDevMailPreviewsPage({
      page,
      pageSize,
      searchEmail: searchEmail || undefined,
      searchSubject: searchSubject || undefined,
      sortDirection,
    });

    return {
      enabled: isDevMailOutboxEnabled(),
      previews: previewPage.previews,
      pagination: {
        page: previewPage.page,
        pageSize: previewPage.pageSize,
        total: previewPage.total,
        totalPages: previewPage.totalPages,
      },
    };
  }

  async deleteDevMailPreview(authUser: AuthenticatedUser | undefined, previewId: string) {
    const actor = await this.deps.requireSuperuser(authUser);
    const deleted = await deleteDevMailPreviewFile(previewId);

    if (!deleted) {
      throw new AuthAccountError(404, "MAIL_PREVIEW_NOT_FOUND", "Mail preview not found.");
    }

    await this.deps.storage.createAuditLog({
      action: "DEV_MAIL_OUTBOX_ENTRY_DELETED",
      performedBy: actor.username,
      targetResource: previewId,
      details: "Local mail outbox preview deleted.",
    });

    return {
      deleted: true,
    };
  }

  async clearDevMailOutbox(authUser: AuthenticatedUser | undefined) {
    const actor = await this.deps.requireSuperuser(authUser);
    const deletedCount = await clearDevMailOutboxFiles();

    await this.deps.storage.createAuditLog({
      action: "DEV_MAIL_OUTBOX_CLEARED",
      performedBy: actor.username,
      details: JSON.stringify({
        metadata: {
          deleted_count: deletedCount,
        },
      }),
    });

    return {
      deletedCount,
    };
  }

  async deleteManagedUser(authUser: AuthenticatedUser | undefined, targetUserId: string) {
    const actor = await this.deps.requireSuperuser(authUser);
    const target = await this.deps.requireManageableTarget(targetUserId);

    if (actor.id === target.id) {
      throw new AuthAccountError(
        403,
        "PERMISSION_DENIED",
        "Superuser cannot delete the current account from this action.",
      );
    }

    const closedSessionIds = await this.deps.invalidateUserSessions(target.username, "ACCOUNT_DELETED");
    const deleted = await this.deps.storage.deleteManagedUserAccount(target.id);

    if (!deleted) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
    }

    await this.deps.storage.createAuditLog({
      action: "ACCOUNT_DELETED",
      performedBy: actor.username,
      targetUser: target.id,
      details: JSON.stringify({
        metadata: {
          deleted_role: target.role,
          deleted_status: target.status,
          was_banned: Boolean(target.isBanned),
        },
      }),
    });

    return {
      user: target,
      closedSessionIds,
    };
  }

  async createManagedUser(authUser: AuthenticatedUser | undefined, input: CreateManagedUserInput) {
    const actor = await this.deps.requireSuperuser(authUser);
    const username = normalizeUsernameInput(input.username);
    const email = normalizeEmailInput(input.email);
    const fullName = String(input.fullName || "").trim() || null;
    const role = normalizeManageableUserRole(input.role, "user");

    this.deps.validateUsername(username);
    const requiredEmail = this.deps.requireManagedEmail(
      email || null,
      "Email is required to create a managed account.",
    );
    await this.deps.ensureUniqueIdentity({ username, email: requiredEmail });

    const placeholderPasswordHash = await hashPassword(generateTemporaryPassword());
    const user = await this.deps.storage.createManagedUserAccount({
      username,
      fullName,
      email: requiredEmail,
      role,
      passwordHash: placeholderPasswordHash,
      status: "pending_activation",
      mustChangePassword: false,
      passwordResetBySuperuser: false,
      createdBy: actor.username,
    });

    const activation = await this.deps.sendActivationEmail({
      actorUsername: actor.username,
      user,
    });

    await this.deps.storage.createAuditLog({
      action: "ACCOUNT_CREATED",
      performedBy: actor.username,
      targetUser: user.id,
      details: JSON.stringify({
        metadata: {
          role: user.role,
          status: user.status,
          created_by: actor.username,
        },
      }),
    });

    return {
      user,
      activation: {
        deliveryMode: activation.delivery.deliveryMode,
        errorCode: activation.delivery.errorCode,
        errorMessage: activation.delivery.errorMessage,
        expiresAt: activation.delivery.expiresAt,
        previewUrl: activation.delivery.previewUrl,
        recipientEmail: activation.delivery.recipientEmail,
        sent: activation.delivery.sent,
      } satisfies ManagedAccountActivationDelivery,
    };
  }

  async updateManagedUser(
    authUser: AuthenticatedUser | undefined,
    targetUserId: string,
    input: UpdateManagedUserInput,
  ) {
    const actor = await this.deps.requireSuperuser(authUser);
    const target = await this.deps.requireManageableTarget(targetUserId);
    const nextUsername = input.username !== undefined ? normalizeUsernameInput(input.username) : undefined;
    const nextEmail = input.email !== undefined ? normalizeEmailInput(input.email) : undefined;
    const nextFullName = input.fullName !== undefined ? String(input.fullName || "").trim() || null : undefined;

    if (nextUsername !== undefined) {
      this.deps.validateUsername(nextUsername);
    }
    this.deps.validateEmail(nextEmail || null);
    if (
      normalizeAccountStatus(target.status, "active") === "pending_activation"
      && nextEmail !== undefined
      && !nextEmail
    ) {
      throw new AuthAccountError(
        400,
        "INVALID_EMAIL",
        "Pending accounts require an email address for activation.",
      );
    }
    await this.deps.ensureUniqueIdentity({
      username: nextUsername,
      email: nextEmail,
      ignoreUserId: target.id,
    });

    const updatedUser = await this.deps.storage.updateUserAccount({
      userId: target.id,
      username: nextUsername,
      email: nextEmail,
      fullName: nextFullName,
    });

    if (nextUsername && nextUsername !== target.username) {
      await this.deps.storage.updateActivitiesUsername(target.username, nextUsername);
    }

    await this.deps.storage.createAuditLog({
      action: "ACCOUNT_UPDATED",
      performedBy: actor.username,
      targetUser: target.id,
      details: JSON.stringify({
        metadata: {
          username_changed: Boolean(nextUsername && nextUsername !== target.username),
          email_changed: nextEmail !== undefined,
          full_name_changed: nextFullName !== undefined,
        },
      }),
    });

    return updatedUser ?? target;
  }

  async updateManagedUserRole(
    authUser: AuthenticatedUser | undefined,
    targetUserId: string,
    nextRoleRaw: string,
  ) {
    const actor = await this.deps.requireSuperuser(authUser);
    const target = await this.deps.requireManageableTarget(targetUserId);
    const nextRole = normalizeManageableUserRole(nextRoleRaw, "user");

    if (nextRole === target.role) {
      return { user: target, closedSessionIds: [] };
    }

    const updatedUser = await this.deps.storage.updateUserAccount({
      userId: target.id,
      role: nextRole,
    });
    const closedSessionIds = await this.deps.invalidateUserSessions(target.username, "ROLE_CHANGED");

    await this.deps.storage.createAuditLog({
      action: "ROLE_CHANGED",
      performedBy: actor.username,
      targetUser: target.id,
      details: JSON.stringify({
        metadata: {
          previous_role: target.role,
          next_role: nextRole,
        },
      }),
    });

    return {
      user: updatedUser ?? target,
      closedSessionIds,
    };
  }

  async updateManagedUserStatus(
    authUser: AuthenticatedUser | undefined,
    targetUserId: string,
    input: UpdateManagedStatusInput,
  ) {
    const actor = await this.deps.requireSuperuser(authUser);
    const target = await this.deps.requireManageableTarget(targetUserId);
    const nextStatus = input.status !== undefined
      ? normalizeAccountStatus(input.status, normalizeAccountStatus(target.status, "active"))
      : undefined;
    const nextIsBanned = input.isBanned;

    if (
      normalizeAccountStatus(target.status, "active") === "pending_activation"
      && nextStatus === "active"
    ) {
      throw new AuthAccountError(
        409,
        "ACCOUNT_UNAVAILABLE",
        "Pending accounts must complete activation before becoming active.",
      );
    }

    const updatedUser = await this.deps.storage.updateUserAccount({
      userId: target.id,
      status: nextStatus,
      isBanned: nextIsBanned,
    });

    const shouldInvalidateSessions =
      (nextStatus !== undefined && nextStatus !== "active")
      || nextIsBanned === true;
    const closedSessionIds = shouldInvalidateSessions
      ? await this.deps.invalidateUserSessions(
        target.username,
        nextIsBanned ? "BANNED" : `STATUS_${String(nextStatus || target.status).toUpperCase()}`,
      )
      : [];

    if (nextStatus !== undefined && nextStatus !== target.status) {
      await this.deps.storage.createAuditLog({
        action: "ACCOUNT_STATUS_CHANGED",
        performedBy: actor.username,
        targetUser: target.id,
        details: JSON.stringify({
          metadata: {
            previous_status: target.status,
            next_status: nextStatus,
          },
        }),
      });
    }

    if (nextIsBanned !== undefined && Boolean(nextIsBanned) !== Boolean(target.isBanned)) {
      await this.deps.storage.createAuditLog({
        action: nextIsBanned ? "ACCOUNT_BANNED" : "ACCOUNT_UNBANNED",
        performedBy: actor.username,
        targetUser: target.id,
        details: "Account ban flag updated via account management.",
      });
    }

    return {
      user: updatedUser ?? target,
      closedSessionIds,
    };
  }

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
      activation: {
        deliveryMode: activation.delivery.deliveryMode,
        errorCode: activation.delivery.errorCode,
        errorMessage: activation.delivery.errorMessage,
        expiresAt: activation.delivery.expiresAt,
        previewUrl: activation.delivery.previewUrl,
        recipientEmail: activation.delivery.recipientEmail,
        sent: activation.delivery.sent,
      } satisfies ManagedAccountActivationDelivery,
    };
  }

  async listPendingPasswordResetRequests(
    authUser: AuthenticatedUser | undefined,
    query: Record<string, unknown> = {},
  ): Promise<{ requests: PendingPasswordResetRequestSummary[]; pagination: PaginatedListMeta }> {
    await this.deps.requireSuperuser(authUser);

    const hasQueryFilters =
      query.page !== undefined
      || query.pageSize !== undefined
      || query.search !== undefined
      || query.status !== undefined;

    if (!hasQueryFilters) {
      const requests = await this.deps.storage.listPendingPasswordResetRequests();
      return {
        requests,
        pagination: buildLocalPaginationMeta(requests.length),
      };
    }

    const { page, pageSize } = readPaginationMeta(query, {
      pageSize: 50,
      maxPageSize: 100,
    });
    const result = await this.deps.storage.listPendingPasswordResetRequestsPage({
      page,
      pageSize,
      search: readOptionalString(query.search),
      status: parseManageableStatusFilter(query.status),
    });

    return {
      requests: result.requests,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
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
        details: JSON.stringify({
          metadata: {
            reset_type: "email_link",
            delivery: "email",
            delivery_mode: delivery.deliveryMode,
            recipient_email: recipientEmail,
            expires_at: reset.expiresAt.toISOString(),
            mail_error_code: delivery.errorCode,
          },
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
    });
    const closedSessionIds = await this.deps.invalidateUserSessions(
      target.username,
      "PASSWORD_RESET_BY_SUPERUSER",
    );

    await this.deps.storage.createAuditLog({
      action: "PASSWORD_RESET_APPROVED",
      performedBy: actor.username,
      targetUser: target.id,
      details: JSON.stringify({
        metadata: {
          reset_type: "email_link",
          delivery: "email",
          delivery_mode: delivery.deliveryMode,
          recipient_email: recipientEmail,
          expires_at: reset.expiresAt.toISOString(),
          must_change_password: true,
        },
      }),
    });

    return {
      user: updatedUser ?? target,
      closedSessionIds,
      reset: delivery,
    };
  }
}
