import path from "node:path";
import { readdirSync, readFileSync } from "node:fs";

const SERVER_ROOT = "server";
const SCANNED_EXTENSIONS = new Set([".ts"]);
const JSON_PARSE_ALLOWLIST = new Set([
  "server/lib/safe-json.ts",
]);

function normalizeFilePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function isIgnoredServerFile(filePath) {
  return /\/tests\/|\.test\.[cm]?[jt]sx?$|\.spec\.[cm]?[jt]sx?$/.test(filePath);
}

function isRelevantServerSourceFile(filePath) {
  const normalized = normalizeFilePath(filePath);
  return normalized.startsWith(`${SERVER_ROOT}/`)
    && SCANNED_EXTENSIONS.has(path.extname(normalized))
    && !isIgnoredServerFile(normalized);
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

export function findDisallowedServerJsonParsing(params) {
  const filePath = normalizeFilePath(params?.filePath);
  const text = String(params?.text || "");

  if (!isRelevantServerSourceFile(filePath) || JSON_PARSE_ALLOWLIST.has(filePath)) {
    return [];
  }

  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/\bJSON\s*\.\s*parse\s*\(/.test(line)) {
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

export function collectServerJsonParsingContractMatches(params = {}) {
  const repoRoot = params.repoRoot || process.cwd();
  const serverRoot = path.join(repoRoot, SERVER_ROOT);
  const matches = [];
  let fileCount = 0;

  walkDirectory(serverRoot, (resolvedPath) => {
    const filePath = normalizeFilePath(path.relative(repoRoot, resolvedPath));
    if (!isRelevantServerSourceFile(filePath)) {
      return;
    }

    fileCount += 1;
    const text = readFileSync(resolvedPath, "utf8");
    matches.push(...findDisallowedServerJsonParsing({
      filePath,
      text,
    }));
  });

  return {
    matches,
    summary: {
      fileCount,
      serverRoot: SERVER_ROOT,
      allowedFiles: Array.from(JSON_PARSE_ALLOWLIST).sort(),
    },
  };
}

export function formatServerJsonParsingContractReport(result) {
  const matches = result?.matches || [];
  const summary = result?.summary || {};
  const inspected = `Server JSON parsing contract inspected ${summary.fileCount || 0} server source files.`;

  if (matches.length === 0) {
    return [
      inspected,
      "Server source routes raw JSON parsing through server/lib/safe-json.ts.",
    ].join("\n");
  }

  return [
    inspected,
    "Disallowed raw JSON.parse found in server sources:",
    ...matches.map((match) => `- ${match.filePath}:${match.lineNumber} ${match.snippet}`),
  ].join("\n");
}
