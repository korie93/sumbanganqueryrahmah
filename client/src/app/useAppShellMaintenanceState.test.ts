import assert from "node:assert/strict";
import test from "node:test";
import {
  isMaintenancePollingAbortError,
  shouldReportMaintenancePollingError,
} from "@/app/useAppShellMaintenanceState";

test("maintenance polling observability ignores abort errors", () => {
  const abortError = new DOMException("The operation was aborted.", "AbortError");

  assert.equal(isMaintenancePollingAbortError(abortError), true);
  assert.equal(shouldReportMaintenancePollingError(abortError, 1_000, 0), false);
});

test("maintenance polling observability is throttled for repeated failures", () => {
  const networkError = new Error("network failed");

  assert.equal(shouldReportMaintenancePollingError(networkError, 1_000, 0, 10_000), true);
  assert.equal(shouldReportMaintenancePollingError(networkError, 5_000, 1_000, 10_000), false);
  assert.equal(shouldReportMaintenancePollingError(networkError, 11_000, 1_000, 10_000), true);
});
