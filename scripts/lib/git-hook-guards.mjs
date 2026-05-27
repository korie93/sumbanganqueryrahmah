import { basename } from "node:path/posix";
import { findHighConfidenceSecretTokens } from "./repo-hygiene.mjs";

const GENERIC_SECRET_ASSIGNMENT_PATTERN =
  /^\s*([A-Z0-9_.-]*(?:API[_-]?KEY|PASSWORD|PRIVATE[_-]?KEY|SECRET|TOKEN)[A-Z0-9_.-]*)\s*[:=]\s*(.*?)\s*$/i;

const ALLOWED_HOOK_SECRET_VALUES = [
  /^$/,
  /^null$/i,
  /^undefined$/i,
  /^redacted$/i,
  /^example$/i,
  /example/i,
  /placeholder/i,
  /generate_me/i,
  /change_me/i,
  /do_not_use/i,
  /ganti-dengan/i,
  /kata-laluan/i,
  /\$\{\{\s*secrets\.[^}]+\}\}/i,
  /\$\{\{\s*github\.[^}]+\}\}/i,
  /^\$[A-Z0-9_]+$/i,
  /^\$\{[A-Z0-9_]+\}$/i,
  /^process\.env\.[A-Z0-9_]+$/i,
];

export const CONVENTIONAL_COMMIT_PATTERN =
  /^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|security)(?:\([a-z0-9-]+\))?!?: .{1,120}$/;

function normalizeRepoPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function normalizeSecretValue(rawValue) {
  return String(rawValue || "")
    .trim()
    .replace(/\s+#.*$/u, "")
    .replace(/[;,]\s*$/u, "")
    .replace(/^['"`]|['"`]$/gu, "");
}

function isAllowedHookSecretValue(rawValue) {
  const value = normalizeSecretValue(rawValue);
  return ALLOWED_HOOK_SECRET_VALUES.some((pattern) => pattern.test(value));
}

export function isForbiddenEnvFilePath(filePath) {
  const fileName = basename(normalizeRepoPath(filePath));
  return (fileName === ".env" || fileName.startsWith(".env."))
    && fileName !== ".env.example";
}

export function isForbiddenPrivateMaterialPath(filePath) {
  const normalized = normalizeRepoPath(filePath);
  return /(?:^|\/)secrets\//i.test(normalized)
    || /\.(?:key|pem)$/i.test(normalized);
}

export function findGenericSecretAssignments({ filePath, text }) {
  const normalizedFilePath = normalizeRepoPath(filePath);
  const findings = [];
  const lines = String(text || "").split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(GENERIC_SECRET_ASSIGNMENT_PATTERN);
    if (!match) {
      continue;
    }

    const key = match[1];
    const value = match[2];
    if (isAllowedHookSecretValue(value)) {
      continue;
    }

    findings.push(`${normalizedFilePath}:${index + 1} possible committed secret assignment via ${key}`);
  }

  return findings;
}

export function findPreCommitSecretFindings({ files }) {
  const findings = [];

  for (const file of files) {
    const filePath = normalizeRepoPath(file.filePath);
    if (!filePath) {
      continue;
    }

    if (isForbiddenEnvFilePath(filePath)) {
      findings.push(`${filePath} is a forbidden environment file. Commit .env.example only.`);
    }

    if (isForbiddenPrivateMaterialPath(filePath)) {
      findings.push(`${filePath} is private key/secret material and must not be committed.`);
    }

    const text = String(file.text || "");
    findings.push(...findHighConfidenceSecretTokens({ filePath, text }));
    findings.push(...findGenericSecretAssignments({ filePath, text }));
  }

  return findings;
}

export function isAllowedNonConventionalCommitMessage(message) {
  const normalized = String(message || "").trim();
  return normalized.startsWith("Merge ")
    || normalized.startsWith("Revert ")
    || normalized.startsWith("fixup! ")
    || normalized.startsWith("squash! ");
}

export function validateCommitMessage(message) {
  const normalized = String(message || "").trim();
  if (!normalized) {
    return "Commit message is empty.";
  }
  if (CONVENTIONAL_COMMIT_PATTERN.test(normalized) || isAllowedNonConventionalCommitMessage(normalized)) {
    return null;
  }

  return "Commit message must use Conventional Commits, for example: fix(scope): concise message";
}
