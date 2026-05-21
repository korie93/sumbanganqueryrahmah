import assert from "node:assert/strict";
import test from "node:test";
import { shouldEnableLowSpecMode } from "./low-spec-mode";

test("shouldEnableLowSpecMode honors explicit performance overrides", () => {
  assert.equal(shouldEnableLowSpecMode({ perfOverride: "low", hardwareConcurrency: 8, deviceMemory: 16 }), true);
  assert.equal(shouldEnableLowSpecMode({ perfOverride: "high", hardwareConcurrency: 1, deviceMemory: 1 }), false);
});

test("shouldEnableLowSpecMode uses conservative hardware thresholds", () => {
  assert.equal(shouldEnableLowSpecMode({ hardwareConcurrency: 4, deviceMemory: 4, saveData: false }), false);
  assert.equal(shouldEnableLowSpecMode({ hardwareConcurrency: 2, deviceMemory: 8, saveData: false }), true);
  assert.equal(shouldEnableLowSpecMode({ hardwareConcurrency: 8, deviceMemory: 2, saveData: false }), true);
  assert.equal(shouldEnableLowSpecMode({ hardwareConcurrency: 8, deviceMemory: 8, saveData: true }), true);
});
