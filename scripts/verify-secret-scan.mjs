import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { findHighConfidenceSecretTokens } from "./lib/repo-hygiene.mjs";

const gitCommand = process.platform === "win32" ? "git.exe" : "git";
const trackedFilesResult = spawnSync(gitCommand, ["ls-files"], { encoding: "utf8" });

if (trackedFilesResult.error) {
  console.error(`Unable to inspect tracked repository files: ${trackedFilesResult.error.message}`);
  process.exit(1);
}

if (trackedFilesResult.status !== 0) {
  console.error(`git ls-files exited with status ${trackedFilesResult.status}.`);
  process.exit(1);
}

const findings = [];
const trackedFiles = trackedFilesResult.stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

for (const filePath of trackedFiles) {
  try {
    const text = readFileSync(filePath, "utf8");
    findings.push(...findHighConfidenceSecretTokens({ filePath, text }));
  } catch {
    // Ignore binary or unreadable files. Secret scanning targets tracked text sources.
  }
}

if (findings.length > 0) {
  console.error("Secret scan failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Secret scan passed.");
