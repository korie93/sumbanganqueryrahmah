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
    /WebSocket connection state is process-local/i,
  );
});
