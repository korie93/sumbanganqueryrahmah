import assert from "node:assert/strict";
import test from "node:test";
import { resolveMobileKeyboardOpenState } from "@/hooks/use-mobile-keyboard-state";

test("resolveMobileKeyboardOpenState stays false when the visual viewport matches the window height", () => {
  assert.equal(resolveMobileKeyboardOpenState(844, 844, 0), false);
});

test("resolveMobileKeyboardOpenState detects keyboard overlap from a shorter visual viewport", () => {
  assert.equal(resolveMobileKeyboardOpenState(844, 520, 0), true);
});

test("resolveMobileKeyboardOpenState detects keyboard overlap from viewport bottom inset", () => {
  assert.equal(resolveMobileKeyboardOpenState(844, 700, 120), true);
});
