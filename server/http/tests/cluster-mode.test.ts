import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeInitialWorkerCount,
  resolveProcessLocalSecurityWorkerCount,
  resolveSafeClusterWorkerTopology,
  shouldUseSingleProcessMode,
} from "../../internal/cluster-mode";

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

test("normalizeInitialWorkerCount caps startup workers at the cluster max", () => {
  assert.equal(
    normalizeInitialWorkerCount({
      maxWorkers: 2,
      initialWorkers: 4,
    }),
    2,
  );
});

test("normalizeInitialWorkerCount keeps at least one startup worker", () => {
  assert.equal(
    normalizeInitialWorkerCount({
      maxWorkers: 2,
      initialWorkers: 0,
    }),
    1,
  );
});

test("resolveSafeClusterWorkerTopology enforces one worker while runtime security state is process-local", () => {
  assert.deepEqual(
    resolveSafeClusterWorkerTopology({
      requestedMaxWorkers: 4,
      sharedRuntimeStateConfigured: false,
      sharedRuntimeStateEnabled: false,
    }),
    {
      downgradedToSingleWorker: true,
      maxWorkers: 1,
      requestedMaxWorkers: 4,
      reason: "process-local-security-state",
    },
  );
});

test("resolveSafeClusterWorkerTopology keeps one worker when Redis is configured but adapters are disabled", () => {
  assert.deepEqual(
    resolveSafeClusterWorkerTopology({
      requestedMaxWorkers: 4,
      sharedRuntimeStateConfigured: true,
      sharedRuntimeStateEnabled: false,
    }),
    {
      downgradedToSingleWorker: true,
      maxWorkers: 1,
      requestedMaxWorkers: 4,
      reason: "shared-runtime-state-adapters-disabled",
    },
  );
});

test("resolveSafeClusterWorkerTopology allows multi-worker only after shared runtime state is enabled", () => {
  assert.deepEqual(
    resolveSafeClusterWorkerTopology({
      requestedMaxWorkers: 3,
      sharedRuntimeStateConfigured: true,
      sharedRuntimeStateEnabled: true,
    }),
    {
      downgradedToSingleWorker: false,
      maxWorkers: 3,
      requestedMaxWorkers: 3,
      reason: null,
    },
  );
});

test("resolveProcessLocalSecurityWorkerCount reports the enforced worker count for startup guards", () => {
  assert.equal(
    resolveProcessLocalSecurityWorkerCount({
      requestedMaxWorkers: 5,
      sharedRuntimeStateConfigured: true,
    }),
    1,
  );
});
