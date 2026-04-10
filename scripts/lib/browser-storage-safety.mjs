import path from "node:path";
import { readdirSync, readFileSync } from "node:fs";

const CLIENT_SOURCE_ROOT = "client/src";
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORED_FILE_SUFFIXES = [".test.ts", ".test.tsx"];

export const BROWSER_STORAGE_SAFETY_RULES = [
  {
    label: "client source avoids direct localStorage property access",
    pattern: /\blocalStorage\.(getItem|setItem|removeItem)\s*\(/,
  },
];

function walkFiles(rootDir) {
  const entries = readdirSync(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(absolutePath));
      continue;
    }

    const extension = path.extname(entry.name);
    if (!SCANNED_EXTENSIONS.has(extension)) {
      continue;
    }
    if (IGNORED_FILE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

export function collectBrowserStorageSafetyMatches(params = {}) {
  const repoRoot = params.repoRoot || process.cwd();
  const sourceRoot = path.join(repoRoot, CLIENT_SOURCE_ROOT);
  const files = walkFiles(sourceRoot);
  const matches = [];

  for (const absolutePath of files) {
    const relativePath = path.relative(repoRoot, absolutePath).split(path.sep).join("/");
    const text = readFileSync(absolutePath, "utf8");

    for (const rule of BROWSER_STORAGE_SAFETY_RULES) {
      const matched = text.match(rule.pattern);
      if (matched) {
        matches.push({
          filePath: relativePath,
          label: rule.label,
          snippet: matched[0],
        });
      }
    }
  }

  return {
    matches,
    summary: {
      fileCount: files.length,
      ruleCount: BROWSER_STORAGE_SAFETY_RULES.length,
    },
  };
}

export function formatBrowserStorageSafetyReport(result) {
  const matches = result?.matches || [];
  const summary = result?.summary || {};
  const inspected = `Browser storage safety inspected ${summary.fileCount || 0} client files against ${summary.ruleCount || 0} direct-access rules.`;

  if (matches.length === 0) {
    return `${inspected}\nClient source now routes localStorage access through browser-storage safety helpers.`;
  }

  return [
    inspected,
    "Browser storage safety failures:",
    ...matches.map((match) => `- ${match.filePath}: ${match.label} (${match.snippet})`),
  ].join("\n");
}
