import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const releaseWorkflowPath = path.resolve(process.cwd(), ".github/workflows/release-verification.yml");

test("release verification workflow keeps the lightweight load-testing scaffold check enabled", () => {
  const workflow = readFileSync(releaseWorkflowPath, "utf8");

  assert.match(workflow, /Verify load-testing scaffold/);
  assert.match(workflow, /node --test scripts\/tests\/load-testing-contract\.test\.mjs/);
});
