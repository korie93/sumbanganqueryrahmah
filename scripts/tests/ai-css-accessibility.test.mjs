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

test("FloatingAI respects reduced-motion by disabling backdrop blur and thinking ring animation", () => {
  const css = readFileSync(
    path.resolve(process.cwd(), "client/src/components/FloatingAI.module.css"),
    "utf8",
  );

  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{/);
  assert.match(css, /\.floatingMobileBackdrop\s*\{\s*-webkit-backdrop-filter:\s*none;\s*backdrop-filter:\s*none;/s);
  assert.match(css, /\.aiThinkingRing::after\s*\{\s*animation:\s*none;\s*opacity:\s*0;\s*transform:\s*none;/s);
});

test("FloatingAI reuses the shared viewport fallback token for panel sizing", () => {
  const css = readFileSync(
    path.resolve(process.cwd(), "client/src/components/FloatingAI.module.css"),
    "utf8",
  );

  assert.match(css, /--floating-ai-viewport-height:\s*var\(--viewport-min-height-value,\s*100vh\);/);
  assert.match(css, /max-height:\s*calc\(var\(--floating-ai-viewport-height\)\s*-\s*5rem\);/);
  assert.match(css, /height:\s*var\(--floating-ai-panel-height,\s*var\(--floating-ai-viewport-height\)\);/);
  assert.doesNotMatch(css, /@supports not \(height: 100dvh\)/);
  assert.doesNotMatch(css, /@supports not \(height: 100svh\)/);
});

test("boot shell shimmer respects prefers-reduced-motion", () => {
  const css = readFileSync(
    path.resolve(process.cwd(), "client/public/boot-shell.css"),
    "utf8",
  );

  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{/);
  assert.match(css, /\.public-auth-boot-shell__field::after,\s*\.public-auth-boot-shell__button::after,\s*\.public-auth-boot-shell__link::after\s*\{\s*animation:\s*none;\s*transform:\s*none;\s*opacity:\s*0;/s);
});
