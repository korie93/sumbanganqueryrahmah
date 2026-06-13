import assert from "node:assert/strict";
import test from "node:test";
import {
  getActivityDeviceLabel,
  getActivityDeviceTypeLabel,
} from "@/pages/activity/activity-device-utils";

test("activity device labels combine server-derived class and platform", () => {
  assert.equal(
    getActivityDeviceLabel({
      deviceType: "desktop",
      platform: "Windows 10/11",
    }),
    "Desktop · Windows 10/11",
  );
  assert.equal(getActivityDeviceTypeLabel("mobile"), "Mobile");
});

test("legacy activity rows remain readable when device metadata is absent", () => {
  assert.equal(
    getActivityDeviceLabel({
      deviceType: undefined,
      platform: undefined,
    }),
    "Unknown device",
  );
});
