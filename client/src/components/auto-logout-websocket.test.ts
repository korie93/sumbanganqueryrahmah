import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveAutoLogoutReconnectDelayMs,
  WS_RECONNECT_BASE_DELAY_MS,
  WS_RECONNECT_MAX_DELAY_MS,
} from "@/components/auto-logout-websocket";

test("resolveAutoLogoutReconnectDelayMs applies exponential backoff with bounded jitter", () => {
  assert.equal(
    resolveAutoLogoutReconnectDelayMs(0, 0.5),
    WS_RECONNECT_BASE_DELAY_MS,
  );
  assert.equal(
    resolveAutoLogoutReconnectDelayMs(1, 0),
    1600,
  );
  assert.equal(
    resolveAutoLogoutReconnectDelayMs(2, 1),
    4800,
  );
});

test("resolveAutoLogoutReconnectDelayMs caps reconnect delays for long outage windows", () => {
  assert.equal(
    resolveAutoLogoutReconnectDelayMs(10, 0.5),
    WS_RECONNECT_MAX_DELAY_MS,
  );
  assert.equal(
    resolveAutoLogoutReconnectDelayMs(10, 0),
    24000,
  );
});
