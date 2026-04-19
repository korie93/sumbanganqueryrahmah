import assert from "node:assert/strict";
import test from "node:test";
import { cleanupAutoLogoutRuntimeResources } from "@/components/auto-logout-runtime-cleanup";

test("cleanupAutoLogoutRuntimeResources clears timers, aborts in-flight work, and disables reconnects deterministically", () => {
  const reconnectEnabledRef = { current: true };
  const reconnectAttemptRef = { current: 3 };
  const callOrder: string[] = [];

  cleanupAutoLogoutRuntimeResources({
    clearHeartbeat: () => {
      callOrder.push("clearHeartbeat");
    },
    clearHeartbeatRequest: () => {
      callOrder.push("clearHeartbeatRequest");
    },
    clearIdleTimeout: () => {
      callOrder.push("clearIdleTimeout");
    },
    clearReconnect: () => {
      callOrder.push("clearReconnect");
    },
    cleanupSocket: () => {
      callOrder.push("cleanupSocket");
    },
    reconnectAttemptRef,
    reconnectEnabledRef,
  });

  assert.equal(reconnectEnabledRef.current, false);
  assert.equal(reconnectAttemptRef.current, 0);
  assert.deepEqual(callOrder, [
    "clearIdleTimeout",
    "clearHeartbeat",
    "clearReconnect",
    "clearHeartbeatRequest",
    "cleanupSocket",
  ]);
});
