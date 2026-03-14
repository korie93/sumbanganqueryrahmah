type BuildAccountActivationEmailInput = {
  activationUrl: string;
  expiresAt: Date;
  systemName?: string | null;
  username: string;
};

function formatExpiry(expiresAt: Date): string {
  return expiresAt.toUTCString();
}

export function buildAccountActivationEmail(input: BuildAccountActivationEmailInput) {
  const systemName = String(input.systemName || "SQR System").trim() || "SQR System";
  const expiresAtText = formatExpiry(input.expiresAt);
  const subject = `Activate Your ${systemName} Account`;
  const intro = `A new account has been created for you in ${systemName}.`;
  const usernameLine = `Username: ${input.username}`;
  const expiryLine = `This activation link expires on ${expiresAtText}.`;

  const text = [
    intro,
    "",
    usernameLine,
    "",
    "Activate your account by opening the link below and creating your password:",
    input.activationUrl,
    "",
    expiryLine,
    "",
    "If you did not expect this account, please contact the system administrator.",
  ].join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.6;color:#0f172a;">
      <p>${intro}</p>
      <p><strong>${usernameLine}</strong></p>
      <p>Click the button below to activate your account and create your password.</p>
      <p>
        <a
          href="${input.activationUrl}"
          style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;"
        >
          Activate Account
        </a>
      </p>
      <p>If the button does not work, copy and paste this link into your browser:</p>
      <p><a href="${input.activationUrl}">${input.activationUrl}</a></p>
      <p>${expiryLine}</p>
      <p>If you did not expect this account, please contact the system administrator.</p>
    </div>
  `.trim();

  return {
    subject,
    text,
    html,
  };
}
