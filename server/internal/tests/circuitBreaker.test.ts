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
  assert.equal(snapshot.totalRequests, snapshot.failures + snapshot.successes);
  assert.equal(snapshot.failureRate, 0);
});
