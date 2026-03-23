import type { AuthenticatedUser } from "../auth/guards";
import { buildActivationUrl } from "../auth/activation-links";
import {
  CREDENTIAL_EMAIL_REGEX,
  CREDENTIAL_USERNAME_REGEX,
  normalizeEmailInput,
  normalizeUsernameInput,
} from "../auth/credentials";
import {
  getAccountAccessBlockReason,
  isManageableUserRole,
  normalizeAccountStatus,
} from "../auth/account-lifecycle";
import {
  hashOpaqueToken,
  hashPassword,
  verifyPassword,
} from "../auth/passwords";
import { buildAccountActivationEmail } from "../mail/account-activation-email";
import { buildPasswordResetEmail } from "../mail/password-reset-email";
import { sendMail } from "../mail/mailer";
import type {
  PostgresStorage,
} from "../storage-postgres";
import {
  assertConfirmedStrongPassword,
  assertUsableActivationTokenRecord,
  assertUsablePasswordResetTokenRecord,
  createActivationTokenPayload,
} from "./auth-account-token-utils";
import {
  type ActivationTokenValidationResult,
  type ManagedAccountActivationDelivery,
  type ManagedAccountPasswordResetDelivery,
  type PasswordResetTokenValidationResult,
  AuthAccountError,
} from "./auth-account-types";
import {
  AuthAccountManagedOperations,
  type CreateManagedUserInput,
  type UpdateManagedStatusInput,
  type UpdateManagedUserInput,
} from "./auth-account-managed-operations";
import {
  AuthAccountSelfOperations,
  type ChangePasswordInput,
  type UpdateOwnCredentialsInput,
} from "./auth-account-self-operations";
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
  | "resolvePendingPasswordResetRequestsForUser"
  | "touchLastLogin"
  | "updateActivitiesUsername"
  | "updateUserAccount"
  | "updateUserCredentials"
>;

export class AuthAccountService {
  private readonly managedOperations: AuthAccountManagedOperations;
  private readonly selfOperations: AuthAccountSelfOperations;

  constructor(private readonly storage: AuthAccountStorage) {
    this.managedOperations = new AuthAccountManagedOperations({
      storage: this.storage,
      ensureUniqueIdentity: this.ensureUniqueIdentity.bind(this),
      invalidateUserSessions: this.invalidateUserSessions.bind(this),
      requireManageableTarget: this.requireManageableTarget.bind(this),
      requireManagedEmail: this.requireManagedEmail.bind(this),
      requireSuperuser: this.requireSuperuser.bind(this),
      sendActivationEmail: this.sendActivationEmail.bind(this),
      sendPasswordResetEmail: this.sendPasswordResetEmail.bind(this),
      validateEmail: this.validateEmail.bind(this),
      validateUsername: this.validateUsername.bind(this),
    });
    this.selfOperations = new AuthAccountSelfOperations({
      storage: this.storage,
      ensureUniqueIdentity: this.ensureUniqueIdentity.bind(this),
      requireActor: this.requireActor.bind(this),
      validateUsername: this.validateUsername.bind(this),
    });
  }

  private async getSuperuserSessionIdleWindowMs(): Promise<number> {
    const fallbackMinutes = 30;
    try {
      const runtime = await (this.storage as any).getAppConfig?.();
      const configuredMinutes = Number(runtime?.sessionTimeoutMinutes);
      const safeMinutes = Number.isFinite(configuredMinutes)
        ? Math.min(1440, Math.max(1, Math.floor(configuredMinutes)))
        : fallbackMinutes;
      return safeMinutes * 60 * 1000;
    } catch {
      return fallbackMinutes * 60 * 1000;
    }
  }

  private isRecentActivitySession(
    activity: { lastActivityTime?: Date | string | null; loginTime?: Date | string | null },
    nowMs: number,
    idleWindowMs: number,
  ): boolean {
    const timestampSource = activity.lastActivityTime ?? activity.loginTime ?? null;
    if (!timestampSource) {
      return true;
    }
    const activityMs = new Date(timestampSource).getTime();
    if (!Number.isFinite(activityMs)) {
      return true;
    }
    return nowMs - activityMs <= idleWindowMs;
  }

