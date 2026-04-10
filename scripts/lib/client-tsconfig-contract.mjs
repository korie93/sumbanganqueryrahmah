import path from "node:path";
import { readdirSync, readFileSync } from "node:fs";

const CLIENT_TSCONFIG_PATH = "client/tsconfig.json";
const CLIENT_SOURCE_ROOT = "client/src";
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx"]);
const TS_EXTENSION_IMPORT_PATTERN =
  /\b(?:from\s+["']([^"']+\.(?:ts|tsx))["']|import\s*\(\s*["']([^"']+\.(?:ts|tsx))["']\s*\))/g;

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

    files.push(absolutePath);
  }

  return files;
}

export function collectClientTsconfigContractMatches(params = {}) {
  const repoRoot = params.repoRoot || process.cwd();
  const tsconfigPath = path.join(repoRoot, CLIENT_TSCONFIG_PATH);
  const sourceRoot = path.join(repoRoot, CLIENT_SOURCE_ROOT);
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
  const files = walkFiles(sourceRoot);
  const matches = [];

  if (tsconfig?.compilerOptions?.allowImportingTsExtensions === true) {
    matches.push({
      filePath: CLIENT_TSCONFIG_PATH,
      label: "client tsconfig must not enable allowImportingTsExtensions",
      snippet: '"allowImportingTsExtensions": true',
    });
  }

  for (const absolutePath of files) {
    const relativePath = path.relative(repoRoot, absolutePath).split(path.sep).join("/");
    const text = readFileSync(absolutePath, "utf8");
    const specifiers = new Set();
    let matched;

    while ((matched = TS_EXTENSION_IMPORT_PATTERN.exec(text)) !== null) {
      const specifier = matched[1] || matched[2];
      if (specifier) {
        specifiers.add(specifier);
      }
    }

    TS_EXTENSION_IMPORT_PATTERN.lastIndex = 0;

    for (const specifier of specifiers) {
      matches.push({
        filePath: relativePath,
        label: "client source must not import .ts/.tsx specifiers",
        snippet: specifier,
      });
    }
  }

  return {
    matches,
    summary: {
      fileCount: files.length,
      tsconfigPath: CLIENT_TSCONFIG_PATH,
    },
  };
}

export function formatClientTsconfigContractReport(result) {
  const matches = result?.matches || [];
  const summary = result?.summary || {};
  const inspected = `Client tsconfig contract inspected ${summary.fileCount || 0} source files and ${summary.tsconfigPath || CLIENT_TSCONFIG_PATH}.`;

  if (matches.length === 0) {
    return `${inspected}\nClient tsconfig no longer depends on allowImportingTsExtensions and client source avoids .ts/.tsx import specifiers.`;
  }

  return [
    inspected,
    "Client tsconfig contract failures:",
    ...matches.map((match) => `- ${match.filePath}: ${match.label} (${match.snippet})`),
  ].join("\n");
}
