import assert from "node:assert/strict";
import test from "node:test";
import { resolveDevelopmentAccessibilityWarningMode } from "@/components/ui/accessibility-warning-mode";

test("resolveDevelopmentAccessibilityWarningMode only enables warnings for browser dev/test contexts", () => {
  assert.equal(resolveDevelopmentAccessibilityWarningMode({
    hasWindow: false,
    viteDev: true,
  }), false);
  assert.equal(resolveDevelopmentAccessibilityWarningMode({
    hasWindow: true,
    viteDev: true,
  }), true);
  assert.equal(resolveDevelopmentAccessibilityWarningMode({
    hasWindow: true,
    viteDev: false,
  }), false);
  assert.equal(resolveDevelopmentAccessibilityWarningMode({
    hasWindow: true,
    nodeEnv: "test",
    viteDev: undefined,
  }), true);
  assert.equal(resolveDevelopmentAccessibilityWarningMode({
    hasWindow: true,
    nodeEnv: "production",
    viteDev: undefined,
  }), false);
});
