import { buildCredentialEmailHtml, normalizeCredentialEmailActionUrl } from "./credential-email-layout";
import { getCredentialPasswordPolicyMessage } from "../../shared/password-policy";

type BuildAccountActivationEmailInput = {
  activationUrl: string;
  expiresAt: Date;
  systemName?: string | null;
  username: string;
  resent?: boolean | undefined;
};

function formatExpiry(expiresAt: Date): string {
  return expiresAt.toUTCString();
}

export function buildAccountActivationEmail(input: BuildAccountActivationEmailInput) {
  const systemName = String(input.systemName || "SQR System").trim() || "SQR System";
  const expiresAtText = formatExpiry(input.expiresAt);
  const subject = `Activate Your ${systemName} Account`;
  const intro = input.resent
    ? `A new activation link has been requested for your ${systemName} account. Earlier activation links no longer work.`
    : `A new account has been created for you in ${systemName}.`;
  const usernameLine = `Username: ${input.username}`;
  const expiryLine = `This activation link expires on ${expiresAtText}.`;
  const policyLine = getCredentialPasswordPolicyMessage();
  const linkHelp = "Enter the same new password in both fields. This link works once; use the newest activation email. If it expires, ask the administrator to resend activation. If your account is already activated, sign in. Never share this link or your password.";
  const activationUrl = normalizeCredentialEmailActionUrl(input.activationUrl);
  const activationUrlText = activationUrl ?? "Activation link unavailable. Contact the system administrator.";
  const securityNotice = "If you did not expect this account, please contact the system administrator.";

  const text = [
    intro,
    "",
    usernameLine,
    "",
    "Activate your account by opening the link below and creating your password:",
    activationUrlText,
    "",
    expiryLine,
    policyLine,
    linkHelp,
    "",
    securityNotice,
  ].join("\n");

  const html = buildCredentialEmailHtml({
    actionLabel: "Activate Account",
    actionUrl: activationUrl,
    expiresAt: input.expiresAt,
    heading: `Welcome to ${systemName}`,
    intro,
    linkHelp,
    policy: policyLine,
    preheader: input.resent
      ? "Use your newest activation link to create your password. Earlier activation links no longer work."
      : `Your ${systemName} account is ready to activate. Create your password using this one-time link.`,
    securityNotice,
    systemName,
    unavailableMessage: "Activation link unavailable. Contact the system administrator.",
    username: input.username,
  });

  return {
    subject,
    text,
    html,
  };
}
