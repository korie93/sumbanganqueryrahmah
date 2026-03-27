import test from "node:test";
import assert from "node:assert/strict";
import { findPotentialCommittedSmtpSecrets } from "../lib/repo-hygiene.mjs";

test("repo hygiene allows clearly fake SMTP placeholders in env templates", () => {
  const findings = findPotentialCommittedSmtpSecrets({
    filePath: ".env.example",
    text: `
SMTP_PASSWORD=
SMTP_PASSWORD=null
SMTP_PASSWORD=ganti-dengan-kredensial-smtp
SMTP_PASSWORD=kata-laluan-atau-app-password
SMTP_PASSWORD=\${SMTP_PASSWORD}
SMTP_PASSWORD=\${{ secrets.SMTP_PASSWORD }}
`,
  });

  assert.deepEqual(findings, []);
});

test("repo hygiene flags non-placeholder SMTP password assignments", () => {
  const findings = findPotentialCommittedSmtpSecrets({
    filePath: ".env",
    text: "SMTP_PASSWORD=real-secret-value\n",
  });

  assert.equal(findings.length, 1);
  assert.match(findings[0], /potential committed SMTP secret/i);
});

test("repo hygiene flags hardcoded nodemailer auth passwords", () => {
  const findings = findPotentialCommittedSmtpSecrets({
    filePath: "server/mailer.ts",
    text: `
      const transporter = nodemailer.createTransport({
        auth: {
          user: "mailer@example.com",
          pass: "hardcoded-app-password",
        },
      });
    `,
  });

  assert.equal(findings.length, 1);
  assert.match(findings[0], /hardcoded nodemailer auth\.pass literal/i);
});
