import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeRequestTracker } from "../runtime-monitor-request-tracker";

test("runtime request tracker rolls request and status counters over the five-second window", () => {
  const tracker = createRuntimeRequestTracker({
    latencyWindow: 10,
    aiLatencyStaleAfterMs: 5000,
    aiLatencyDecayHalfLifeMs: 1000,
  });

  tracker.recordRequestStarted();
  tracker.recordRequestFinished(100, 401);
  tracker.recordRequestStarted();
  tracker.recordRequestFinished(200, 429);
  tracker.recordGcEntries(2);
  tracker.rollFiveSecondWindow();

  assert.equal(tracker.getActiveRequests(), 0);
  assert.equal(tracker.getRequestRate(), 0.4);
  assert.deepEqual(tracker.getStatusCounts(), {
    status401Count: 1,
    status403Count: 0,
    status429Count: 1,
  });
  assert.equal(tracker.getGcPerMinute(), 24);
  assert.equal(tracker.getLatencyP95(), 100);
});

test("runtime request tracker blends db and ai latency measurements", () => {
  const tracker = createRuntimeRequestTracker({
    latencyWindow: 10,
    aiLatencyStaleAfterMs: 10_000,
    aiLatencyDecayHalfLifeMs: 1_000,
  });

  tracker.observeDbLatency(200);
  tracker.observeDbLatency(100);
  assert.equal(tracker.getLastDbLatencyMs(), 175);

  tracker.observeAiLatency(300);
  assert.equal(tracker.getEffectiveAiLatencyMs(), 300);
});
