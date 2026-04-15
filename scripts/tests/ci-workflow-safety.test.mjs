import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ciWorkflowPath = path.resolve(process.cwd(), ".github/workflows/ci.yml");

test("CI workflow stops the built server without pkill", () => {
  const workflow = readFileSync(ciWorkflowPath, "utf8");

  assert.doesNotMatch(workflow, /\bpkill\b/);
  assert.match(workflow, /node scripts\/stop-background-server\.mjs server\.pid/);
});
