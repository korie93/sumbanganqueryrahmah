import path from "node:path";
import { readdirSync, readFileSync } from "node:fs";

const CLIENT_SOURCE_ROOT = "client/src";
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORED_FILE_SUFFIXES = [".test.ts", ".test.tsx"];
const ALLOWLISTED_REACT_LAZY_FILES = new Set([
  "client/src/lib/lazy-with-preload.ts",
]);

const RAW_LAZY_RULES = [
  {
    label: "client source must route lazy component loading through lazyWithPreload instead of lazy(...)",
    pattern: /(?<![\w.])lazy\s*\(/,
  },
  {
    label: "client source must route lazy component loading through lazyWithPreload instead of React.lazy(...)",
    pattern: /\bReact\.lazy\s*\(/,
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

export function loadClientLazyLoaderContractFiles(params = {}) {
  const repoRoot = params.cwd || process.cwd();
  const sourceRoot = path.join(repoRoot, CLIENT_SOURCE_ROOT);
  const files = walkFiles(sourceRoot);

  return Object.fromEntries(
    files.map((absolutePath) => {
      const relativePath = path.relative(repoRoot, absolutePath).split(path.sep).join("/");
      return [relativePath, readFileSync(absolutePath, "utf8")];
    }),
  );
}

export function validateClientLazyLoaderContract(params = {}) {
  const filesByPath = params.filesByPath || {};
  const matches = [];
  let inspectedFileCount = 0;

  for (const [filePath, text] of Object.entries(filesByPath)) {
    inspectedFileCount += 1;

    if (ALLOWLISTED_REACT_LAZY_FILES.has(filePath)) {
      continue;
    }

    for (const rule of RAW_LAZY_RULES) {
      const matched = text.match(rule.pattern);
      if (!matched) {
        continue;
      }

      matches.push({
        filePath,
        label: rule.label,
        snippet: matched[0],
      });
    }
  }

  return {
    failures: matches.map((match) => `${match.filePath}: ${match.label} (${match.snippet})`),
    matches,
    summary: {
      allowlistedFileCount: ALLOWLISTED_REACT_LAZY_FILES.size,
      fileCount: inspectedFileCount,
      ruleCount: RAW_LAZY_RULES.length,
    },
  };
}

export function formatClientLazyLoaderContractReport(result) {
  const failures = result?.failures || [];
  const summary = result?.summary || {};
  const inspected =
    `Client lazy-loader contract inspected ${summary.fileCount || 0} client source files ` +
    `against ${summary.ruleCount || 0} raw lazy rules ` +
    `with ${summary.allowlistedFileCount || 0} allowlisted loader implementation file.`;

  if (failures.length === 0) {
    return `${inspected}\nClient lazy-loaded surfaces now route through lazyWithPreload with retryable imports.`;
  }

  return [
    inspected,
    "Client lazy-loader contract failures:",
    ...failures.map((failure) => `- ${failure}`),
  ].join("\n");
}

export {
  ALLOWLISTED_REACT_LAZY_FILES,
  CLIENT_SOURCE_ROOT,
  RAW_LAZY_RULES,
};
