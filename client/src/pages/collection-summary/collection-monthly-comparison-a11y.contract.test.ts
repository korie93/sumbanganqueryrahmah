import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function readClientSource(...segments: string[]): string {
  return readFileSync(path.resolve(process.cwd(), "client", "src", ...segments), "utf8");
}

const loginPartsSource = readClientSource("pages", "LoginParts.tsx");
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
  assert.match(loginPartsSource, /aria-label="Sembunyi kata laluan"/);
  assert.match(loginPartsSource, /aria-label="Papar kata laluan"/);
  assert.match(loginPartsSource, /aria-pressed="true"/);
  assert.match(loginPartsSource, /aria-pressed="false"/);
  assert.match(loginPartsSource, /<EyeOff className="h-5 w-5" aria-hidden="true" focusable="false" \/>/);
  assert.match(loginPartsSource, /<Eye className="h-5 w-5" aria-hidden="true" focusable="false" \/>/);
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
