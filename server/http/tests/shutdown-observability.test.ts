import assert from "node:assert/strict";
import test from "node:test";
import {
  createShutdownPhaseTracker,
  markShutdownPhase,
  readShutdownDurationMs,
} from "../../internal/shutdown-observability";

test("shutdown observability tracks total and per-phase durations monotonically", () => {
  const tracker = createShutdownPhaseTracker(1_000);
  const signalMetrics = markShutdownPhase(tracker, "signal-received", 1_000);
  const drainMetrics = markShutdownPhase(tracker, "connection-drain-escalation", 1_750);
  const completeMetrics = markShutdownPhase(tracker, "complete", 2_100);

  assert.deepEqual(signalMetrics, {
    phase: "signal-received",
    phaseDurationMs: 0,
    shutdownDurationMs: 0,
  });
  assert.deepEqual(drainMetrics, {
    phase: "connection-drain-escalation",
    phaseDurationMs: 750,
    shutdownDurationMs: 750,
  });
  assert.deepEqual(completeMetrics, {
    phase: "complete",
    phaseDurationMs: 350,
    shutdownDurationMs: 1_100,
  });
  assert.equal(readShutdownDurationMs(tracker, 2_250), 1_250);
});

test("shutdown observability guards against backwards timestamps", () => {
  const tracker = createShutdownPhaseTracker(5_000);

  markShutdownPhase(tracker, "signal-received", 5_100);
  const metrics = markShutdownPhase(tracker, "timeout", 5_050);

  assert.deepEqual(metrics, {
    phase: "timeout",
    phaseDurationMs: 0,
    shutdownDurationMs: 100,
  });
});
