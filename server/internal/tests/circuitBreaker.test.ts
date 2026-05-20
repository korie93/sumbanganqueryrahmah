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
  assert.equal(snapshot.totalRequests, 2_000);
  assert.equal(snapshot.successes, 2_000);
  assert.equal(snapshot.rejections, 0);
  assert.equal(snapshot.failureRate, 0);
});

test("CircuitBreaker keeps open-state rejections separate from downstream failure rate", async (t) => {
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
  assert.equal(snapshot.totalRequests, snapshot.failures + snapshot.successes);
  assert.equal(snapshot.totalRequests, 5);
  assert.equal(snapshot.failures, 5);
  assert.equal(snapshot.successes, 0);
  assert.equal(snapshot.rejections > 0, true);
  assert.equal(snapshot.failureRate, 1);

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

test("CircuitBreaker trims a mixed outcome window without shifting large arrays", async () => {
  const circuit = new CircuitBreaker({
    name: "mixed-window-test",
    threshold: 1,
    minRequests: 2_000,
  });

  for (let index = 0; index < 2_500; index += 1) {
    if (index % 5 === 0) {
      await assert.rejects(() => circuit.execute(async () => {
        throw new Error("intermittent failure");
      }));
    } else {
      await circuit.execute(async () => "ok");
    }
  }

  const snapshot = circuit.getSnapshot();
  assert.equal(snapshot.totalRequests, 2_000);
  assert.equal(snapshot.totalRequests, snapshot.failures + snapshot.successes);
  assert.equal(snapshot.failures, 400);
  assert.equal(snapshot.successes, 1_600);
  assert.equal(snapshot.rejections, 0);
  assert.equal(snapshot.failureRate, 0.2);
});

test("CircuitBreaker failure rate uses downstream attempts while closed", async () => {
  const circuit = new CircuitBreaker({
    name: "closed-rate-test",
    threshold: 1,
    minRequests: 10,
  });

  for (let index = 0; index < 4; index += 1) {
    await assert.rejects(() => circuit.execute(async () => {
      throw new Error("downstream failed");
    }));
  }
  for (let index = 0; index < 6; index += 1) {
    await circuit.execute(async () => "ok");
  }

  const snapshot = circuit.getSnapshot();
  assert.equal(snapshot.state, "CLOSED");
  assert.equal(snapshot.totalRequests, 10);
  assert.equal(snapshot.failures, 4);
  assert.equal(snapshot.successes, 6);
  assert.equal(snapshot.rejections, 0);
  assert.equal(snapshot.failureRate, 0.4);
});

test("CircuitBreaker half-open concurrency rejections do not dilute trial failure rate", async (t) => {
  const circuit = new CircuitBreaker({
    name: "half-open-rejection-test",
    threshold: 0.5,
    minRequests: 5,
    cooldownMs: 1_000,
    halfOpenMaxInFlight: 1,
  });
  const dateNowMock = t.mock.method(Date, "now", () => 30_000);

  for (let index = 0; index < 5; index += 1) {
    await assert.rejects(() => circuit.execute(async () => {
      throw new Error("open circuit");
    }));
  }

  dateNowMock.mock.mockImplementation(() => 40_000);
  let resolveTrial!: () => void;
  const trial = circuit.execute(async () => new Promise<void>((resolve) => {
    resolveTrial = resolve;
  }));

  await assert.rejects(
    () => circuit.execute(async () => "blocked"),
    /Circuit 'half-open-rejection-test' is OPEN/,
  );

  let snapshot = circuit.getSnapshot();
  assert.equal(snapshot.state, "HALF_OPEN");
  assert.equal(snapshot.totalRequests, 5);
  assert.equal(snapshot.failures, 5);
  assert.equal(snapshot.rejections, 1);
  assert.equal(snapshot.failureRate, 1);

  resolveTrial();
  await trial;

  snapshot = circuit.getSnapshot();
  assert.equal(snapshot.state, "CLOSED");
  assert.equal(snapshot.totalRequests, 0);
  assert.equal(snapshot.rejections, 0);
  assert.equal(snapshot.failureRate, 0);
});
