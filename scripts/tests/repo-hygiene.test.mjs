import test from "node:test";
import assert from "node:assert/strict";
import { findPotentialCommittedSmtpSecrets } from "../lib/repo-hygiene.mjs";

test("repo hygiene allows clearly fake SMTP placeholders in env templates", () => {
  const envKey = "SMTP_PASSWORD";
  const placeholderEnv = "${SMTP_PASSWORD}";
  const placeholderSecret = "${{ secrets.SMTP_PASSWORD }}";
  const findings = findPotentialCommittedSmtpSecrets({
    filePath: ".env.example",
    text: `
${envKey}=
${envKey}=null
${envKey}=ganti-dengan-kredensial-smtp
${envKey}=kata-laluan-atau-app-password
${envKey}=${placeholderEnv}
${envKey}=${placeholderSecret}
`,
  });

  assert.deepEqual(findings, []);
});

test("repo hygiene flags non-placeholder SMTP password assignments", () => {
  const envKey = "SMTP_PASSWORD";
  const secretValue = "real-secret-value";
  const findings = findPotentialCommittedSmtpSecrets({
    filePath: ".env",
    text: `${envKey}=${secretValue}\n`,
  });

  assert.equal(findings.length, 1);
  assert.match(findings[0], /potential committed SMTP secret/i);
});

test("repo hygiene allows SMTP password env key references in code", () => {
  const findings = findPotentialCommittedSmtpSecrets({
    filePath: "server/config/runtime-env-schema.ts",
    text: `
const schema = {
  SMTP_PASSWORD: optionalEnvString("SMTP_PASSWORD", SECRET_STRING_MAX_LENGTH),
};

const runtime = {
  smtpPassword: readOptionalString("SMTP_PASSWORD"),
};

const diagnosticEnvNames = ["MAIL_FROM", "SMTP_USER", "SMTP_PASSWORD"];
`,
  });

  assert.deepEqual(findings, []);
});

test("repo hygiene flags hardcoded nodemailer auth passwords", () => {
  const transportCall = "createTransport";
  const authPassKey = "pass";
  const hardcodedSecret = "hardcoded-app-password";
  const findings = findPotentialCommittedSmtpSecrets({
    filePath: "server/mailer.ts",
    text: `
      const transporter = nodemailer.${transportCall}({
        auth: {
          user: "mailer@example.com",
          ${authPassKey}: "${hardcodedSecret}",
        },
      });
    `,
  });

  assert.equal(findings.length, 1);
  assert.match(findings[0], /hardcoded nodemailer auth\.pass literal/i);
});
