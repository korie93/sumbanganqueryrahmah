import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const rootDir = process.cwd();

function readRepoFile(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("package browserslist declares the supported modern browser matrix", () => {
  const packageJson = JSON.parse(readRepoFile("package.json"));

  assert.deepEqual(packageJson.browserslist.production, [
    "Chrome >= 120",
    "Edge >= 120",
    "Firefox >= 121",
    "Safari >= 17.4",
    "ios_saf >= 17.4",
    "not dead",
    "not op_mini all",
  ]);
  assert.ok(packageJson.browserslist.development.includes("last 1 Chrome version"));
});

test("browser support documentation covers CI, fallbacks, and unsupported browsers", () => {
  const docs = readRepoFile("docs/BROWSER_SUPPORT.md");

  for (const phrase of [
    "Chrome",
    "Microsoft Edge",
    "Firefox",
    "Safari",
    "CI Coverage",
    "Polyfills And Fallbacks",
    "Unsupported browsers",
    "Adding A Browser Target",
  ]) {
    assert.match(docs, new RegExp(phrase));
  }
});
