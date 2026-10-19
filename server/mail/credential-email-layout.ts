import { SQR_BRAND_ASSETS } from "../../shared/brand-assets";
import { escapeEmailHtmlContent, normalizeEmailUrl } from "./email-html-utils";

type CredentialEmailLayoutInput = {
  actionLabel: string;
  actionUrl: string | null;
  expiresAt: Date;
  heading: string;
  intro: string;
  linkHelp: string;
  policy: string;
  preheader: string;
  securityNotice: string;
  systemName: string;
  unavailableMessage: string;
  username: string;
};

/** Credential actions are browser links, not the mailto links allowed by general mail utilities. */
export function normalizeCredentialEmailActionUrl(value: string): string | null {
  const normalized = normalizeEmailUrl(value);
  if (!normalized) return null;

  const parsed = new URL(normalized);
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password) {
    return null;
  }

  return normalized;
}

function formatMalaysiaExpiry(expiresAt: Date): string {
  if (!Number.isFinite(expiresAt.getTime())) return "Contact the system administrator";

  return `${new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(expiresAt)} (MYT)`;
}

/** A dependency-free, table-based email; all interpolated content is escaped here. */
export function buildCredentialEmailHtml(input: CredentialEmailLayoutInput): string {
  const escape = escapeEmailHtmlContent;
  // Revalidate at this boundary so no caller can accidentally add a non-browser CTA.
  const actionUrl = input.actionUrl ? normalizeCredentialEmailActionUrl(input.actionUrl) : null;
  const safeActionUrl = escape(actionUrl);
  // Never attach a token, username or tracking query to the public brand image request.
  const logoUrl = actionUrl
    ? new URL(SQR_BRAND_ASSETS.transparentIcon, new URL(actionUrl).origin).toString()
    : null;
  const logo = logoUrl
    ? `<td width="48" style="width:48px;vertical-align:middle;"><img src="${escape(logoUrl)}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border:0;"></td>`
    : "";
  const action = actionUrl
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:24px 0 0;">
          <tr><td align="center" bgcolor="#1262e8" style="background:#1262e8;border-radius:8px;mso-padding-alt:15px 24px;">
            <a href="${safeActionUrl}" style="display:block;padding:15px 24px;border:1px solid #1262e8;border-radius:8px;color:#ffffff;font-size:16px;font-weight:700;line-height:24px;text-align:center;text-decoration:none;">${escape(input.actionLabel)}</a>
          </td></tr>
        </table>
        <div style="margin:24px 0 0;padding-top:20px;border-top:1px solid #dce3ec;">
          <p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#475569;">If the button does not work, copy and paste this link into your browser:</p>
          <p style="margin:0;font-size:13px;line-height:21px;word-break:break-all;overflow-wrap:anywhere;"><a href="${safeActionUrl}" style="color:#165dcc;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${safeActionUrl}</a></p>
        </div>`
    : `<p style="margin:24px 0 0;padding:16px;border:1px solid #dce3ec;border-radius:8px;color:#334155;font-size:14px;line-height:22px;">${escape(input.unavailableMessage)}</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${escape(input.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#edf2f7;color:#102138;font-family:Segoe UI,Arial,sans-serif;-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;mso-hide:all;">${escape(input.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#edf2f7" style="width:100%;background:#edf2f7;">
      <tr><td align="center" style="padding:24px 12px;">
        <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dce3ec;border-radius:12px;border-collapse:separate;table-layout:fixed;">
          <tr><td bgcolor="#102434" style="padding:18px 24px;background:#102434;border-radius:11px 11px 0 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:100%;table-layout:fixed;"><tr>${logo}<td style="vertical-align:middle;color:#ffffff;font-size:21px;font-weight:700;line-height:28px;word-break:break-word;overflow-wrap:anywhere;">${escape(input.systemName)}</td></tr></table>
          </td></tr>
          <tr><td style="padding:28px 24px 26px;word-break:break-word;overflow-wrap:anywhere;">
            <h1 style="margin:0 0 10px;color:#102138;font-size:26px;font-weight:700;line-height:34px;">${escape(input.heading)}</h1>
            <p style="margin:0 0 22px;color:#475569;font-size:15px;line-height:24px;">${escape(input.intro)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f4f9" style="width:100%;background:#f0f4f9;border-radius:8px;table-layout:fixed;">
              <tr><td width="104" style="width:104px;padding:15px 8px 8px 16px;vertical-align:top;color:#526174;font-size:13px;line-height:23px;">Username</td><td style="padding:15px 16px 8px 0;color:#152c47;font-size:15px;font-weight:700;line-height:23px;word-break:break-all;overflow-wrap:anywhere;">${escape(input.username)}</td></tr>
              <tr><td width="104" style="width:104px;padding:0 8px 15px 16px;vertical-align:top;color:#526174;font-size:13px;line-height:22px;">Valid until</td><td style="padding:0 16px 15px 0;color:#152c47;font-size:14px;font-weight:600;line-height:22px;">${escape(formatMalaysiaExpiry(input.expiresAt))}</td></tr>
            </table>
            ${action}
            <h2 style="margin:24px 0 8px;color:#334155;font-size:14px;font-weight:700;line-height:22px;">Before you continue</h2>
            <p style="margin:0 0 10px;color:#475569;font-size:13px;line-height:21px;">${escape(input.policy)}</p>
            <p style="margin:0;color:#475569;font-size:13px;line-height:21px;">${escape(input.linkHelp)}</p>
          </td></tr>
          <tr><td style="padding:18px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;border-radius:0 0 11px 11px;color:#526174;font-size:12px;line-height:20px;">${escape(input.securityNotice)}</td></tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td></tr>
    </table>
  </body>
</html>`;
}
