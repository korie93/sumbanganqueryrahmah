import test from "node:test";
import assert from "node:assert/strict";
import {
  findForbiddenTypeScriptTypeSafetyPatterns,
  findPotentialCommittedSmtpSecrets,
  findUnsafeAutomationKillPatterns,
} from "../lib/repo-hygiene.mjs";

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

test("repo hygiene allows narrative uses of the word any in TypeScript strings and comments", () => {
  const findings = findForbiddenTypeScriptTypeSafetyPatterns({
    filePath: "client/src/example.ts",
    text: `
// This message should not match any type-safety rule.
export const message = "Excel file does not have any sheets.";
`,
  });

  assert.deepEqual(findings, []);
});

test("repo hygiene flags explicit TypeScript any patterns and suppression directives", () => {
  const findings = findForbiddenTypeScriptTypeSafetyPatterns({
    filePath: "server/example.ts",
    text: `
const first = value as any;
const second: any = value;
// @ts-ignore
const third = fn<any>();
`,
  });

  assert.equal(findings.length, 4);
  assert.match(findings[0], /as any/i);
  assert.match(findings[1], /: any/i);
  assert.match(findings[2], /@ts-ignore/i);
  assert.match(findings[3], /<any>/i);
});

test("repo hygiene flags broad process kill patterns in automation files", () => {
  const findings = findUnsafeAutomationKillPatterns({
    filePath: ".github/workflows/ci.yml",
    text: `
run: |
  pkill -f "dist-local/server/index-local.js" || true
`,
  });

  assert.equal(findings.length, 1);
  assert.match(findings[0], /pkill -f/i);
});

test("repo hygiene allows targeted pid-based shutdowns in automation files", () => {
  const findings = findUnsafeAutomationKillPatterns({
    filePath: "scripts/smoke-ci-local.mjs",
    text: `
if (serverPid) {
  process.kill(serverPid);
}
`,
  });

  assert.deepEqual(findings, []);
});
