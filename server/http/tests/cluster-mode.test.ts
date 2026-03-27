import assert from "node:assert/strict";
import test from "node:test";
import { shouldUseSingleProcessMode } from "../../internal/cluster-mode";

test("shouldUseSingleProcessMode enables single-process startup for a single worker", () => {
  assert.equal(
    shouldUseSingleProcessMode({
      maxWorkers: 1,
    }),
    true,
  );
});

test("shouldUseSingleProcessMode keeps cluster mode when multiple workers are available", () => {
  assert.equal(
    shouldUseSingleProcessMode({
      maxWorkers: 2,
    }),
    false,
  );
});

test("shouldUseSingleProcessMode honors explicit cluster override", () => {
  assert.equal(
    shouldUseSingleProcessMode({
      maxWorkers: 1,
      forceCluster: "1",
    }),
    false,
  );
});
