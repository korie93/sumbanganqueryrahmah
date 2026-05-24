import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  formatCspHashArray,
  generateReactRemoveScrollBarStyleHashes,
} from "./lib/react-remove-scroll-csp-hashes.mjs";

const sourcePath = path.resolve(process.cwd(), "server", "internal", "local-http-security.ts");
const writeMode = process.argv.includes("--write");
const arrayPattern =
  /const REACT_REMOVE_SCROLL_BAR_STYLE_HASHES = \[\n(?<body>[\s\S]*?)\n\];/;

function extractExistingHashes(source) {
  const match = source.match(arrayPattern);
  if (!match?.groups?.body) {
    throw new Error("Unable to find REACT_REMOVE_SCROLL_BAR_STYLE_HASHES in local-http-security.ts.");
  }

  return {
    body: match.groups.body,
    hashes: Array.from(match.groups.body.matchAll(/"('sha256-[^"]+')"|('sha256-[^']+')/g))
      .map((hashMatch) => hashMatch[1] || hashMatch[2])
      .filter(Boolean),
  };
}

const source = await readFile(sourcePath, "utf8");
const existing = extractExistingHashes(source);
const generated = generateReactRemoveScrollBarStyleHashes();

if (JSON.stringify(existing.hashes) === JSON.stringify(generated.hashes)) {
  console.log(
    `React Remove Scroll CSP hashes are current for react-remove-scroll-bar ${generated.version}.`,
  );
  process.exit(0);
}

if (writeMode) {
  const nextSource = source.replace(
    arrayPattern,
    `const REACT_REMOVE_SCROLL_BAR_STYLE_HASHES = [\n${formatCspHashArray(generated.hashes)}\n];`,
  );
  await writeFile(sourcePath, nextSource, "utf8");
  console.log(
    `Updated React Remove Scroll CSP hashes for react-remove-scroll-bar ${generated.version}.`,
  );
  process.exit(0);
}

console.error(
  [
    "React Remove Scroll CSP hashes are out of date.",
    `Dependency version: react-remove-scroll-bar ${generated.version}`,
    "Run: npm run verify:csp-hashes -- --write",
  ].join("\n"),
);
process.exit(1);
