import assert from "node:assert/strict";
import test from "node:test";
import {
  readNavigatorOnlineState,
  resolveOfflineIndicatorMessage,
} from "@/components/offline-indicator-utils";

test("readNavigatorOnlineState defaults to online when navigator metadata is unavailable", () => {
  assert.equal(readNavigatorOnlineState(undefined), true);
  assert.equal(readNavigatorOnlineState(null), true);
});

test("resolveOfflineIndicatorMessage keeps offline copy calm and specific", () => {
  assert.match(resolveOfflineIndicatorMessage(), /cuba menyambung semula secara automatik/i);
});
