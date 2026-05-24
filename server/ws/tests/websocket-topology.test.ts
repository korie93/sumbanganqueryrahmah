import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWebSocketTopologyWarning,
  requiresSingleWorkerForProcessLocalWebSocketState,
} from "../websocket-topology";

test("websocket topology warning stays quiet for single-worker deployments", () => {
  assert.equal(requiresSingleWorkerForProcessLocalWebSocketState(1), false);
  assert.equal(buildWebSocketTopologyWarning(1), null);
});

test("websocket topology warning reports process-local state for multi-worker deployments", () => {
  assert.equal(requiresSingleWorkerForProcessLocalWebSocketState(2), true);
  assert.match(
    String(buildWebSocketTopologyWarning(2)),
    /Redis pub\/sub.*force-logout.*idle-close/i,
  );
});

test("websocket topology accepts multi-worker only when a shared bus is configured", () => {
  assert.equal(requiresSingleWorkerForProcessLocalWebSocketState(2, true), false);
  assert.equal(buildWebSocketTopologyWarning(2, true), null);
});
