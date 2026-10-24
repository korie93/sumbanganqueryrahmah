import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Inventory integrity only; a mapped test is not a verified security control.
// This checks the original plan snapshot. Later scoped runtime results are
// recorded separately in the external audit report, not as all-flows coverage.
const root = fileURLToPath(new URL("../../", import.meta.url));
const matrix = JSON.parse(readFileSync(new URL("flow-matrix.json", import.meta.url), "utf8")) as {
  schemaVersion: number;
  executionStatus: string;
  flows: Array<{ id: string; assertions: string[]; tests: string[]; runtimeGap: string }>;
};

test("audit matrix preserves explicit unexecuted status and distinct workflow families", () => {
  assert.equal(matrix.schemaVersion, 1);
  assert.equal(matrix.executionStatus, "not_run_requires_os_sandbox");
  assert.equal(matrix.flows.length, 16);
  assert.equal(new Set(matrix.flows.map((flow) => flow.id)).size, matrix.flows.length);
});

for (const flow of matrix.flows) {
  test(`audit inventory ${flow.id} references existing tests and discloses its runtime gap`, () => {
    assert.ok(flow.assertions.length > 0);
    assert.ok(flow.runtimeGap.trim().length > 0);
    assert.ok(flow.tests.length > 0);
    for (const relative of flow.tests) {
      assert.equal(path.isAbsolute(relative), false);
      assert.equal(relative.includes("\\"), false);
      assert.equal(relative.split("/").some((part) => part === ".." || part === "." || part === ""), false);
      assert.match(relative, /\.(?:test\.[cm]?[jt]sx?|spec\.[jt]sx?)$/);
      assert.equal(relative.split("/").some((part) => part.startsWith(".env") || part === "artifacts" || part === "uploads"), false);
      assert.equal(existsSync(path.join(root, relative)), true, relative);
    }
  });
}
