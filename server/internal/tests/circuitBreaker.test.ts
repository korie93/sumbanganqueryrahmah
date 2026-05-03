import assert from "node:assert/strict";
import test from "node:test";
import { CircuitBreaker } from "../circuitBreaker";

test("CircuitBreaker keeps totalRequests consistent after trimming counters", async () => {
  const circuit = new CircuitBreaker({
    name: "trim-test",
    threshold: 1,
    minRequests: 1_500,
  });

  for (let index = 0; index < 2_001; index += 1) {
    await circuit.execute(async () => "ok");
  }

  const snapshot = circuit.getSnapshot();
  assert.equal(snapshot.totalRequests, snapshot.failures + snapshot.successes + snapshot.rejections);
  assert.equal(snapshot.failureRate, 0);
});

test("CircuitBreaker counts rejections inside totalRequests without leaving stale counters after recovery", async (t) => {
  const circuit = new CircuitBreaker({
    name: "rejection-window-test",
    threshold: 0.5,
    minRequests: 5,
    cooldownMs: 1_000,
  });

  const dateNowMock = t.mock.method(Date, "now", () => 10_000);

  for (let index = 0; index < 5; index += 1) {
    await assert.rejects(() => circuit.execute(async () => {
      throw new Error("boom");
    }));
  }

  for (let index = 0; index < 2_100; index += 1) {
    await assert.rejects(() => circuit.execute(async () => "ok"), /Circuit 'rejection-window-test' is OPEN/);
  }

  let snapshot = circuit.getSnapshot();
  assert.equal(snapshot.totalRequests, snapshot.failures + snapshot.successes + snapshot.rejections);
  assert.equal(snapshot.rejections > 0, true);
  assert.equal(snapshot.failureRate, snapshot.failures / snapshot.totalRequests);

  dateNowMock.mock.mockImplementation(() => 20_000);

  await circuit.execute(async () => "recovered");

  snapshot = circuit.getSnapshot();
  assert.equal(snapshot.state, "CLOSED");
  assert.equal(snapshot.failures, 0);
  assert.equal(snapshot.rejections, 0);
  assert.equal(snapshot.successes, 0);
  assert.equal(snapshot.totalRequests, 0);
  assert.equal(snapshot.failureRate, 0);
});
