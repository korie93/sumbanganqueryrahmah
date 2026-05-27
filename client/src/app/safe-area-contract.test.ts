import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientSrcRoot = path.resolve(__dirname, "..");
const allowedDirectEnvFile = path.resolve(clientSrcRoot, "theme-tokens.css");
const directSafeAreaEnvMarker = "env(" + "safe-area";
const sourceExtensions = new Set([".css", ".ts", ".tsx"]);

function walkSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry);
    const stats = statSync(entryPath);

    if (stats.isDirectory()) {
      files.push(...walkSourceFiles(entryPath));
      continue;
    }

    if (sourceExtensions.has(path.extname(entryPath))) {
      files.push(entryPath);
    }
  }

  return files;
}

function readClientSource(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

test("safe-area env calls are centralized in theme tokens", () => {
  const offenders = walkSourceFiles(clientSrcRoot)
    .filter((sourcePath) => sourcePath !== allowedDirectEnvFile)
    .filter((sourcePath) => readFileSync(sourcePath, "utf8").includes(directSafeAreaEnvMarker));

  assert.deepEqual(offenders.map((sourcePath) => path.relative(clientSrcRoot, sourcePath)), []);
});

test("mobile sticky and sheet surfaces use the shared safe-area token", () => {
  const sourcePaths = [
    "../pages/general-search/GeneralSearchMobileControls.tsx",
    "../pages/general-search/GeneralSearchAdvancedControls.tsx",
    "../pages/settings/SettingsSaveBar.tsx",
    "../pages/collection/CollectionDailyDayDetailsFooter.tsx",
    "../components/layout/SideTabDataPanel.tsx",
  ];

  for (const sourcePath of sourcePaths) {
    const source = readClientSource(sourcePath);

    assert.match(source, /var\(--safe-area-inset-bottom\)/);
    assert.doesNotMatch(source, /env\(safe-area-inset-bottom/);
  }
});
