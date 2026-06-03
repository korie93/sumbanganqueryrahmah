import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProductionWebSocketTopologySafety,
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

test("production-like websocket topology fails closed for multi-worker without shared bus", () => {
  assert.throws(
    () =>
      assertProductionWebSocketTopologySafety({
        isProductionLike: true,
        sharedBusConfigured: false,
        workerCount: 2,
      }),
    /SQR_MAX_WORKERS greater than 1.*SQR_WS_SHARED_BUS=redis/i,
  );
});

test("production-like websocket topology allows multi-worker with shared bus", () => {
  assert.doesNotThrow(() =>
    assertProductionWebSocketTopologySafety({
      isProductionLike: true,
      sharedBusConfigured: true,
      workerCount: 2,
    }),
  );
});
