import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");
const analyzerScriptPath = path.join(rootDir, "scripts", "analyze-client-bundle.mjs");

test("bundle analysis hook stays available as an opt-in script", async () => {
  const [packageJsonRaw, analyzerSource] = await Promise.all([
    fs.readFile(packageJsonPath, "utf8"),
    fs.readFile(analyzerScriptPath, "utf8"),
  ]);
  const packageJson = JSON.parse(packageJsonRaw);

  assert.equal(
    packageJson.scripts["analyze:bundle"],
    "npm run build && node scripts/analyze-client-bundle.mjs",
  );
  assert.match(analyzerSource, /Client bundle composition report/);
  assert.match(analyzerSource, /Entry script:/);
});
