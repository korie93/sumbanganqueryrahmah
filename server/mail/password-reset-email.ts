import { escapeEmailHtml } from "./email-html-utils";

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
  const safeExpiryLine = escapeEmailHtml(expiryLine);
  const safeIntro = escapeEmailHtml(intro);
  const safeResetUrl = escapeEmailHtml(input.resetUrl);
  const safeUsernameLine = escapeEmailHtml(usernameLine);

  const text = [
    intro,
    "",
    usernameLine,
    "",
    "Create your new password by opening the link below:",
    input.resetUrl,
    "",
    expiryLine,
    "",
    "If you did not request this reset, contact the system administrator immediately.",
  ].join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#0f172a;">
      <p>${safeIntro}</p>
      <p><strong>${safeUsernameLine}</strong></p>
      <p>Click the button below to create your new password.</p>
      <p>
        <a
          href="${safeResetUrl}"
          style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;"
        >
          Reset Password
        </a>
      </p>
      <p>If the button does not work, copy and paste this link into your browser:</p>
      <p><a href="${safeResetUrl}">${safeResetUrl}</a></p>
      <p>${safeExpiryLine}</p>
      <p>If you did not request this reset, contact the system administrator immediately.</p>
    </div>
  `.trim();

  return {
    subject,
    text,
    html,
  };
}
