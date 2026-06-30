import path from "node:path";
import { readdirSync, readFileSync } from "node:fs";

const CLIENT_SOURCE_ROOT = "client/src";
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORED_FILE_SUFFIXES = [".test.ts", ".test.tsx", ".d.ts"];
const JSON_PARSE_ALLOWLIST = new Set([
  "client/src/lib/utils/safe-json.ts",
]);

export const CLIENT_JSON_PARSING_RULES = [
  {
    label: "client source routes Response JSON through bounded API readers",
    pattern: /\.\s*json\s*\(/,
    isAllowed: () => false,
  },
  {
    label: "client source routes JSON.parse through safe-json helpers",
    pattern: /\bJSON\s*\.\s*parse\s*\(/,
    isAllowed: (filePath) => JSON_PARSE_ALLOWLIST.has(filePath),
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

export function collectClientJsonParsingContractMatches(params = {}) {
  const repoRoot = params.repoRoot || process.cwd();
  const sourceRoot = path.join(repoRoot, CLIENT_SOURCE_ROOT);
  const files = walkFiles(sourceRoot);
  const matches = [];

  for (const absolutePath of files) {
    const filePath = path.relative(repoRoot, absolutePath).split(path.sep).join("/");
    const text = readFileSync(absolutePath, "utf8");

    for (const rule of CLIENT_JSON_PARSING_RULES) {
      const matched = text.match(rule.pattern);
      if (matched && !rule.isAllowed(filePath)) {
        matches.push({
          filePath,
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
      ruleCount: CLIENT_JSON_PARSING_RULES.length,
    },
  };
}

export function formatClientJsonParsingContractReport(result) {
  const matches = result?.matches || [];
  const summary = result?.summary || {};
  const inspected = `Client JSON parsing contract inspected ${summary.fileCount || 0} client files against ${summary.ruleCount || 0} parsing rules.`;

  if (matches.length === 0) {
    return `${inspected}\nClient source routes API/local parsing through bounded safe-json helpers.`;
  }

  return [
    inspected,
    "Client JSON parsing contract failures:",
    ...matches.map((match) => `- ${match.filePath}: ${match.label} (${match.snippet})`),
  ].join("\n");
}
