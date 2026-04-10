import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAutoLogoutWebSocketMessage,
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

test("parseAutoLogoutWebSocketMessage normalizes supported socket payloads", () => {
  assert.deepEqual(
    parseAutoLogoutWebSocketMessage(JSON.stringify({
      type: "maintenance_update",
      maintenance: true,
      message: "Scheduled maintenance",
      mode: "hard",
      startTime: "2026-04-10T10:00:00.000Z",
      endTime: "2026-04-10T11:00:00.000Z",
    })),
    {
      type: "maintenance_update",
      maintenance: true,
      message: "Scheduled maintenance",
      mode: "hard",
      startTime: "2026-04-10T10:00:00.000Z",
      endTime: "2026-04-10T11:00:00.000Z",
    },
  );

  assert.deepEqual(
    parseAutoLogoutWebSocketMessage(JSON.stringify({
      type: "logout",
      reason: "Session expired",
    })),
    {
      type: "logout",
      reason: "Session expired",
    },
  );
});

test("parseAutoLogoutWebSocketMessage rejects malformed or unsupported payloads", () => {
  assert.equal(parseAutoLogoutWebSocketMessage("{invalid"), null);
  assert.equal(parseAutoLogoutWebSocketMessage(JSON.stringify({ type: "unknown" })), null);
  assert.equal(parseAutoLogoutWebSocketMessage(new Uint8Array([1, 2, 3])), null);
});
