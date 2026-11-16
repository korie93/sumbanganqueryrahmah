import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
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

test("pre-commit guard accepts the CI PNG without exempting binary secrets or forbidden paths", () => {
  const filePath = "tests/visual/__snapshots__/app.visual.spec.ts/login-dark.png";
  const bytes = readFileSync(filePath);
  assert.deepEqual(findPreCommitSecretFindings({ files: [{ filePath, bytes }] }), []);
  const token = "ghp_" + "a".repeat(36);
  const tainted = Buffer.concat([bytes, Buffer.from(`\n${token}\nPASSWORD=real-service-value\n`)]);
  const findings = findPreCommitSecretFindings({ files: [{ filePath, bytes: tainted }] });
  assert.equal(findings.length, 2);
  assert.match(findings[0], /GitHub token/);
  assert.match(findings[1], /secret assignment/);
  for (const forbidden of [".env.local", "secrets/image.png", "image.pem"]) {
    assert.equal(findPreCommitSecretFindings({ files: [{ filePath: forbidden, bytes }] }).length, 1);
  }
  const masked = Buffer.from("*".repeat(6));
  assert.match(findPreCommitSecretFindings({ files: [{ filePath, bytes: masked }] })[0], /masked secret placeholder/);
});

test("hygiene and both pre-commit modes classify real PNG bytes but still reject text and tokens", () => {
  const root = mkdtempSync(path.join(tmpdir(), "sqr-secret-scan-"));
  const git = process.platform === "win32" ? "git.exe" : "git";
  const run = (command, args) => spawnSync(command, args, { cwd: root, encoding: "utf8", timeout: 15_000 });
  const gitOk = (args) => {
    const result = run(git, args);
    assert.equal(result.status, 0, result.error?.message || result.stderr);
  };
  const checks = [
    ["verify-repo-hygiene.mjs"], ["verify-secret-scan.mjs"],
    ["precommit-secret-guard.mjs", "--staged"], ["precommit-secret-guard.mjs", "--files", "image.png"],
  ];
  const assertChecks = (status, pattern) => {
    for (const [script, ...args] of checks) {
      const result = run(process.execPath, [path.resolve("scripts", script), ...args]);
      assert.equal(result.status, status, `${script} ${args.join(" ")}: ${result.error?.message || result.stderr}`);
      if (pattern) assert.match(result.stderr, pattern);
    }
  };
  try {
    gitOk(["init", "--quiet"]);
    writeFileSync(path.join(root, ".gitignore"), readFileSync(".gitignore"));
    writeFileSync(path.join(root, ".env.example"), "# Synthetic test template\n");
    const image = readFileSync("tests/visual/__snapshots__/app.visual.spec.ts/login-dark.png");
    writeFileSync(path.join(root, "image.png"), image);
    gitOk(["add", "--", ".gitignore", ".env.example", "image.png"]);
    assertChecks(0);

    // A filename extension is not an exemption for a text secret.
    writeFileSync(path.join(root, "image.png"), "*".repeat(6));
    gitOk(["add", "--", "image.png"]);
    assertChecks(1, /masked secret placeholder/);

    // A binary prefix cannot hide a real provider token from any entry point.
    const token = "ghp_" + "a".repeat(36);
    writeFileSync(path.join(root, "image.png"), Buffer.concat([image, Buffer.from(`\n${token}\n`)]));
    gitOk(["add", "--", "image.png"]);
    assertChecks(1, /GitHub token/);

    // --staged reads the index, not the now-clean working tree.
    writeFileSync(path.join(root, "image.png"), image);
    const staged = run(process.execPath, [path.resolve("scripts/precommit-secret-guard.mjs"), "--staged"]);
    assert.equal(staged.status, 1);
    assert.match(staged.stderr, /GitHub token/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
