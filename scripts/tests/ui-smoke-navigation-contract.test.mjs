import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const smokeSource = readFileSync(
  path.join(repoRoot, "scripts", "ui-smoke.mjs"),
  "utf8",
);

test("UI smoke navigation avoids networkidle for authenticated SPA routes", () => {
  assert.match(smokeSource, /const navigateForSmoke = async \(page, routeOrUrl\) =>/);
  assert.match(smokeSource, /waitUntil: "domcontentloaded"/);
  assert.match(smokeSource, /const waitForSmokeDocumentReady = async \(page\) =>/);
  assert.match(smokeSource, /timeout: SMOKE_LOAD_STATE_TIMEOUT_MS/);
  assert.doesNotMatch(smokeSource, /networkidle/);
});
