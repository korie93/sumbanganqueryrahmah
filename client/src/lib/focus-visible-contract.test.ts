import assert from "node:assert/strict";
import test from "node:test";
import { readThemeTokenSource } from "./theme-token-source.test-helper";

const themeTokensSource = readThemeTokenSource();

test("theme tokens expose a shared focus-visible ring contract", () => {
  assert.match(themeTokensSource, /--color-focus:\s*217 91% 42%/);
  assert.match(themeTokensSource, /--focus-ring:\s*2px solid hsl\(var\(--color-focus\) \/ 0\.86\)/);
  assert.match(themeTokensSource, /--focus-ring-offset:\s*2px/);
  assert.match(themeTokensSource, /--focus-ring-radius:\s*var\(--radius-sm\)/);
});

test("global focus styles prefer focus-visible with a legacy fallback", () => {
  assert.match(themeTokensSource, /:focus-visible\s*\{[\s\S]*outline:\s*var\(--focus-ring\)/);
  assert.match(themeTokensSource, /:focus:not\(:focus-visible\)\s*\{[\s\S]*outline:\s*none/);
  assert.match(themeTokensSource, /@supports not selector\(:focus-visible\)/);
});

test("forced-colors mode keeps keyboard focus visible", () => {
  assert.match(themeTokensSource, /@media \(forced-colors:\s*active\)/);
  assert.match(themeTokensSource, /outline:\s*2px solid CanvasText/);
});
