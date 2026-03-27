import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { findPotentialCommittedSmtpSecrets } from "./lib/repo-hygiene.mjs";

const forbiddenEnvFiles = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
];

const requiredGitignoreEntries = [
  ".env",
  ".env.*",
  "!.env.example",
  "artifacts/",
  "var/perf/",
];

const generatedOutputPaths = [
  "artifacts",
  "var/perf",
];

const failures = [];

if (!existsSync(".env.example")) {
  failures.push("Missing required .env.example file.");
}

if (!existsSync(".gitignore")) {
  failures.push("Missing .gitignore file.");
} else {
  const gitignore = readFileSync(".gitignore", "utf8");
  for (const entry of requiredGitignoreEntries) {
    if (!gitignore.includes(entry)) {
      failures.push(`.gitignore is missing required entry: ${entry}`);
    }
  }
}

const gitCommand = process.platform === "win32" ? "git.exe" : "git";
const trackedFilesResult = spawnSync(
  gitCommand,
  ["ls-files", "--", ...forbiddenEnvFiles],
  { encoding: "utf8" },
);

if (trackedFilesResult.error) {
  failures.push(`Unable to inspect tracked files: ${trackedFilesResult.error.message}`);
} else if (trackedFilesResult.status !== 0) {
  failures.push(`git ls-files exited with status ${trackedFilesResult.status}.`);
} else {
  const trackedFiles = trackedFilesResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (trackedFiles.length > 0) {
    failures.push(`Forbidden env files are tracked by git: ${trackedFiles.join(", ")}`);
  }
}

const trackedGeneratedOutputsResult = spawnSync(
  gitCommand,
  ["ls-files", "--", ...generatedOutputPaths],
  { encoding: "utf8" },
);

if (trackedGeneratedOutputsResult.error) {
  failures.push(`Unable to inspect generated output paths: ${trackedGeneratedOutputsResult.error.message}`);
} else if (trackedGeneratedOutputsResult.status !== 0) {
  failures.push(`git ls-files for generated output paths exited with status ${trackedGeneratedOutputsResult.status}.`);
} else {
  const trackedGeneratedOutputs = trackedGeneratedOutputsResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (trackedGeneratedOutputs.length > 0) {
    failures.push(
      `Generated output should not be tracked by git: ${trackedGeneratedOutputs.join(", ")}`,
    );
  }
}

const allTrackedFilesResult = spawnSync(
  gitCommand,
  ["ls-files"],
  { encoding: "utf8" },
);

if (allTrackedFilesResult.error) {
  failures.push(`Unable to inspect tracked repository files: ${allTrackedFilesResult.error.message}`);
} else if (allTrackedFilesResult.status !== 0) {
  failures.push(`git ls-files for tracked repository files exited with status ${allTrackedFilesResult.status}.`);
} else {
  const trackedFiles = allTrackedFilesResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const smtpSecretFindings = [];
  for (const filePath of trackedFiles) {
    try {
      const text = readFileSync(filePath, "utf8");
      smtpSecretFindings.push(
        ...findPotentialCommittedSmtpSecrets({ filePath, text }),
      );
    } catch {
      // Ignore binary or unreadable files. Hygiene scanning targets text sources only.
    }
  }

  if (smtpSecretFindings.length > 0) {
    failures.push(
      `Potential committed SMTP secrets detected: ${smtpSecretFindings.join("; ")}`,
    );
  }
}

if (failures.length > 0) {
  console.error("Repository hygiene check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Repository hygiene check passed.");
