import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const indexCss = readFileSync(
  path.resolve(process.cwd(), "client", "src", "index.css"),
  "utf8",
);

test("global reduced-motion contract disables transitions and near-eliminates animations", () => {
  assert.match(indexCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(indexCss, /animation-duration:\s*0\.01ms !important/);
  assert.match(indexCss, /animation-iteration-count:\s*1 !important/);
  assert.match(indexCss, /transition:\s*none !important/);
});
