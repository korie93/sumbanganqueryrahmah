import assert from "node:assert/strict";
import test from "node:test";

import { buildAccountActivationEmail } from "../../mail/account-activation-email";
import {
  escapeEmailHtmlContent,
  escapeEmailHtmlWithLineBreaks,
  escapeEmailUrl,
  normalizeEmailUrl,
} from "../../mail/email-html-utils";
import { buildPasswordResetEmail } from "../../mail/password-reset-email";
import { getCredentialPasswordPolicyMessage } from "../../../shared/password-policy";
import { SQR_BRAND_ASSETS } from "../../../shared/brand-assets";
import { normalizeCredentialEmailActionUrl } from "../../mail/credential-email-layout";

const expiresAt = new Date("2026-04-26T10:00:00.000Z");

test("activation and reset emails describe the shared manual policy and safe one-time link steps", () => {
  const activationUrl = "https://sqr.example.com/activate-account?token=activation-fixture";
  const resetUrl = "https://sqr.example.com/reset-password?token=reset-fixture";
  const emails = [
    [buildAccountActivationEmail({ activationUrl, expiresAt, username: "managed.user" }), activationUrl],
    [buildPasswordResetEmail({ expiresAt, resetUrl, username: "managed.user" }), resetUrl],
  ] as const;
  const policy = getCredentialPasswordPolicyMessage();
  assert.match(policy, /between 14 and 256 characters/i);
  for (const [email, actionUrl] of emails) {
    for (const content of [email.text, email.html]) {
      assert.ok(content.includes(policy));
      assert.ok(content.includes(actionUrl));
      assert.match(content, /same new password in both fields/i);
      assert.match(content, /link works once; use the newest/i);
      assert.match(content, /If it expires, ask the administrator/i);
      assert.match(content, /Never share this link or your password/i);
      assert.doesNotMatch(content, /(?:temporary|new|permanent) password\s*:/i);
      assert.doesNotMatch(content, /exactly 8|at least 8|minimum 8/i);
    }
    assert.ok(email.text.includes(expiresAt.toUTCString()));
    assert.match(email.html, /26 Apr 2026, 6:00 pm \(MYT\)/);
  }
});

test("resent activation emails tell recipients to replace old links and sign in if already active", () => {
  const input = {
    activationUrl: "https://sqr.example.com/activate-account?token=newest-fixture",
    expiresAt,
    username: "managed.user",
  };
  const resent = buildAccountActivationEmail({ ...input, resent: true });
  const initial = buildAccountActivationEmail(input);
  for (const content of [resent.text, resent.html]) {
    assert.match(content, /new activation link has been requested/i);
    assert.match(content, /Earlier activation links no longer work/i);
    assert.match(content, /If your account is already activated, sign in/i);
    assert.match(content, /ask the administrator to resend activation/i);
  }
  assert.match(initial.text, /A new account has been created/i);
  assert.doesNotMatch(initial.text, /Earlier activation links no longer work/i);
});

test("buildAccountActivationEmail escapes user-controlled HTML content", () => {
  const email = buildAccountActivationEmail({
    activationUrl: "https://sqr.example.com/activate-account?token=a&next=\"<script>\"",
    expiresAt,
    systemName: "SQR<script>alert(1)</script>",
    username: "new.user\"><img src=x onerror=alert(1)>",
  });

  assert.match(email.html, /new\.user&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(email.html, /SQR&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(email.html, /token=a&amp;next=%22%3Cscript%3E%22/);
  assert.doesNotMatch(email.html, /<img src=x onerror=/);
  assert.doesNotMatch(email.html, /<script>/);
  assert.doesNotMatch(email.html, /href="[^"]*"<script>"/);
});

test("buildPasswordResetEmail escapes user-controlled HTML content", () => {
  const email = buildPasswordResetEmail({
    expiresAt,
    resetUrl: "https://sqr.example.com/reset-password?token=a&next=\"<script>\"",
    username: "reset.user\"><svg onload=alert(1)>",
  });

  assert.match(email.html, /reset\.user&quot;&gt;&lt;svg onload=alert\(1\)&gt;/);
  assert.match(email.html, /token=a&amp;next=%22%3Cscript%3E%22/);
  assert.doesNotMatch(email.html, /<svg onload=/);
  assert.doesNotMatch(email.html, /href="[^"]*"<script>"/);
});

