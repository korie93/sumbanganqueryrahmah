import assert from "node:assert/strict";
import test from "node:test";
import {
  isHardMaintenanceState,
  isSoftMaintenanceState,
  shouldRedirectForMaintenance,
  shouldShowSoftMaintenanceBanner,
} from "@/app/maintenance-client-policy";

test("maintenance client policy redirects standard users only for hard maintenance", () => {
  const hardState = { maintenance: true, type: "hard" };
  const softState = { maintenance: true, type: "soft" };

  assert.equal(isHardMaintenanceState(hardState), true);
  assert.equal(isSoftMaintenanceState(softState), true);
  assert.equal(shouldRedirectForMaintenance(hardState, "user"), true);
  assert.equal(shouldRedirectForMaintenance(softState, "user"), false);
  assert.equal(shouldRedirectForMaintenance(hardState, "admin"), false);
  assert.equal(shouldRedirectForMaintenance(hardState, "superuser"), false);
});

test("maintenance client policy shows the soft banner without showing it to bypass roles", () => {
  const softState = { maintenance: true, type: "soft" };

  assert.equal(shouldShowSoftMaintenanceBanner(softState, "user"), true);
  assert.equal(shouldShowSoftMaintenanceBanner(softState, "admin"), false);
  assert.equal(shouldShowSoftMaintenanceBanner({ maintenance: true, type: "hard" }, "user"), false);
  assert.equal(shouldShowSoftMaintenanceBanner({ maintenance: false, type: "soft" }, "user"), false);
});
