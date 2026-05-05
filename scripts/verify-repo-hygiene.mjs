import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  findForbiddenTypeScriptTypeSafetyPatterns,
  findPotentialCommittedSmtpSecrets,
  findTrackedForbiddenEnvFiles,
  findTrackedGeneratedOutputs,
  findUnsafeAutomationKillPatterns,
} from "./lib/repo-hygiene.mjs";

const requiredGitignoreEntries = [
  ".env",
  ".env.*",
  "!.env.example",
  "artifacts/",
  "coverage/",
  "dist-local/",
  "output/",
  "uploads/",
  "var/",
  "var/perf/",
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
  const typeSafetyFindings = [];
  const automationKillFindings = [];
  const forbiddenEnvFiles = findTrackedForbiddenEnvFiles({ trackedFiles });
  const trackedGeneratedOutputs = findTrackedGeneratedOutputs({ trackedFiles });

  if (forbiddenEnvFiles.length > 0) {
    failures.push(`Forbidden env files are tracked by git: ${forbiddenEnvFiles.join(", ")}`);
  }

  if (trackedGeneratedOutputs.length > 0) {
    failures.push(
      `Generated output should not be tracked by git: ${trackedGeneratedOutputs.join(", ")}`,
    );
  }

  for (const filePath of trackedFiles) {
    try {
      const text = readFileSync(filePath, "utf8");
      smtpSecretFindings.push(
        ...findPotentialCommittedSmtpSecrets({ filePath, text }),
      );
      automationKillFindings.push(
        ...findUnsafeAutomationKillPatterns({ filePath, text }),
      );
      if (/\.(?:ts|tsx)$/i.test(filePath)) {
        typeSafetyFindings.push(
          ...findForbiddenTypeScriptTypeSafetyPatterns({ filePath, text }),
        );
      }
    } catch {
      // Ignore binary or unreadable files. Hygiene scanning targets text sources only.
    }
  }

  if (smtpSecretFindings.length > 0) {
    failures.push(
      `Potential committed SMTP secrets detected: ${smtpSecretFindings.join("; ")}`,
    );
  }

  if (typeSafetyFindings.length > 0) {
    failures.push(
      `Forbidden TypeScript type-safety regressions detected: ${typeSafetyFindings.join("; ")}`,
    );
  }

  if (automationKillFindings.length > 0) {
    failures.push(
      `Unsafe broad automation process kills detected: ${automationKillFindings.join("; ")}`,
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
