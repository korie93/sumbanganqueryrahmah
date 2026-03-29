import test from "node:test";
import assert from "node:assert/strict";

import { resolveMobileViewportState } from "@/hooks/use-mobile-viewport-state";

test("resolveMobileViewportState reports a closed keyboard when viewport matches the window", () => {
  const state = resolveMobileViewportState(844, 844, 0);

  assert.equal(state.keyboardOpen, false);
  assert.equal(state.bottomInset, 0);
});

test("resolveMobileViewportState detects keyboard overlap and bottom inset from visual viewport", () => {
  const state = resolveMobileViewportState(844, 520, 0);

  assert.equal(state.keyboardOpen, true);
  assert.equal(state.bottomInset, 324);
});

test("resolveMobileViewportState respects offset visual viewports without producing negative inset", () => {
  const state = resolveMobileViewportState(844, 700, 120);

  assert.equal(state.keyboardOpen, true);
  assert.equal(state.bottomInset, 24);
});
