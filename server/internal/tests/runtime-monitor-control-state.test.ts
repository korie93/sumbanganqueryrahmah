import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultWorkerControlState,
  createRuntimeControlStateManager,
} from "../runtime-monitor-control-state";

test("createDefaultWorkerControlState returns a stable baseline state", () => {
  const state = createDefaultWorkerControlState();
  assert.equal(state.mode, "NORMAL");
  assert.equal(state.healthScore, 100);
  assert.equal(state.workerCount, 1);
  assert.equal(state.preAllocateMB, 0);
});

test("createRuntimeControlStateManager respects explicit db protection or db latency fallback", () => {
  let lastDbLatencyMs = 0;
  const manager = createRuntimeControlStateManager({
    lowMemoryMode: false,
    getLastDbLatencyMs: () => lastDbLatencyMs,
  });

  assert.equal(manager.getDbProtection(), false);

  lastDbLatencyMs = 1500;
  assert.equal(manager.getDbProtection(), true);

  manager.applyControlState({ dbProtection: false, workerCount: 3 });
  assert.equal(manager.getControlState().workerCount, 3);
  assert.equal(manager.getDbProtection(), true);

  lastDbLatencyMs = 0;
  manager.applyControlState({ dbProtection: true });
  assert.equal(manager.getDbProtection(), true);
});
