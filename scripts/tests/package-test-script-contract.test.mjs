import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readPackageScripts() {
  return JSON.parse(readFileSync("package.json", "utf8")).scripts;
}

test("npm test includes the API contract gate before backend regression suites", () => {
  const scripts = readPackageScripts();
  const testScript = scripts.test;
  const contractIndex = testScript.indexOf("npm run test:contracts");

  assert.notEqual(contractIndex, -1, "npm test must include API contract tests");
  assert.ok(contractIndex > testScript.indexOf("npm run test:scripts"));
  assert.ok(contractIndex < testScript.indexOf("npm run test:auth"));
  assert.ok(contractIndex < testScript.indexOf("npm run test:http"));
});

test("npm test keeps local regression scope below browser and release-only gates", () => {
  const scripts = readPackageScripts();
  const testScript = scripts.test;

  assert.doesNotMatch(testScript, /test:e2e|test:visual|smoke:ui|release:verify|build/);
});
