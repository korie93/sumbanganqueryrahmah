import type { AuthenticatedUser } from "../auth/guards";
import { buildActivationUrl, buildPasswordResetUrl } from "../auth/activation-links";
import {
  buildCredentialAuditDetails,
  CREDENTIAL_EMAIL_REGEX,
  CREDENTIAL_USERNAME_REGEX,
  normalizeEmailInput,
  normalizeUsernameInput,
} from "../auth/credentials";
import {
  getAccountAccessBlockReason,
  isManageableUserRole,
  normalizeAccountStatus,
  normalizeManageableUserRole,
} from "../auth/account-lifecycle";
import {
  generateOneTimeToken,
  generateTemporaryPassword,
  hashOpaqueToken,
  hashPassword,
  verifyPassword,
} from "../auth/passwords";
import { buildAccountActivationEmail } from "../mail/account-activation-email";
import {
  clearDevMailOutbox as clearDevMailOutboxFiles,
  deleteDevMailPreview as deleteDevMailPreviewFile,
  isDevMailOutboxEnabled,
  listDevMailPreviews,
  readDevMailPreview,
  renderDevMailPreviewHtml,
} from "../mail/dev-mail-outbox";
import { buildPasswordResetEmail } from "../mail/password-reset-email";
import { sendMail } from "../mail/mailer";
import type {
  ManagedUserAccount,
  PendingPasswordResetRequestSummary,
  PostgresStorage,
} from "../storage-postgres";
import {
  assertConfirmedStrongPassword,
  assertStrongPasswordInput,
  assertUsableActivationTokenRecord,
  assertUsablePasswordResetTokenRecord,
  createActivationTokenPayload,
  createPasswordResetTokenPayload,
} from "./auth-account-token-utils";
import {
  type ActivationTokenValidationResult,
  type ManagedAccountActivationDelivery,
  type ManagedAccountPasswordResetDelivery,
  type PasswordResetTokenValidationResult,
  AuthAccountError,
} from "./auth-account-types";
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

type CreateManagedUserInput = {
  username: string;
  fullName?: string | null;
  email?: string | null;
  role: string;
};

type UpdateManagedUserInput = {
  username?: string;
  fullName?: string | null;
  email?: string | null;
};

type UpdateManagedStatusInput = {
  status?: string;
  isBanned?: boolean;
};

type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

type UpdateOwnCredentialsInput = {
  hasUsernameField: boolean;
  hasPasswordField: boolean;
  newUsername?: string;
  currentPassword: string;
  newPassword: string;
};

type AuthAccountUser = NonNullable<Awaited<ReturnType<PostgresStorage["getUser"]>>>;

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
  | "listPendingPasswordResetRequests"
  | "resolvePendingPasswordResetRequestsForUser"
  | "touchLastLogin"
  | "updateActivitiesUsername"
  | "updateUserAccount"
  | "updateUserCredentials"
>;

export class AuthAccountService {
  constructor(private readonly storage: AuthAccountStorage) {}

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

  private async updateOwnPassword(actor: AuthAccountUser, input: ChangePasswordInput) {
    const currentPassword = String(input.currentPassword || "");
    const newPassword = String(input.newPassword || "");

    if (!currentPassword) {
      throw new AuthAccountError(400, "INVALID_CURRENT_PASSWORD", "Current password is required.");
    }

    const currentPasswordMatch = await verifyPassword(currentPassword, actor.passwordHash);
    if (!currentPasswordMatch) {
      throw new AuthAccountError(400, "INVALID_CURRENT_PASSWORD", "Current password is invalid.");
    }

    assertStrongPasswordInput(newPassword);

    const sameAsCurrent = await verifyPassword(newPassword, actor.passwordHash);
    if (sameAsCurrent) {
      throw new AuthAccountError(
        400,
        "INVALID_PASSWORD",
        "New password must be different from current password.",
      );
    }

    const nextPasswordHash = await hashPassword(newPassword);
    const updatedUser = await this.storage.updateUserCredentials({
      userId: actor.id,
      newPasswordHash: nextPasswordHash,
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      passwordResetBySuperuser: false,
    });

    const closedSessionIds = await this.invalidateUserSessions(actor.username, "PASSWORD_CHANGED");

    await this.storage.createAuditLog({
      action: "USER_PASSWORD_CHANGED",
      performedBy: actor.id,
      targetUser: actor.id,
      details: buildCredentialAuditDetails({
        actor_user_id: actor.id,
        target_user_id: actor.id,
        changedField: "password",
      }),
    });

    return {
      user: updatedUser ?? actor,
      closedSessionIds,
    };
  }

