import test from "node:test";
import assert from "node:assert/strict";
import {
  findForbiddenTypeScriptTypeSafetyPatterns,
  findHighConfidenceSecretTokens,
  findPotentialCommittedSmtpSecrets,
  findTrackedForbiddenEnvFiles,
  findTrackedGeneratedOutputs,
  findUnpinnedGithubActions,
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

test("repo hygiene flags high-confidence committed provider tokens", () => {
  const openAiEnvKey = "OPENAI_" + "API_KEY";
  const openAiPrefix = "sk-proj-";
  const openAiToken = `${openAiPrefix}abcdefghijklmnopqrstuvwxyz0123456789`;
  const awsEnvKey = "AWS_ACCESS_" + "KEY_ID";
  const awsPrefix = "AKIA";
  const awsToken = `${awsPrefix}IOSFODNN7EXAMPLE`;
  const findings = findHighConfidenceSecretTokens({
    filePath: "docs/example.md",
    text: `
${openAiEnvKey}=${openAiToken}
${awsEnvKey}=${awsToken}
`,
  });

  assert.equal(findings.length, 2);
  assert.match(findings[0], /OpenAI API key/i);
  assert.match(findings[1], /AWS access key id/i);
});

test("repo hygiene flags masked secret placeholders", () => {
  const secretKey = "DATABASE_" + "PASSWORD";
  const maskedValue = "*".repeat(6);
  const findings = findHighConfidenceSecretTokens({
    filePath: "docs/example.md",
    text: `${secretKey}=${maskedValue}\n`,
  });

  assert.equal(findings.length, 1);
  assert.match(findings[0], /masked secret placeholder/i);
});

test("repo hygiene allows generated CI placeholders during secret scanning", () => {
  const findings = findHighConfidenceSecretTokens({
    filePath: ".github/workflows/ci.yml",
    text: `
SESSION_SECRET: sqr-ci-session-\${{ github.run_id }}-\${{ github.run_attempt }}-generate-per-run-secret-48chars
PG_PASSWORD: sqr-ci-postgres-\${{ github.run_id }}-\${{ github.run_attempt }}-password-32chars
`,
  });

  assert.deepEqual(findings, []);
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

test("repo hygiene flags GitHub Actions that are not pinned to full SHAs", () => {
  const findings = findUnpinnedGithubActions({
    filePath: ".github/workflows/ci.yml",
    text: `
steps:
  - uses: actions/checkout@v5
  - uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444
`,
  });

  assert.deepEqual(findings, [
    ".github/workflows/ci.yml:3 GitHub Action actions/checkout is not pinned to a full commit SHA",
  ]);
});

test("repo hygiene flags tracked generated runtime outputs", () => {
  const findings = findTrackedGeneratedOutputs({
    trackedFiles: [
      ".env.example",
      "server/routes/example.ts",
      "uploads/collection-receipts/receipt.pdf",
      "var/smoke-debug.png",
      "dist-local/server/index-local.js",
      "output/report.json",
      "coverage/lcov.info",
      "artifacts/smoke-ui/report.json",
      "client\\src\\App.tsx",
    ],
  });

  assert.deepEqual(findings, [
    "uploads/collection-receipts/receipt.pdf",
    "var/smoke-debug.png",
    "dist-local/server/index-local.js",
    "output/report.json",
    "coverage/lcov.info",
    "artifacts/smoke-ui/report.json",
  ]);
});

test("repo hygiene flags any tracked env file except the template", () => {
  const findings = findTrackedForbiddenEnvFiles({
    trackedFiles: [
      ".env.example",
      ".env",
      ".env.local",
      ".env.smoke.local",
      "deploy/.env.production",
      "docs/env.example",
      "server/config/runtime-env-schema.ts",
    ],
  });

  assert.deepEqual(findings, [
    ".env",
    ".env.local",
    ".env.smoke.local",
    "deploy/.env.production",
  ]);
});
