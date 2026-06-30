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
  const backendIndex = testScript.indexOf("npm run test:backend");

  assert.notEqual(contractIndex, -1, "npm test must include API contract tests");
  assert.notEqual(backendIndex, -1, "npm test must run backend regression tests through the backend helper");
  assert.ok(contractIndex > testScript.indexOf("npm run test:scripts"));
  assert.ok(contractIndex < backendIndex);
});

test("backend regression helper includes every backend suite in dependency-safe order", () => {
  const scripts = readPackageScripts();
  const backendScript = scripts["test:backend"];
  const expectedSuites = [
    "test:auth",
    "test:http",
    "test:services",
    "test:repositories",
    "test:routes",
    "test:ws",
    "test:intelligence",
  ];

  let previousIndex = -1;
  for (const suiteName of expectedSuites) {
    const suiteIndex = backendScript.indexOf(`npm run ${suiteName}`);

    assert.notEqual(suiteIndex, -1, `test:backend must include ${suiteName}`);
    assert.ok(suiteIndex > previousIndex, `${suiteName} must run in the reviewed order`);
    previousIndex = suiteIndex;
  }
});

test("npm test keeps local regression scope below browser and release-only gates", () => {
  const scripts = readPackageScripts();
  const testScript = scripts.test;

  assert.doesNotMatch(testScript, /test:e2e|test:visual|smoke:ui|release:verify|build/);
});
