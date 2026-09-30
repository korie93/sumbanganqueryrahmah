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

test("monthly comparison quick range controls expose group and pressed semantics", () => {
  assert.match(setupCardSource, /role="group"\s*aria-label="Quick monthly comparison ranges"/s);
  assert.match(setupCardSource, /aria-label=\{`Apply quick range \$\{preset\.label\}`\}/);
  assert.match(setupCardSource, /const pressedProps = active/);
  assert.match(setupCardSource, /"aria-pressed": "true" as const/);
  assert.match(setupCardSource, /"aria-pressed": "false" as const/);
  assert.match(setupCardSource, /\{\.\.\.pressedProps\}/);
  assert.doesNotMatch(setupCardSource, /aria-pressed=\{active\}/);
});

test("collection month field keeps its label and format hint associated with input", () => {
  assert.match(monthFieldSource, /<label htmlFor=\{id\}/);
  assert.match(monthFieldSource, /const helpId = `\$\{id\}-format`;/);
  assert.match(monthFieldSource, /aria-describedby=\{helpId\}/);
  assert.match(monthFieldSource, /getAriaInvalidProps\(showInvalidState\)/);
  assert.doesNotMatch(monthFieldSource, /"aria-invalid": true/);
  assert.match(monthFieldSource, /id=\{helpId\}/);
});
