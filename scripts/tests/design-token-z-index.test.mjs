import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

function readThemeZIndexTokens() {
  const themePath = path.resolve(process.cwd(), "client/src/theme-tokens.css");
  const css = fs.readFileSync(themePath, "utf8");
  const tokens = new Map();

  for (const match of css.matchAll(/--(z-[a-z0-9-]+):\s*(-?\d+);/gi)) {
    tokens.set(match[1], Number(match[2]));
  }

  return tokens;
}

function requireToken(tokens, name) {
  const value = tokens.get(name);
  assert.equal(typeof value, "number", `Missing z-index token: --${name}`);
  return value;
}

test("design z-index tokens keep transient app shells below modal layers", () => {
  const tokens = readThemeZIndexTokens();
  const floatingAiRoot = requireToken(tokens, "z-floating-ai-root");
  const mobileNavOverlay = requireToken(tokens, "z-mobile-nav-overlay");
  const floatingAiOverlay = requireToken(tokens, "z-floating-ai-overlay");
  const mobileNavPanel = requireToken(tokens, "z-mobile-nav-panel");
  const modalOverlay = requireToken(tokens, "z-modal-overlay");
  const modalContent = requireToken(tokens, "z-modal-content");
  const popover = requireToken(tokens, "z-popover");

  assert.equal(floatingAiRoot < mobileNavOverlay, true);
  assert.equal(mobileNavOverlay < floatingAiOverlay, true);
  assert.equal(floatingAiOverlay < mobileNavPanel, true);
  assert.equal(mobileNavPanel < modalOverlay, true);
  assert.equal(modalOverlay < modalContent, true);
  assert.equal(modalContent < popover, true);
});