test("email HTML utilities escape content and preserve safe line breaks", () => {
  assert.equal(
    escapeEmailHtmlContent(`A&B <script>"x"</script> 'ok'`),
    "A&amp;B &lt;script&gt;&quot;x&quot;&lt;/script&gt; &#x27;ok&#x27;",
  );
  assert.equal(escapeEmailHtmlContent(null), "");
  assert.equal(escapeEmailHtmlContent(undefined), "");
  assert.equal(escapeEmailHtmlWithLineBreaks("Line 1\n<img src=x>"), "Line 1<br>&lt;img src=x&gt;");
});

test("email URL sanitizer allows only safe protocols", () => {
  assert.equal(
    normalizeEmailUrl("https://sqr.example.com/reset-password?token=a&next=<x>"),
    "https://sqr.example.com/reset-password?token=a&next=%3Cx%3E",
  );
  assert.equal(escapeEmailUrl("javascript:alert(1)"), "#");
  assert.equal(escapeEmailUrl("data:text/html,<script>alert(1)</script>"), "#");
  assert.equal(escapeEmailUrl("not a url"), "#");
  assert.equal(escapeEmailUrl(undefined), "#");
  assert.equal(escapeEmailUrl("mailto:support@sqr.example.com"), "mailto:support@sqr.example.com");
});

test("email builders replace unsafe action URLs with safe fallbacks", () => {
  const activationEmail = buildAccountActivationEmail({
    activationUrl: "javascript:alert(1)",
    expiresAt,
    username: "new.user",
  });
  const resetEmail = buildPasswordResetEmail({
    expiresAt,
    resetUrl: "data:text/html,<script>alert(1)</script>",
    username: "reset.user",
  });

  assert.doesNotMatch(activationEmail.html, /javascript:/i);
  assert.doesNotMatch(activationEmail.html, /<a\b|<img\b/i);
  assert.match(activationEmail.html, /Activation link unavailable/);
  assert.match(activationEmail.text, /Activation link unavailable/);
  assert.doesNotMatch(resetEmail.html, /data:text\/html/i);
  assert.doesNotMatch(resetEmail.html, /<a\b|<img\b/i);
  assert.match(resetEmail.html, /Reset link unavailable/);
  assert.match(resetEmail.text, /Reset link unavailable/);
});

test("credential email actions accept only browser URLs without embedded credentials", () => {
  assert.equal(normalizeCredentialEmailActionUrl("https://sqr.example.com/reset-password?token=fixture"), "https://sqr.example.com/reset-password?token=fixture");
  assert.equal(normalizeCredentialEmailActionUrl("http://localhost:5000/activate-account?token=fixture"), "http://localhost:5000/activate-account?token=fixture");

  for (const actionUrl of [
    "mailto:support@sqr.example.com",
    "javascript:alert(1)",
    "data:text/html,<svg onload=alert(1)>",
    "https://username:password@sqr.example.com/reset-password?token=fixture",
    "//sqr.example.com/reset-password?token=fixture",
    "not a URL",
    "",
  ]) {
    assert.equal(normalizeCredentialEmailActionUrl(actionUrl), null);
    const emails = [
      buildAccountActivationEmail({ activationUrl: actionUrl, expiresAt, username: "managed.user" }),
      buildPasswordResetEmail({ resetUrl: actionUrl, expiresAt, username: "managed.user" }),
    ];
    for (const email of emails) {
      assert.doesNotMatch(email.html, /<a\b|<img\b/i);
      assert.match(email.html, /link unavailable\. Contact the system administrator\./);
      assert.match(email.text, /link unavailable\. Contact the system administrator\./);
      assert.doesNotMatch(email.html, /src=|href=|javascript:|data:text|username:password@/i);
    }
  }
});

