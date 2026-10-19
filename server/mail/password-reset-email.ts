import { buildCredentialEmailHtml, normalizeCredentialEmailActionUrl } from "./credential-email-layout";
import { getCredentialPasswordPolicyMessage } from "../../shared/password-policy";

type BuildPasswordResetEmailInput = {
  expiresAt: Date;
  resetUrl: string;
  systemName?: string | null;
  username: string;
};

function formatExpiry(expiresAt: Date): string {
  return expiresAt.toUTCString();
}

export function buildPasswordResetEmail(input: BuildPasswordResetEmailInput) {
  const systemName = String(input.systemName || "SQR System").trim() || "SQR System";
  const expiresAtText = formatExpiry(input.expiresAt);
  const subject = `Reset Your ${systemName} Password`;
  const intro = `A password reset has been approved for your ${systemName} account.`;
  const usernameLine = `Username: ${input.username}`;
  const expiryLine = `This reset link expires on ${expiresAtText}.`;
  const policyLine = getCredentialPasswordPolicyMessage();
  const linkHelp = "Enter the same new password in both fields. This link works once; use the newest reset email. If it expires, ask the administrator for a new link. Never share this link or your password.";
  const resetUrl = normalizeCredentialEmailActionUrl(input.resetUrl);
  const resetUrlText = resetUrl ?? "Reset link unavailable. Contact the system administrator.";
  const securityNotice = "If you did not request this reset, contact the system administrator immediately.";

  const text = [
    intro,
    "",
    usernameLine,
    "",
    "Create your new password by opening the link below:",
    resetUrlText,
    "",
    expiryLine,
    policyLine,
    linkHelp,
    "",
    securityNotice,
  ].join("\n");

  const html = buildCredentialEmailHtml({
    actionLabel: "Reset Password",
    actionUrl: resetUrl,
    expiresAt: input.expiresAt,
    heading: "Set a new password",
    intro,
    linkHelp,
    policy: policyLine,
    preheader: `Your ${systemName} password reset has been approved. Create your new password using this one-time link.`,
    securityNotice,
    systemName,
    unavailableMessage: "Reset link unavailable. Contact the system administrator.",
    username: input.username,
  });

  return {
    subject,
    text,
    html,
  };
}
