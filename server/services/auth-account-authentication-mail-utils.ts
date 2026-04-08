import { buildActivationUrl } from "../auth/activation-links";
import { buildAccountActivationEmail } from "../mail/account-activation-email";
import { buildPasswordResetEmail } from "../mail/password-reset-email";
import { sendMail } from "../mail/mailer";
import type { PostgresStorage } from "../storage-postgres";
import { createActivationTokenPayload } from "./auth-account-token-utils";
import {
  type ManagedAccountActivationDelivery,
  type ManagedAccountPasswordResetDelivery,
  AuthAccountError,
} from "./auth-account-types";
import type { AuthAccountAuthenticationStorage } from "./auth-account-authentication-shared";

export async function issueActivationToken(
  storage: Pick<
    AuthAccountAuthenticationStorage,
    "createActivationToken" | "invalidateUnusedActivationTokens"
  >,
  params: {
    createdBy: string;
    userId: string;
  },
) {
  const activation = createActivationTokenPayload();

  await storage.invalidateUnusedActivationTokens(params.userId);
  await storage.createActivationToken({
    userId: params.userId,
    tokenHash: activation.tokenHash,
    expiresAt: activation.expiresAt,
    createdBy: params.createdBy,
  });

  return activation;
}

export async function sendActivationEmailOperation(params: {
  actorUsername: string;
  requireManagedEmail: (email: string | null, message: string) => string;
  resent?: boolean | undefined;
  storage: Pick<
    AuthAccountAuthenticationStorage,
    "createActivationToken" | "createAuditLog" | "invalidateUnusedActivationTokens"
  >;
  user: Awaited<ReturnType<PostgresStorage["getUser"]>>;
}) {
  if (!params.user) {
    throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
  }

  const recipientEmail = params.requireManagedEmail(
    params.user.email,
    "Email is required to send account activation.",
  );
  const activation = await issueActivationToken(params.storage, {
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

  await params.storage.createAuditLog({
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

export async function sendPasswordResetEmailOperation(params: {
  expiresAt: Date;
  requireManagedEmail: (email: string | null, message: string) => string;
  resetUrl: string;
  user: Awaited<ReturnType<PostgresStorage["getUser"]>>;
}): Promise<ManagedAccountPasswordResetDelivery> {
  if (!params.user) {
    throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
  }

  const recipientEmail = params.requireManagedEmail(
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
