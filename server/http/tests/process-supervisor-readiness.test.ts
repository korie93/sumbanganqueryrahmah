import assert from "node:assert/strict";
import test from "node:test";

import {
  createSupervisorReadyGate,
  notifySupervisorReady,
} from "../../internal/process-supervisor-readiness";

function createLogger() {
  return {
    warnCalls: [] as Array<{ message: string; metadata?: Record<string, unknown> | undefined }>,
    warn(message: string, metadata?: Record<string, unknown>) {
      this.warnCalls.push({ message, metadata });
    },
  };
}

test("notifySupervisorReady sends the PM2 ready handshake when IPC is available", () => {
  const sent: unknown[] = [];
  const logger = createLogger();
  const ok = notifySupervisorReady(
    {
      send(message) {
        sent.push(message);
      },
    },
    logger,
  );

  assert.equal(ok, true);
  assert.deepEqual(sent, ["ready"]);
  assert.equal(logger.warnCalls.length, 0);
});

test("supervisor ready gate waits for the expected initial workers", () => {
  const sent: unknown[] = [];
  const logger = createLogger();
  const gate = createSupervisorReadyGate({
    expectedReadyCount: 2,
    logger,
    processRef: {
      send(message) {
        sent.push(message);
      },
    },
  });

  assert.equal(gate.markWorkerReady(1), false);
  assert.equal(gate.getReadyWorkerCount(), 1);
  assert.equal(gate.markWorkerReady(2), true);
  assert.equal(gate.hasNotifiedSupervisor(), true);
  assert.deepEqual(sent, ["ready"]);

  assert.equal(gate.markWorkerReady(2), false);
  assert.deepEqual(sent, ["ready"]);
});
