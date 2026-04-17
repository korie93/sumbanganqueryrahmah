import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const runtimeEnvironmentPath = path.join(rootDir, "server", "internal", "local-runtime-environment.ts");

test("local runtime environment keeps critical close-hook cleanup wired to the HTTP server", async () => {
  const source = await fs.readFile(runtimeEnvironmentPath, "utf8");

  assert.match(source, /server\.once\("close", composition\.stopTabVisibilityCacheSweep\);/);
  assert.match(source, /server\.once\("close", stopAdaptiveRateStateSweep\);/);
  assert.match(source, /server\.once\("close", stopAiConcurrencyGate\);/);
});
