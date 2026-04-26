import assert from "node:assert/strict";
import test from "node:test";

import { buildAccountActivationEmail } from "../../mail/account-activation-email";
import { buildPasswordResetEmail } from "../../mail/password-reset-email";

const expiresAt = new Date("2026-04-26T10:00:00.000Z");

test("buildAccountActivationEmail escapes user-controlled HTML content", () => {
  const email = buildAccountActivationEmail({
    activationUrl: "https://sqr.example.com/activate-account?token=a&next=\"<script>\"",
    expiresAt,
    username: "new.user\"><img src=x onerror=alert(1)>",
  });

  assert.match(email.html, /new\.user&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(email.html, /token=a&amp;next=&quot;&lt;script&gt;&quot;/);
  assert.doesNotMatch(email.html, /<img src=x onerror=/);
  assert.doesNotMatch(email.html, /href="[^"]*"<script>"/);
});

test("buildPasswordResetEmail escapes user-controlled HTML content", () => {
  const email = buildPasswordResetEmail({
    expiresAt,
    resetUrl: "https://sqr.example.com/reset-password?token=a&next=\"<script>\"",
    username: "reset.user\"><svg onload=alert(1)>",
  });

  assert.match(email.html, /reset\.user&quot;&gt;&lt;svg onload=alert\(1\)&gt;/);
  assert.match(email.html, /token=a&amp;next=&quot;&lt;script&gt;&quot;/);
  assert.doesNotMatch(email.html, /<svg onload=/);
  assert.doesNotMatch(email.html, /href="[^"]*"<script>"/);
});