  private async updateOwnUsername(actor: AuthAccountUser, newUsernameRaw: string) {
    const newUsername = normalizeUsernameInput(newUsernameRaw);
    const previousUsername = actor.username;

    this.validateUsername(newUsername);
    await this.ensureUniqueIdentity({ username: newUsername, ignoreUserId: actor.id });

    if (newUsername === previousUsername) {
      return actor;
    }

    const updatedUser = await this.storage.updateUserCredentials({
      userId: actor.id,
      newUsername,
    });

    await this.storage.updateActivitiesUsername(previousUsername, newUsername);
    await this.storage.createAuditLog({
      action: "USER_USERNAME_CHANGED",
      performedBy: actor.id,
      targetUser: actor.id,
      details: buildCredentialAuditDetails({
        actor_user_id: actor.id,
        target_user_id: actor.id,
        changedField: "username",
      }),
    });

    return updatedUser ?? actor;
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
    const actor = await this.requireActor(authUser);
    return this.updateOwnPassword(actor, input);
  }

  async changeOwnUsername(authUser: AuthenticatedUser | undefined, newUsernameRaw: string) {
    const actor = await this.requireActor(authUser);
    return this.updateOwnUsername(actor, newUsernameRaw);
  }

  async getCurrentUser(authUser: AuthenticatedUser | undefined) {
    return this.requireActor(authUser);
  }

  async updateOwnCredentials(
    authUser: AuthenticatedUser | undefined,
    input: UpdateOwnCredentialsInput,
  ) {
    const actor = await this.requireActor(authUser);

    if (!input.hasUsernameField && !input.hasPasswordField) {
      return {
        user: actor,
        forceLogout: false,
        closedSessionIds: [] as string[],
      };
    }

    if (actor.mustChangePassword && !input.hasPasswordField) {
      throw new AuthAccountError(
        403,
        "PASSWORD_CHANGE_REQUIRED",
        "Password change is required before other account updates.",
      );
    }

    let updatedUser: AuthAccountUser = actor;
    let forceLogout = false;
    let closedSessionIds: string[] = [];

    if (input.hasUsernameField) {
      updatedUser = await this.updateOwnUsername(updatedUser, input.newUsername ?? "");
    }

    if (input.hasPasswordField) {
      const passwordResult = await this.updateOwnPassword(updatedUser, {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });
      updatedUser = passwordResult.user;
      forceLogout = true;
      closedSessionIds = passwordResult.closedSessionIds;
    }

    return {
      user: updatedUser,
      forceLogout,
      closedSessionIds,
    };
  }

  async getManagedUsers(authUser: AuthenticatedUser | undefined): Promise<ManagedUserAccount[]> {
    await this.requireSuperuser(authUser);
    return this.storage.getManagedUsers();
  }

