import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  findGenericSecretAssignments,
  findPreCommitSecretFindings,
  isForbiddenEnvFilePath,
  validateCommitMessage,
} from "../lib/git-hook-guards.mjs";

test("pre-commit guard blocks staged env files", () => {
  const findings = findPreCommitSecretFindings({
    files: [
      {
        filePath: ".env.local",
        text: "SESSION_SECRET=GENERATE_ME_LOCAL_ONLY",
      },
    ],
  });

  assert.equal(findings.length, 1);
  assert.match(findings[0], /forbidden environment file/i);
  assert.equal(isForbiddenEnvFilePath(".env.example"), false);
});

test("pre-commit guard allows normal source files without secrets", () => {
  const findings = findPreCommitSecretFindings({
    files: [
      {
        filePath: "client/src/example.tsx",
        text: [
          "export const label = 'Selamat datang';",
          "const configuredSessionSecret = runtimeConfig.auth.sessionSecret;",
          "const params = { password: readDatabasePassword() };",
          "must_change_password = COALESCE(must_change_password, false),",
          "password_reset_by_superuser = COALESCE(password_reset_by_superuser, false),",
          "<PasswordStrengthMeter",
          "  password={newPassword}",
          "/>",
        ].join("\n"),
      },
    ],
  });

  assert.deepEqual(findings, []);
});

test("pre-commit guard detects high-confidence and generic secret patterns", () => {
  const awsKeyPrefix = "AKIA";
  const privateKeyHeader = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
  const findings = findPreCommitSecretFindings({
    files: [
      {
        filePath: "docs/leak.md",
        text: [
          `AWS_ACCESS_KEY_ID=${awsKeyPrefix}IOSFODNN7EXAMPLE`,
          privateKeyHeader,
          "api_key=real-service-key-value",
          "password=correct-horse-battery-staple",
        ].join("\n"),
      },
    ],
  });

  assert.equal(findings.length, 4);
  assert.match(findings[0], /AWS access key id/i);
  assert.match(findings[1], /private key/i);
  assert.match(findings[2], /api_key/i);
  assert.match(findings[3], /password/i);
});

test("generic secret detection allows placeholders and secret-manager references", () => {
  const findings = findGenericSecretAssignments({
    filePath: ".env.example",
    text: [
      "SESSION_SECRET=GENERATE_ME_DO_NOT_USE",
      "SMTP_PASSWORD=${SMTP_PASSWORD}",
      "PG_PASSWORD=${{ secrets.PG_PASSWORD }}",
      "BACKUP_ENCRYPTION_KEY=ganti-dengan-secret-random",
    ].join("\n"),
  });

  assert.deepEqual(findings, []);
});

test("commit message guard accepts conventional commits and rejects vague messages", () => {
  assert.equal(validateCommitMessage("fix(auth): reject stale session"), null);
  assert.equal(validateCommitMessage("security(hooks): block env commits"), null);
  assert.equal(validateCommitMessage("Merge branch 'main'"), null);
  assert.match(
    validateCommitMessage("updated stuff") || "",
    /Conventional Commits/i,
  );
});

test("husky hook files and lint-staged configuration are present after install", () => {
  assert.equal(existsSync(".husky/pre-commit"), true);
  assert.equal(existsSync(".husky/commit-msg"), true);

  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.scripts.prepare, "husky");
  assert.equal(packageJson.devDependencies.husky.startsWith("^9."), true);
  assert.equal(packageJson.devDependencies["lint-staged"].startsWith("^17."), true);
  assert.deepEqual(packageJson["lint-staged"], {
    "*": "node scripts/precommit-secret-guard.mjs --files",
  });
});
