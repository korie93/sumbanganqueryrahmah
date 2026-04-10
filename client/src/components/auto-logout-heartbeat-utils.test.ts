import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ACTIVITY_HEARTBEAT_SYNC_WINDOW_MS,
  MIN_ACTIVITY_HEARTBEAT_SYNC_WINDOW_MS,
  resolveActivityHeartbeatSyncWindowMs,
  shouldSyncActivityHeartbeat,
} from "@/components/auto-logout-heartbeat-utils";

test("resolveActivityHeartbeatSyncWindowMs keeps user-activity sync within safe bounds", () => {
  assert.equal(resolveActivityHeartbeatSyncWindowMs(10_000), MIN_ACTIVITY_HEARTBEAT_SYNC_WINDOW_MS);
  assert.equal(resolveActivityHeartbeatSyncWindowMs(120_000), MAX_ACTIVITY_HEARTBEAT_SYNC_WINDOW_MS);
  assert.equal(resolveActivityHeartbeatSyncWindowMs(90_000), 45_000);
});

test("shouldSyncActivityHeartbeat syncs immediately when no previous heartbeat exists", () => {
  assert.equal(shouldSyncActivityHeartbeat(0, 100_000, 45_000), true);
});

test("shouldSyncActivityHeartbeat waits until the sync window has elapsed", () => {
  assert.equal(shouldSyncActivityHeartbeat(70_000, 100_000, 45_000), false);
  assert.equal(shouldSyncActivityHeartbeat(50_000, 100_000, 45_000), true);
});
