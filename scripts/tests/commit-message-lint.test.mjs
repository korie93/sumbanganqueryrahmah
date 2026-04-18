import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function runCommitMessageCheck(messagePath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/verify-commit-message.mjs", messagePath], {
      cwd: process.cwd(),
      stdio: "ignore",
    });
    child.once("close", (code) => resolve(code ?? 1));
  });
}

test("verify-commit-message accepts conventional commit subjects", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-commit-msg-"));
  const messagePath = path.join(tempDir, "COMMIT_EDITMSG");

  try {
    await writeFile(messagePath, "fix(runtime): harden CSP reporting\n", "utf8");
    assert.equal(await runCommitMessageCheck(messagePath), 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-commit-message rejects free-form commit subjects", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-commit-msg-"));
  const messagePath = path.join(tempDir, "COMMIT_EDITMSG");

  try {
    await writeFile(messagePath, "updated stuff\n", "utf8");
    assert.equal(await runCommitMessageCheck(messagePath), 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-commit-message accepts a conventional subject with a commit body", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-commit-msg-"));
  const messagePath = path.join(tempDir, "COMMIT_EDITMSG");

  try {
    await writeFile(
      messagePath,
      "chore: update package dependencies and fix versioning in tests\n\n- refresh lockfile\n- adapt chart typings\n",
      "utf8",
    );
    assert.equal(await runCommitMessageCheck(messagePath), 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-commit-message ignores Git comment lines when resolving the subject", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-commit-msg-"));
  const messagePath = path.join(tempDir, "COMMIT_EDITMSG");

  try {
    await writeFile(
      messagePath,
      "\n# Please enter the commit message for your changes.\nfix(ci): harden workflow secret generation\n# Changes to be committed:\n#   modified: package.json\n",
      "utf8",
    );
    assert.equal(await runCommitMessageCheck(messagePath), 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
