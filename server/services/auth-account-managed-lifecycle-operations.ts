import type { AuthenticatedUser } from "../auth/guards";
import {
  normalizeAccountStatus,
  normalizeManageableUserRole,
} from "../auth/account-lifecycle";
import {
  normalizeEmailInput,
  normalizeUsernameInput,
} from "../auth/credentials";
import {
  generateTemporaryPassword,
  hashPassword,
} from "../auth/passwords";
import type { PaginatedListMeta } from "./auth-account-pagination-utils";
import { listManagedUsersPageOrAll } from "./auth-account-managed-list-utils";
import { AuthAccountError } from "./auth-account-types";
import {
  buildAccountCreatedAuditDetails,
  buildAccountDeletedAuditDetails,
  buildAccountStatusChangedAuditDetails,
  buildAccountUpdatedAuditDetails,
  buildManagedActivationDeliveryResponse,
  buildRoleChangedAuditDetails,
} from "./auth-account-managed-utils";
import type {
  AuthAccountManagedOpsDeps,
  CreateManagedUserInput,
  UpdateManagedStatusInput,
  UpdateManagedUserInput,
} from "./auth-account-managed-shared";

export class AuthAccountManagedLifecycleOperations {
  constructor(private readonly deps: AuthAccountManagedOpsDeps) {}

  async getManagedUsers(
    authUser: AuthenticatedUser | undefined,
    query: Record<string, unknown> = {},
  ): Promise<{ users: Awaited<ReturnType<typeof listManagedUsersPageOrAll>>["users"]; pagination: PaginatedListMeta }> {
    await this.deps.requireSuperuser(authUser);
    return listManagedUsersPageOrAll(this.deps.storage, query);
  }

  async getAccounts(authUser: AuthenticatedUser | undefined) {
    await this.deps.requireSuperuser(authUser);
    return this.deps.storage.getAccounts();
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

    const closedSessionIds = await this.deps.invalidateUserSessions(
      target.username,
      "ACCOUNT_DELETED",
    );
    const deleted = await this.deps.storage.deleteManagedUserAccount(target.id);

    if (!deleted) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
    }

    await this.deps.storage.createAuditLog({
      action: "ACCOUNT_DELETED",
      performedBy: actor.username,
      targetUser: target.id,
      details: buildAccountDeletedAuditDetails({ target }),
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
      details: buildAccountCreatedAuditDetails({
        actorUsername: actor.username,
        user,
      }),
    });

    return {
      user,
      activation: buildManagedActivationDeliveryResponse(activation.delivery),
    };
  }

  async updateManagedUser(
    authUser: AuthenticatedUser | undefined,
    targetUserId: string,
    input: UpdateManagedUserInput,
  ) {
    const actor = await this.deps.requireSuperuser(authUser);
    const target = await this.deps.requireManageableTarget(targetUserId);
    const nextUsername =
      input.username !== undefined ? normalizeUsernameInput(input.username) : undefined;
    const nextEmail = input.email !== undefined ? normalizeEmailInput(input.email) : undefined;
    const nextFullName =
      input.fullName !== undefined ? String(input.fullName || "").trim() || null : undefined;

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
      details: buildAccountUpdatedAuditDetails({
        usernameChanged: Boolean(nextUsername && nextUsername !== target.username),
        emailChanged: nextEmail !== undefined,
        fullNameChanged: nextFullName !== undefined,
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
    const closedSessionIds = await this.deps.invalidateUserSessions(
      target.username,
      "ROLE_CHANGED",
    );

    await this.deps.storage.createAuditLog({
      action: "ROLE_CHANGED",
      performedBy: actor.username,
      targetUser: target.id,
      details: buildRoleChangedAuditDetails({
        previousRole: target.role,
        nextRole,
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
    const nextStatus =
      input.status !== undefined
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
        nextIsBanned
          ? "BANNED"
          : `STATUS_${String(nextStatus || target.status).toUpperCase()}`,
      )
      : [];

    if (nextStatus !== undefined && nextStatus !== target.status) {
      await this.deps.storage.createAuditLog({
        action: "ACCOUNT_STATUS_CHANGED",
        performedBy: actor.username,
        targetUser: target.id,
        details: buildAccountStatusChangedAuditDetails({
          previousStatus: target.status,
          nextStatus,
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
}
