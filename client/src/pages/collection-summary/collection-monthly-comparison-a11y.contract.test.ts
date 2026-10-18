import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function readClientSource(...segments: string[]): string {
  return readFileSync(path.resolve(process.cwd(), "client", "src", ...segments), "utf8");
}

const loginSource = readClientSource("pages", "Login.tsx");
const setupCardSource = readClientSource(
  "pages",
  "collection-summary",
  "CollectionMonthlyComparisonSetupCard.tsx",
);
const monthFieldSource = readClientSource(
  "pages",
  "collection-summary",
  "CollectionMonthField.tsx",
);

test("login password visibility control has stable accessible names and pressed state", () => {
  assert.match(loginSource, /aria-label=\{t\(showPassword \? "auth\.v17\.hidePassword" : "auth\.v17\.showPassword"\)\}/);
  assert.match(loginSource, /getAriaPressedProps\(showPassword\)/);
  assert.match(loginSource, /aria-controls="login-password"/);
  assert.match(loginSource, /<EyeOff size=\{18\} aria-hidden="true" \/>/);
  assert.match(loginSource, /<Eye size=\{18\} aria-hidden="true" \/>/);
});

test("monthly comparison native quick range select keeps its visible label, selected value and disabled gate", () => {
  assert.match(setupCardSource, /htmlFor="collection-monthly-comparison-quick-range"/);
  assert.match(setupCardSource, /Quick range/);
  const select = setupCardSource.match(/<select\b[\s\S]*?<\/select>/)?.[0];
  assert.ok(select, "Quick ranges retain native keyboard and screen-reader select semantics");
  assert.match(select, /id="collection-monthly-comparison-quick-range"/);
  assert.match(select, /value=\{activeRangePreset\?\.id \|\| ""\}/);
  assert.match(select, /onRangePresetApply\(preset\)/);
  assert.match(select, /disabled=\{loading \|\| !hasAvailableNickname\}/);
  assert.match(select, /<option key=\{preset\.id\} value=\{preset\.id\}>\{preset\.label\}<\/option>/);
  assert.doesNotMatch(select, /aria-pressed/);
});

test("collection month field keeps its label and format hint associated with input", () => {
  assert.match(monthFieldSource, /<label htmlFor=\{id\}/);
  assert.match(monthFieldSource, /const helpId = `\$\{id\}-format`;/);
  assert.match(monthFieldSource, /aria-describedby=\{helpId\}/);
  assert.match(monthFieldSource, /getAriaInvalidProps\(showInvalidState\)/);
  assert.doesNotMatch(monthFieldSource, /"aria-invalid": true/);
  assert.match(monthFieldSource, /id=\{helpId\}/);
});
