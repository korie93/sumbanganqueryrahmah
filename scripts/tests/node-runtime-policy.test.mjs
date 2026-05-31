import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Node runtime policy stays on the supported 24.x LTS line", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const nvmrc = readFileSync(".nvmrc", "utf8").trim();
  const verifyScript = readFileSync("scripts/verify-node-version.mjs", "utf8");

  assert.equal(packageJson.engines.node, ">=24 <25");
  assert.equal(packageLock.packages[""].engines.node, ">=24 <25");
  assert.equal(nvmrc, "24");
  assert.match(verifyScript, /Node\.js \$\{supportedMajor\}\.x LTS/);
});