  async getAccounts(authUser: AuthenticatedUser | undefined) {
    await this.requireSuperuser(authUser);
    return this.storage.getAccounts();
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

  async listDevMailOutbox(authUser: AuthenticatedUser | undefined) {
    await this.requireSuperuser(authUser);
    return {
      enabled: isDevMailOutboxEnabled(),
      previews: await listDevMailPreviews(25),
    };
  }

  async deleteDevMailPreview(authUser: AuthenticatedUser | undefined, previewId: string) {
    const actor = await this.requireSuperuser(authUser);
    const deleted = await deleteDevMailPreviewFile(previewId);

    if (!deleted) {
      throw new AuthAccountError(404, "MAIL_PREVIEW_NOT_FOUND", "Mail preview not found.");
    }

    await this.storage.createAuditLog({
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
    const actor = await this.requireSuperuser(authUser);
    const deletedCount = await clearDevMailOutboxFiles();

    await this.storage.createAuditLog({
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
    const actor = await this.requireSuperuser(authUser);
    const target = await this.requireManageableTarget(targetUserId);

    if (actor.id === target.id) {
      throw new AuthAccountError(
        403,
        "PERMISSION_DENIED",
        "Superuser cannot delete the current account from this action.",
      );
    }

    const closedSessionIds = await this.invalidateUserSessions(target.username, "ACCOUNT_DELETED");
    const deleted = await this.storage.deleteManagedUserAccount(target.id);

    if (!deleted) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
    }

    await this.storage.createAuditLog({
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
    const actor = await this.requireSuperuser(authUser);
    const username = normalizeUsernameInput(input.username);
    const email = normalizeEmailInput(input.email);
    const fullName = String(input.fullName || "").trim() || null;
    const role = normalizeManageableUserRole(input.role, "user");

    this.validateUsername(username);
    const requiredEmail = this.requireManagedEmail(
      email || null,
      "Email is required to create a managed account.",
    );
    await this.ensureUniqueIdentity({ username, email: requiredEmail });

    const placeholderPasswordHash = await hashPassword(generateTemporaryPassword());
    const user = await this.storage.createManagedUserAccount({
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

    const activation = await this.sendActivationEmail({
      actorUsername: actor.username,
      user,
    });

    await this.storage.createAuditLog({
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
    const actor = await this.requireSuperuser(authUser);
    const target = await this.requireManageableTarget(targetUserId);
    const nextUsername = input.username !== undefined ? normalizeUsernameInput(input.username) : undefined;
    const nextEmail = input.email !== undefined ? normalizeEmailInput(input.email) : undefined;
    const nextFullName = input.fullName !== undefined ? String(input.fullName || "").trim() || null : undefined;

    if (nextUsername !== undefined) {
      this.validateUsername(nextUsername);
    }
    this.validateEmail(nextEmail || null);
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
    await this.ensureUniqueIdentity({
      username: nextUsername,
      email: nextEmail,
      ignoreUserId: target.id,
    });

    const updatedUser = await this.storage.updateUserAccount({
      userId: target.id,
      username: nextUsername,
      email: nextEmail,
      fullName: nextFullName,
    });

    if (nextUsername && nextUsername !== target.username) {
      await this.storage.updateActivitiesUsername(target.username, nextUsername);
    }

    await this.storage.createAuditLog({
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
    const actor = await this.requireSuperuser(authUser);
    const target = await this.requireManageableTarget(targetUserId);
    const nextRole = normalizeManageableUserRole(nextRoleRaw, "user");

    if (nextRole === target.role) {
      return { user: target, closedSessionIds: [] };
    }

    const updatedUser = await this.storage.updateUserAccount({
      userId: target.id,
      role: nextRole,
    });
    const closedSessionIds = await this.invalidateUserSessions(target.username, "ROLE_CHANGED");

    await this.storage.createAuditLog({
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
    const actor = await this.requireSuperuser(authUser);
    const target = await this.requireManageableTarget(targetUserId);
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

    const updatedUser = await this.storage.updateUserAccount({
      userId: target.id,
      status: nextStatus,
      isBanned: nextIsBanned,
    });

    const shouldInvalidateSessions =
      (nextStatus !== undefined && nextStatus !== "active")
      || nextIsBanned === true;
    const closedSessionIds = shouldInvalidateSessions
      ? await this.invalidateUserSessions(
        target.username,
        nextIsBanned ? "BANNED" : `STATUS_${String(nextStatus || target.status).toUpperCase()}`,
      )
      : [];

    if (nextStatus !== undefined && nextStatus !== target.status) {
      await this.storage.createAuditLog({
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
      await this.storage.createAuditLog({
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
    const actor = await this.requireSuperuser(authUser);
    const target = await this.requireManageableTarget(targetUserId);

    if (normalizeAccountStatus(target.status, "active") !== "pending_activation") {
      throw new AuthAccountError(
        409,
        "ACCOUNT_UNAVAILABLE",
        "Activation can only be resent for pending accounts.",
      );
    }

    const activation = await this.sendActivationEmail({
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
  ): Promise<PendingPasswordResetRequestSummary[]> {
    await this.requireSuperuser(authUser);
    return this.storage.listPendingPasswordResetRequests();
  }

  async resetManagedUserPassword(authUser: AuthenticatedUser | undefined, targetUserId: string) {
    const actor = await this.requireSuperuser(authUser);
    const target = await this.requireManageableTarget(targetUserId);

    if (normalizeAccountStatus(target.status, "active") === "pending_activation") {
      throw new AuthAccountError(
        409,
        "ACCOUNT_UNAVAILABLE",
        "Pending accounts must complete activation instead of password reset.",
      );
    }

    const recipientEmail = this.requireManagedEmail(
      target.email,
      "Email is required to send password reset.",
    );
    const now = new Date();
    await this.storage.invalidateUnusedPasswordResetTokens(target.id, now);
    const reset = createPasswordResetTokenPayload();
    const resetUrl = buildPasswordResetUrl(reset.token);
    const resetRequest = await this.storage.createPasswordResetRequest({
      userId: target.id,
      requestedByUser: null,
      approvedBy: actor.username,
      resetType: "email_link",
      tokenHash: reset.tokenHash,
      expiresAt: reset.expiresAt,
      usedAt: null,
    });
    const delivery = await this.sendPasswordResetEmail({
      expiresAt: reset.expiresAt,
      resetUrl,
      user: target,
    });

    if (!delivery.sent) {
      await this.storage.consumePasswordResetRequestById({
        requestId: resetRequest.id,
        now,
      });
      await this.storage.createAuditLog({
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

    await this.storage.resolvePendingPasswordResetRequestsForUser({
      userId: target.id,
      approvedBy: actor.username,
      resetType: "email_link",
      usedAt: now,
    });

    const placeholderPasswordHash = await hashPassword(generateOneTimeToken());
    const updatedUser = await this.storage.updateUserAccount({
      userId: target.id,
      passwordHash: placeholderPasswordHash,
      passwordChangedAt: now,
      mustChangePassword: true,
      passwordResetBySuperuser: true,
      activatedAt: target.activatedAt ?? now,
    });
    const closedSessionIds = await this.invalidateUserSessions(target.username, "PASSWORD_RESET_BY_SUPERUSER");

    await this.storage.createAuditLog({
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