test("credential emails use the approved same-origin Q asset with a visible text fallback and no trackers", () => {
  const actionUrl = "https://sqr.example.com/reset-password?token=synthetic-secret&next=%2Fhome";
  const emails = [
    buildPasswordResetEmail({ resetUrl: actionUrl, expiresAt, username: "managed.user" }),
    buildAccountActivationEmail({ activationUrl: actionUrl, expiresAt, username: "managed.user" }),
  ];

  for (const email of emails) {
    assert.match(email.html, /<html lang="en">/);
    assert.match(email.html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    assert.match(email.html, /max-width:600px/);
    assert.match(email.html, /<table role="presentation"/);
    const imageSources = [...email.html.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(imageSources, [`https://sqr.example.com${SQR_BRAND_ASSETS.transparentIcon}`]);
    assert.ok(email.html.includes("SQR System</td>"), "the brand name remains visible when remote images are blocked");
    assert.match(email.html, /width="36" height="36" alt=""/);
    assert.match(email.html, /\(MYT\)/);
    assert.ok(email.text.includes(expiresAt.toUTCString()));
    assert.ok(!email.html.includes(expiresAt.toUTCString()), "HTML shows the expiry once, in MYT");
    assert.match(email.html, /26 Apr 2026, 6:00 pm \(MYT\)/);
    assert.equal([...email.html.matchAll(/<a\b/g)].length, 2, "one primary CTA and one copyable fallback link");
    assert.doesNotMatch(email.html, /<script\b|<iframe\b|<form\b|<link\b|<svg\b|<style\b|url\(|on(?:load|error|click)\s*=/i);
    assert.doesNotMatch(email.html, /https?:\/\/(?!sqr\.example\.com(?:\/|&|"))/i);
    assert.doesNotMatch(email.text, /<table|<img|<!doctype/i);
    assert.ok(email.text.includes(actionUrl));
  }
});

test("long usernames and tokens stay complete in both alternatives and have explicit wrapping", () => {
  const username = `long.${"name".repeat(50)}&<managed>`;
  const actionUrl = `https://sqr.example.com/reset-password?token=${"a".repeat(512)}&scope=account`;
  const emails = [
    buildPasswordResetEmail({ resetUrl: actionUrl, expiresAt, username }),
    buildAccountActivationEmail({ activationUrl: actionUrl, expiresAt, username }),
  ];

  for (const email of emails) {
    assert.ok(email.text.includes(username));
    assert.ok(email.text.includes(actionUrl));
    assert.ok(email.html.includes(escapeEmailHtmlContent(username)));
    assert.ok(email.html.includes(escapeEmailHtmlContent(actionUrl)));
    assert.match(email.html, /word-break:break-all;overflow-wrap:anywhere/);
    assert.match(email.html, /table-layout:fixed/);
    assert.doesNotMatch(email.html, /text-overflow:ellipsis|white-space:nowrap/);
  }
});

test("custom system labels are escaped throughout the shared credential layout", () => {
  const label = `Research & <Test> "Group" 'SQR'`;
  const emails = [
    buildAccountActivationEmail({ activationUrl: "https://sqr.example.com/activate-account?token=fixture", expiresAt, username: "demo", systemName: label }),
    buildPasswordResetEmail({ resetUrl: "https://sqr.example.com/reset-password?token=fixture", expiresAt, username: "demo", systemName: label }),
  ];

  for (const email of emails) {
    assert.ok(email.subject.includes(label));
    assert.ok(email.text.includes(label));
    assert.ok(email.html.includes(escapeEmailHtmlContent(label)));
    assert.doesNotMatch(email.html, /<Test>/);
  }
});
