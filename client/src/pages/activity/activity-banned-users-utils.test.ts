import assert from "node:assert/strict";
import test from "node:test";
import {
  getBannedUserBrowserText,
  getBannedUserCardClassName,
  getBannedUserIpText,
  getBannedUsersPanelTitleClassName,
  getBannedUserTimestampText,
} from "@/pages/activity/activity-banned-users-utils";

test("activity banned users utils keep mobile and desktop class names", () => {
  assert.equal(
    getBannedUsersPanelTitleClassName(true),
    "mb-3 text-base flex items-center gap-2 font-semibold text-foreground",
  );
  assert.equal(
    getBannedUsersPanelTitleClassName(false),
    "mb-4 text-lg flex items-center gap-2 font-semibold text-foreground",
  );
  assert.equal(
    getBannedUserCardClassName(true),
    "bg-destructive/5 border border-destructive/20 rounded-2xl p-3.5",
  );
  assert.equal(
    getBannedUserCardClassName(false),
    "bg-destructive/5 border border-destructive/20 rounded-lg p-4",
  );
});

test("activity banned users utils build info labels", () => {
  assert.equal(getBannedUserIpText(null), "Unknown IP");
  assert.equal(getBannedUserIpText("10.0.0.1", true), "IP: 10.0.0.1");
  assert.equal(getBannedUserBrowserText(null), "Unknown browser");
  assert.equal(
    getBannedUserBrowserText({ browser: "Chrome", version: "123" }),
    "Chrome 123",
  );
  assert.equal(
    getBannedUserBrowserText({ browser: "Safari", version: "" }),
    "Safari",
  );
});

test("activity banned users utils build banned timestamp labels", () => {
  assert.equal(getBannedUserTimestampText(null), "Unknown");
  assert.match(
    getBannedUserTimestampText("2026-03-29T16:30:00.000Z", true),
    /^Banned: 30\/03\/2026, 12:30 AM$/,
  );
});
