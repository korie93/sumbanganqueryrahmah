import path from "node:path";
import { readdirSync, readFileSync } from "node:fs";

const SERVER_ROOT = "server";
const ALLOWED_DIRECT_ENV_ACCESS_FILES = new Set([
  "server/config/runtime-env-schema.ts",
  "server/config/runtime-config-read-utils.ts",
  "server/config/runtime-environment.ts",
  "server/lib/collection-receipt-external-scan.ts",
]);

function normalizeFilePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function isIgnoredServerFile(filePath) {
  return /\/tests\/|\.test\.[cm]?[jt]sx?$|\.spec\.[cm]?[jt]sx?$/.test(filePath);
}

function isRelevantServerSourceFile(filePath) {
  const normalized = normalizeFilePath(filePath);
  return normalized.startsWith(`${SERVER_ROOT}/`) && normalized.endsWith(".ts") && !isIgnoredServerFile(normalized);
}

function walkDirectory(directoryPath, visitor) {
  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const resolvedPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      walkDirectory(resolvedPath, visitor);
      continue;
    }
    visitor(resolvedPath);
  }
}

export function findDisallowedServerEnvAccess(params) {
  const filePath = normalizeFilePath(params?.filePath);
  const text = String(params?.text || "");

  if (!isRelevantServerSourceFile(filePath) || ALLOWED_DIRECT_ENV_ACCESS_FILES.has(filePath)) {
    return [];
  }

  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/\bprocess\.env\b/.test(line)) {
      continue;
    }

    findings.push({
      filePath,
      lineNumber: index + 1,
      snippet: line.trim(),
    });
  }

  return findings;
}

export function collectServerEnvAccessContractMatches(params = {}) {
  const repoRoot = params.repoRoot || process.cwd();
  const serverRoot = path.join(repoRoot, SERVER_ROOT);
  const matches = [];

  walkDirectory(serverRoot, (resolvedPath) => {
    const relativePath = normalizeFilePath(path.relative(repoRoot, resolvedPath));
    if (!isRelevantServerSourceFile(relativePath)) {
      return;
    }

    const text = readFileSync(resolvedPath, "utf8");
    matches.push(...findDisallowedServerEnvAccess({
      filePath: relativePath,
      text,
    }));
  });

  return {
    matches,
    summary: {
      serverRoot: SERVER_ROOT,
      allowedFiles: Array.from(ALLOWED_DIRECT_ENV_ACCESS_FILES).sort(),
    },
  };
}

export function formatServerEnvAccessContractReport(result) {
  const matches = result?.matches || [];
  const summary = result?.summary || {};
  const inspected = `Server env access contract inspected ${summary.serverRoot || SERVER_ROOT}.`;

  if (matches.length === 0) {
    return [
      inspected,
      "Direct process.env access remains confined to the allowlisted server config helpers.",
    ].join("\n");
  }

  return [
    inspected,
    "Disallowed direct process.env access found in server sources:",
    ...matches.map((match) => `- ${match.filePath}:${match.lineNumber} ${match.snippet}`),
  ].join("\n");
}
