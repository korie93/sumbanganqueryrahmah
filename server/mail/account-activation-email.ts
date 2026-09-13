import { escapeEmailHtmlContent, escapeEmailUrl, normalizeEmailUrl } from "./email-html-utils";
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
  const activationUrl = normalizeEmailUrl(input.activationUrl);
  const activationUrlText = activationUrl ?? "Activation link unavailable. Contact the system administrator.";
  const safeActivationUrl = escapeEmailUrl(input.activationUrl);
  const safeExpiryLine = escapeEmailHtmlContent(expiryLine);
  const safeIntro = escapeEmailHtmlContent(intro);
  const safeUsernameLine = escapeEmailHtmlContent(usernameLine);

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
    "If you did not expect this account, please contact the system administrator.",
  ].join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#0f172a;">
      <p>${safeIntro}</p>
      <p><strong>${safeUsernameLine}</strong></p>
      <p>Click the button below to activate your account and create your password.</p>
      <p>
        <a
          href="${safeActivationUrl}"
          style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;"
        >
          Activate Account
        </a>
      </p>
      <p>If the button does not work, copy and paste this link into your browser:</p>
      <p><a href="${safeActivationUrl}">${safeActivationUrl}</a></p>
      <p>${safeExpiryLine}</p>
      <p>${escapeEmailHtmlContent(policyLine)}</p>
      <p>${escapeEmailHtmlContent(linkHelp)}</p>
      <p>If you did not expect this account, please contact the system administrator.</p>
    </div>
  `.trim();

  return {
    subject,
    text,
    html,
  };
}
