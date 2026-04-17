import {
  RUNTIME_WS_CLOSE_REASON_SESSION_EXPIRED,
  RUNTIME_WS_CLOSE_REASON_SESSION_INVALID,
  RUNTIME_WS_POLICY_VIOLATION_CLOSE_CODE,
} from "@shared/websocket-close-reasons"
import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAutoLogoutWebSocketMessage,
  resolveAutoLogoutReconnectDelayMs,
  resolveAutoLogoutSocketCloseOutcome,
  WS_RECONNECT_BASE_DELAY_MS,
  WS_RECONNECT_MAX_ATTEMPTS,
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

test("resolveAutoLogoutSocketCloseOutcome stops retrying for terminal auth closes and reconnect exhaustion", () => {
  assert.deepEqual(
    resolveAutoLogoutSocketCloseOutcome({
      code: RUNTIME_WS_POLICY_VIOLATION_CLOSE_CODE,
      reason: RUNTIME_WS_CLOSE_REASON_SESSION_EXPIRED,
    } as Pick<CloseEvent, "code" | "reason">, 0),
    {
      retry: false,
      shouldLogout: true,
      terminalMessage: "Sesi anda telah tamat. Sila log masuk semula.",
    },
  );

  assert.deepEqual(
    resolveAutoLogoutSocketCloseOutcome({
      code: RUNTIME_WS_POLICY_VIOLATION_CLOSE_CODE,
      reason: RUNTIME_WS_CLOSE_REASON_SESSION_INVALID,
    } as Pick<CloseEvent, "code" | "reason">, 0),
    {
      retry: false,
      shouldLogout: true,
      terminalMessage: "Sesi semasa tidak lagi sah. Sila log masuk semula.",
    },
  );

  assert.deepEqual(resolveAutoLogoutSocketCloseOutcome(null, WS_RECONNECT_MAX_ATTEMPTS), {
    retry: false,
    shouldLogout: false,
    terminalMessage:
      `Sambungan ke server masih gagal selepas ${WS_RECONNECT_MAX_ATTEMPTS} percubaan. `
      + "Sila muat semula halaman atau log masuk semula.",
  });
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
