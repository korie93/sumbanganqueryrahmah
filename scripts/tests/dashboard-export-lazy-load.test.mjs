import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";

const dashboardUtilsPath = path.resolve(
  process.cwd(),
  "client/src/pages/dashboard/utils.ts",
);

test("dashboard export keeps html2canvas behind a lazy retryable import", async () => {
  const source = await fs.readFile(dashboardUtilsPath, "utf8");

  assert.match(source, /createRetryableModuleLoader<[^>]+>\(\s*async \(\) => \(await import\("html2canvas"\)\)\.default/s);
  assert.doesNotMatch(source, /import\s+html2canvas\s+from\s+"html2canvas"/);
});