  private requireManagedEmail(email: string | null, message: string) {
    const normalizedEmail = normalizeEmailInput(email);
    if (!normalizedEmail) {
      throw new AuthAccountError(400, "INVALID_EMAIL", message);
    }

    this.validateEmail(normalizedEmail);
    return normalizedEmail;
  }

  private async requireActor(authUser: AuthenticatedUser | undefined) {
    if (!authUser) {
      throw new AuthAccountError(401, "PERMISSION_DENIED", "Authentication required.");
    }

    const actor = authUser.userId
      ? await this.storage.getUser(authUser.userId)
      : await this.storage.getUserByUsername(authUser.username);

    if (!actor) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "User not found.");
    }

    return actor;
  }

  private async requireSuperuser(authUser: AuthenticatedUser | undefined) {
    const actor = await this.requireActor(authUser);
    if (actor.role !== "superuser") {
      throw new AuthAccountError(403, "PERMISSION_DENIED", "Only superuser can access this resource.");
    }
    return actor;
  }

  private async requireManageableTarget(userId: string) {
    const normalizedId = String(userId || "").trim();
    if (!normalizedId) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
    }

    const target = await this.storage.getUser(normalizedId);
    if (!target) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
    }

    if (!isManageableUserRole(target.role)) {
      throw new AuthAccountError(403, "PERMISSION_DENIED", "Target role is not allowed.");
    }

    return target;
  }

  private validateUsername(username: string) {
    if (!CREDENTIAL_USERNAME_REGEX.test(username)) {
      throw new AuthAccountError(
        400,
        "USERNAME_TAKEN",
        "Username must match ^[a-zA-Z0-9._-]{3,32}$.",
      );
    }
  }

  private validateEmail(email: string | null) {
    if (!email) return;
    if (!CREDENTIAL_EMAIL_REGEX.test(email)) {
      throw new AuthAccountError(400, "INVALID_EMAIL", "Email address is invalid.");
    }
  }

  private async ensureUniqueIdentity(params: {
    username?: string;
    email?: string | null;
    ignoreUserId?: string;
  }) {
    if (params.username) {
      const existingByUsername = await this.storage.getUserByUsername(params.username);
      if (existingByUsername && existingByUsername.id !== params.ignoreUserId) {
        throw new AuthAccountError(409, "USERNAME_TAKEN", "Username already exists.");
      }
    }

    if (params.email) {
      const existingByEmail = await this.storage.getUserByEmail(params.email);
      if (existingByEmail && existingByEmail.id !== params.ignoreUserId) {
        throw new AuthAccountError(409, "INVALID_EMAIL", "Email already exists.");
      }
    }
  }

  private async issueActivationToken(params: {
    userId: string;
    createdBy: string;
  }) {
    const activation = createActivationTokenPayload();

    await this.storage.invalidateUnusedActivationTokens(params.userId);
    await this.storage.createActivationToken({
      userId: params.userId,
      tokenHash: activation.tokenHash,
      expiresAt: activation.expiresAt,
      createdBy: params.createdBy,
    });

    return activation;
  }

  private async sendActivationEmail(params: {
    actorUsername: string;
    user: Awaited<ReturnType<PostgresStorage["getUser"]>>;
    resent?: boolean;
  }) {
    if (!params.user) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
    }

    if (normalizeAccountStatus(params.user.status, "pending_activation") !== "pending_activation") {
      throw new AuthAccountError(
        409,
        "ACCOUNT_UNAVAILABLE",
        "Activation can only be sent to pending accounts.",
      );
    }

    if (params.user.isBanned) {
      throw new AuthAccountError(
        409,
        "ACCOUNT_UNAVAILABLE",
        "Activation can only be sent to non-banned accounts.",
      );
    }

    const recipientEmail = this.requireManagedEmail(
      params.user.email,
      "Email is required to send account activation.",
    );
    const activation = await this.issueActivationToken({
      userId: params.user.id,
      createdBy: params.actorUsername,
    });
    const activationUrl = buildActivationUrl(activation.token);
    const email = buildAccountActivationEmail({
      activationUrl,
      expiresAt: activation.expiresAt,
      username: params.user.username,
    });
    const mailResult = await sendMail({
      to: recipientEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    await this.storage.createAuditLog({
      action: mailResult.sent ? "ACCOUNT_ACTIVATION_SENT" : "ACCOUNT_ACTIVATION_SEND_FAILED",
      performedBy: params.actorUsername,
      targetUser: params.user.id,
      details: JSON.stringify({
        metadata: {
          delivery: "email",
          delivery_mode: mailResult.deliveryMode,
          resent: params.resent === true,
          expires_at: activation.expiresAt.toISOString(),
          recipient_email: recipientEmail,
          mail_error_code: mailResult.errorCode,
        },
      }),
    });

    return {
      activation,
      delivery: {
        deliveryMode: mailResult.deliveryMode,
        errorCode: mailResult.errorCode,
        errorMessage: mailResult.errorMessage,
        expiresAt: activation.expiresAt,
        previewUrl: mailResult.previewUrl,
        recipientEmail,
        sent: mailResult.sent,
      } satisfies ManagedAccountActivationDelivery,
    };
  }

  private async sendPasswordResetEmail(params: {
    expiresAt: Date;
    resetUrl: string;
    user: Awaited<ReturnType<PostgresStorage["getUser"]>>;
  }): Promise<ManagedAccountPasswordResetDelivery> {
    if (!params.user) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
    }

    const recipientEmail = this.requireManagedEmail(
      params.user.email,
      "Email is required to send password reset.",
    );
    const email = buildPasswordResetEmail({
      resetUrl: params.resetUrl,
      expiresAt: params.expiresAt,
      username: params.user.username,
    });
    const mailResult = await sendMail({
      to: recipientEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    return {
      deliveryMode: mailResult.deliveryMode,
      errorCode: mailResult.errorCode,
      errorMessage: mailResult.errorMessage,
      expiresAt: params.expiresAt,
      previewUrl: mailResult.previewUrl,
      recipientEmail,
      sent: mailResult.sent,
    };
  }

  private async invalidateUserSessions(username: string, reason: string) {
    const activeSessions = await this.storage.getActiveActivitiesByUsername(username);
    await this.storage.deactivateUserActivities(username, reason);
    return activeSessions.map((activity) => activity.id);
  }

  async login(input: LoginInput) {
    const username = normalizeUsernameInput(input.username);
    const password = String(input.password ?? "");
    const user = await this.storage.getUserByUsername(username);

    if (!user) {
      await this.storage.createAuditLog({
        action: "LOGIN_FAILED",
        performedBy: username || "unknown",
        details: "User not found",
      });
      throw new AuthAccountError(401, "INVALID_CREDENTIALS", "Invalid credentials");
    }

    const visitorBanned = await this.storage.isVisitorBanned(
      input.fingerprint ?? null,
      input.ipAddress ?? null,
      user.username,
    );

    if (visitorBanned || user.isBanned) {
      await this.storage.createAuditLog({
        action: "LOGIN_FAILED_BANNED",
        performedBy: user.username,
        details: visitorBanned ? "Visitor is banned" : "User is banned",
      });
      throw new AuthAccountError(403, "ACCOUNT_BANNED", "Account is banned", {
        banned: true,
      });
    }

    const blockReason = getAccountAccessBlockReason(user);
    if (blockReason && blockReason !== "banned") {
      await this.storage.createAuditLog({
        action: "LOGIN_FAILED_ACCOUNT_STATE",
        performedBy: user.username,
        targetUser: user.id,
        details: `Login blocked due to account state: ${blockReason}`,
      });
      throw new AuthAccountError(401, "INVALID_CREDENTIALS", "Invalid credentials");
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      await this.storage.createAuditLog({
        action: "LOGIN_FAILED",
        performedBy: user.username,
        details: "Invalid password",
      });
      throw new AuthAccountError(401, "INVALID_CREDENTIALS", "Invalid credentials");
    }

    if (user.role === "superuser") {
      const enforceSingleSession = await this.storage.getBooleanSystemSetting(
        "enforce_superuser_single_session",
        false,
      );

      if (enforceSingleSession) {
        const activeSessions = await this.storage.getActiveActivitiesByUsername(user.username);
        if (activeSessions.length > 0) {
          const nowMs = Date.now();
          const idleWindowMs = await this.getSuperuserSessionIdleWindowMs();
          const freshSessions = activeSessions.filter((session) =>
            this.isRecentActivitySession(session, nowMs, idleWindowMs),
          );

          if (freshSessions.length === 0) {
            await this.storage.deactivateUserActivities(user.username, "IDLE_TIMEOUT");
            await this.storage.createAuditLog({
              action: "LOGIN_STALE_SESSION_RECOVERED",
              performedBy: user.username,
              targetUser: user.id,
              details: `Recovered stale superuser sessions before login. Sessions cleared: ${activeSessions.length}`,
            });
          } else {
            await this.storage.createAuditLog({
              action: "LOGIN_BLOCKED_SINGLE_SESSION",
              performedBy: user.username,
              details: `Superuser single-session policy blocked login. Active sessions: ${freshSessions.length}`,
            });
            throw new AuthAccountError(
              409,
              "SUPERUSER_SINGLE_SESSION_ENFORCED",
              "Single superuser session is enforced. Logout from the current session first.",
            );
          }
        }
      }
    } else if (user.role === "admin" && input.fingerprint) {
      await this.storage.deactivateUserSessionsByFingerprint(user.username, input.fingerprint);
    }

    const activity = await this.storage.createActivity({
      userId: user.id,
      username: user.username,
      role: user.role,
      pcName: input.pcName ?? null,
      browser: input.browserName,
      fingerprint: input.fingerprint ?? null,
      ipAddress: input.ipAddress ?? null,
    });

    await this.storage.touchLastLogin(user.id, new Date());
    await this.storage.createAuditLog({
      action: "LOGIN_SUCCESS",
      performedBy: user.username,
      targetUser: user.id,
      details: `Login from ${input.browserName}`,
    });

    return {
      user,
      activity,
    };
  }

  async validateActivationToken(rawTokenInput: string): Promise<ActivationTokenValidationResult> {
    const rawToken = String(rawTokenInput || "").trim();
    if (!rawToken) {
      throw new AuthAccountError(400, "INVALID_TOKEN", "Activation token is invalid.");
    }

    const tokenHash = hashOpaqueToken(rawToken);
    const now = new Date();
    const record = assertUsableActivationTokenRecord(
      await this.storage.getActivationTokenRecordByHash(tokenHash),
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
    username?: string;
    token: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    const rawToken = String(params.token || "").trim();
    const newPassword = String(params.newPassword || "");
    const confirmPassword = String(params.confirmPassword || "");

    if (!rawToken) {
      throw new AuthAccountError(400, "INVALID_TOKEN", "Activation token is invalid.");
    }

    assertConfirmedStrongPassword(newPassword, confirmPassword);

    const tokenHash = hashOpaqueToken(rawToken);
    const now = new Date();
    const record = assertUsableActivationTokenRecord(
      await this.storage.getActivationTokenRecordByHash(tokenHash),
      now,
    );
    const requestedUsername = normalizeUsernameInput(params.username);
    if (requestedUsername && requestedUsername !== record.username) {
      throw new AuthAccountError(400, "INVALID_TOKEN", "Activation token is invalid.");
    }

    const consumed = await this.storage.consumeActivationTokenById({
      tokenId: record.tokenId,
      now,
    });
    if (!consumed) {
      const latest = await this.storage.getActivationTokenRecordByHash(tokenHash);
      assertUsableActivationTokenRecord(latest, now);
      throw new AuthAccountError(400, "INVALID_TOKEN", "Activation token is invalid.");
    }

    const target = await this.storage.getUser(record.userId);
    if (!target) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
    }
    if (
      target.isBanned
      || normalizeAccountStatus(target.status, "pending_activation") !== "pending_activation"
    ) {
      throw new AuthAccountError(
        409,
        "ACCOUNT_UNAVAILABLE",
        "Account activation is no longer available.",
      );
    }

    const passwordHash = await hashPassword(newPassword);
    const updatedUser = await this.storage.updateUserAccount({
      userId: target.id,
      passwordHash,
      passwordChangedAt: now,
      activatedAt: now,
      status: "active",
      mustChangePassword: false,
      passwordResetBySuperuser: false,
    });

    await this.storage.invalidateUnusedActivationTokens(target.id);
    await this.storage.createAuditLog({
      action: "ACCOUNT_ACTIVATION_COMPLETED",
      performedBy: target.username,
      targetUser: target.id,
      details: "Account activation completed.",
    });

    return updatedUser ?? target;
  }

  async requestPasswordReset(identifier: string) {
    const normalized = String(identifier || "").trim().toLowerCase();
    if (!normalized) {
      throw new AuthAccountError(400, "INVALID_IDENTIFIER", "Username or email is required.");
    }

    const user = CREDENTIAL_EMAIL_REGEX.test(normalized)
      ? await this.storage.getUserByEmail(normalized)
      : await this.storage.getUserByUsername(normalized) || await this.storage.getUserByEmail(normalized);

    if (!user || user.role === "superuser") {
      return { accepted: true };
    }

    await this.storage.createPasswordResetRequest({
      userId: user.id,
      requestedByUser: normalized,
    });

    await this.storage.createAuditLog({
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
      throw new AuthAccountError(400, "INVALID_TOKEN", "Password reset token is invalid.");
    }

    const tokenHash = hashOpaqueToken(rawToken);
    const now = new Date();
    const record = assertUsablePasswordResetTokenRecord(
      await this.storage.getPasswordResetTokenRecordByHash(tokenHash),
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
      throw new AuthAccountError(400, "INVALID_TOKEN", "Password reset token is invalid.");
    }

    assertConfirmedStrongPassword(newPassword, confirmPassword);

    const tokenHash = hashOpaqueToken(rawToken);
    const now = new Date();
    const record = assertUsablePasswordResetTokenRecord(
      await this.storage.getPasswordResetTokenRecordByHash(tokenHash),
      now,
    );
    const consumed = await this.storage.consumePasswordResetRequestById({
      requestId: record.requestId,
      now,
    });

    if (!consumed) {
      const latest = await this.storage.getPasswordResetTokenRecordByHash(tokenHash);
      assertUsablePasswordResetTokenRecord(latest, now);
      throw new AuthAccountError(400, "INVALID_TOKEN", "Password reset token is invalid.");
    }

    const target = await this.storage.getUser(record.userId);
    if (!target) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
    }

    if (!isManageableUserRole(target.role)) {
      throw new AuthAccountError(
        409,
        "ACCOUNT_UNAVAILABLE",
        "Password reset is not available for this account.",
      );
    }

    if (normalizeAccountStatus(target.status, "active") === "pending_activation") {
      throw new AuthAccountError(
        409,
        "ACCOUNT_UNAVAILABLE",
        "Pending accounts must complete activation before password reset.",
      );
    }

    const passwordHash = await hashPassword(newPassword);
    const updatedUser = await this.storage.updateUserAccount({
      userId: target.id,
      passwordHash,
      passwordChangedAt: now,
      mustChangePassword: false,
      passwordResetBySuperuser: false,
      activatedAt: target.activatedAt ?? now,
    });

    await this.storage.invalidateUnusedPasswordResetTokens(target.id, now);
    await this.invalidateUserSessions(target.username, "PASSWORD_RESET_COMPLETED");
    await this.storage.createAuditLog({
      action: "PASSWORD_RESET_COMPLETED",
      performedBy: target.username,
      targetUser: target.id,
      details: JSON.stringify({
        metadata: {
          reset_type: "email_link",
        },
      }),
    });

    return updatedUser ?? target;
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
    return this.managedOperations.getDevMailPreviewHtml(previewId);
  }

  async listDevMailOutbox(
    authUser: AuthenticatedUser | undefined,
    query: Record<string, unknown> = {},
  ) {
    return this.managedOperations.listDevMailOutbox(authUser, query);
  }

  async deleteDevMailPreview(authUser: AuthenticatedUser | undefined, previewId: string) {
    return this.managedOperations.deleteDevMailPreview(authUser, previewId);
  }

  async clearDevMailOutbox(authUser: AuthenticatedUser | undefined) {
    return this.managedOperations.clearDevMailOutbox(authUser);
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
