import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { findPreCommitSecretFindings } from "./lib/git-hook-guards.mjs";

const gitCommand = process.platform === "win32" ? "git.exe" : "git";
const args = process.argv.slice(2);
const filesModeIndex = args.indexOf("--files");
const stagedMode = args.includes("--staged") || filesModeIndex < 0;

function runGit(argsForGit) {
  return spawnSync(gitCommand, argsForGit, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
}

function readStagedFilePaths() {
  const result = runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  if (result.error) {
    throw new Error(`Unable to read staged files: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`git diff --cached failed: ${result.stderr || result.stdout}`);
  }

  return result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function readStagedFileText(filePath) {
  const result = runGit(["show", `:${filePath}`]);
  if (result.status !== 0 || result.error) {
    return "";
  }

  return result.stdout;
}

function readWorkingTreeFileText(filePath) {
  if (!existsSync(filePath)) {
    return "";
  }

  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

const filePaths = stagedMode
  ? readStagedFilePaths()
  : args.slice(filesModeIndex + 1).filter((arg) => !arg.startsWith("-"));

const files = filePaths.map((filePath) => ({
  filePath,
  text: stagedMode ? readStagedFileText(filePath) : readWorkingTreeFileText(filePath),
}));
const findings = findPreCommitSecretFindings({ files });

if (findings.length > 0) {
  console.error("Pre-commit secret guard blocked this commit:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  console.error("Move real secrets to local .env files or a secret manager. Commit only safe placeholders.");
  process.exit(1);
}

console.log("Pre-commit secret guard passed.");
