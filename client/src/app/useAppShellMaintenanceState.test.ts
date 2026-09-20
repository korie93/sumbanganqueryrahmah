import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isMaintenancePollingAbortError,
  shouldPollAppShellMaintenance,
  shouldReportMaintenancePollingError,
} from "@/app/useAppShellMaintenanceState";

test("maintenance status page owns recovery without changing entry polling or bypass roles", () => {
  for (const role of ["user", "manager", "admin", "superuser"]) {
    const user = Object.freeze({ role });
    assert.equal(shouldPollAppShellMaintenance("maintenance", user), false, role);
    for (const page of ["home", "general-search", "collection-report", "settings"]) {
      assert.equal(shouldPollAppShellMaintenance(page, user), !["admin", "superuser"].includes(role), `${role}:${page}`);
    }
  }
  assert.equal(shouldPollAppShellMaintenance("maintenance", null), false);
  assert.equal(shouldPollAppShellMaintenance("home", null), false);
});

test("public and authenticated maintenance listeners preserve explicit user-owned recovery", () => {
  for (const filename of ["usePublicAppState.ts", "useAppShellMaintenanceState.ts"]) {
    const source = readFileSync(new URL(filename, import.meta.url), "utf8");
    const listener = source.match(/const onMaintenanceUpdated = \(event: Event\) => \{([\s\S]*?)\n {4}\};/)?.[1];
    assert.ok(listener, filename);
    assert.match(listener, /if \(currentPage === "maintenance"\) return;/, filename);
    assert.match(listener, /shouldRedirectForMaintenance/, filename);
    assert.match(listener, /setCurrentPage\("maintenance"\)/, filename);
    assert.doesNotMatch(listener, /setCurrentPage\((?:"home"|"general-search"|restoredPage)\)/, filename);
  }
  const shell = readFileSync(new URL("useAppShellMaintenanceState.ts", import.meta.url), "utf8");
  assert.match(shell, /if \(!user \|\| !shouldPollAppShellMaintenance\(currentPage, user\)\) return;/);
  assert.doesNotMatch(shell, /setCurrentPage\("general-search"\)/);
  assert.match(shell, /clearManagedInterval\(timer\)/);
  assert.match(shell, /activeController\?\.abort\(\)/);
});

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
