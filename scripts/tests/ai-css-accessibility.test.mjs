import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("AI chat typography uses rem units for small text sizes", () => {
  const css = readFileSync(
    path.resolve(process.cwd(), "client/src/styles/ai.css"),
    "utf8",
  );

  assert.doesNotMatch(css, /font-size:\s*(12|13|14)px;/);
  assert.match(css, /font-size:\s*0\.75rem;/);
  assert.match(css, /font-size:\s*0\.8125rem;/);
  assert.match(css, /font-size:\s*0\.875rem;/);
});

test("theme tokens keep a dvh to svh to vh viewport fallback chain", () => {
  const css = readFileSync(
    path.resolve(process.cwd(), "client/src/theme-tokens.css"),
    "utf8",
  );

  assert.match(css, /--viewport-min-height-value:\s*100dvh;/);
  assert.match(css, /--app-shell-min-height-value:\s*calc\(100dvh - 3\.5rem\);/);
  assert.match(css, /@supports not \(height: 100dvh\)\s*\{\s*:root \{\s*--viewport-min-height-value:\s*100svh;/s);
  assert.match(css, /@supports not \(height: 100svh\)\s*\{\s*:root \{\s*--viewport-min-height-value:\s*100vh;/s);
  assert.match(css, /--app-shell-min-height-value:\s*calc\(100vh - 3\.5rem\);/);
});
