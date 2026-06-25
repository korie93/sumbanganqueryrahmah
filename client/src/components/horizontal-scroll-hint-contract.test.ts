import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = readFileSync(path.join(repoRoot, "client/src/components/HorizontalScrollHint.tsx"), "utf8");
const globalStyles = readFileSync(path.join(repoRoot, "client/src/index.css"), "utf8");

test("horizontal scroll hint hides touch scrollbars without disabling horizontal overflow", () => {
  assert.match(source, /"horizontal-scroll-hint overflow-x-auto"/);
  assert.match(globalStyles, /\.horizontal-scroll-hint\s*\{[\s\S]*-ms-overflow-style:\s*none;/);
  assert.match(globalStyles, /\.horizontal-scroll-hint\s*\{[\s\S]*scrollbar-width:\s*none;/);
  assert.match(globalStyles, /\.horizontal-scroll-hint::-webkit-scrollbar\s*\{[\s\S]*display:\s*none;/);
});

test("horizontal scroll hint can expose a visible keyboard-accessible data viewport", () => {
  assert.match(source, /showScrollbar\?: boolean/);
  assert.match(source, /horizontal-scroll-hint--visible scrollbar-visible/);
  assert.match(source, /role=\{ariaLabel \? "region" : undefined\}/);
  assert.match(source, /tabIndex=\{ariaLabel \? 0 : undefined\}/);
  assert.match(
    globalStyles,
    /\.horizontal-scroll-hint\.horizontal-scroll-hint--visible\s*\{[\s\S]*scrollbar-width:\s*thin;/,
  );
  assert.match(
    globalStyles,
    /\.horizontal-scroll-hint\.horizontal-scroll-hint--visible::-webkit-scrollbar\s*\{[\s\S]*display:\s*block;/,
  );
});
