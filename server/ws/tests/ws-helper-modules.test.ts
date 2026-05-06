import assert from "node:assert/strict";
import test from "node:test";
import { getActivityUserKey } from "../ws-connection-state";
import { sanitizeRuntimeWebSocketError } from "../ws-lifecycle";
import {
  MAX_RUNTIME_WS_MESSAGE_BYTES,
  serializeRuntimeWsPayload,
} from "../ws-message-router";

test("websocket connection state helper prefers stable user id keys", () => {
  assert.equal(getActivityUserKey({ userId: 123, username: "Admin.User" }), "id:123");
  assert.equal(getActivityUserKey({ username: " Admin.User " }), "username:admin.user");
  assert.equal(getActivityUserKey({}), null);
});

test("websocket lifecycle helper sanitizes errors without leaking message text", () => {
  assert.deepEqual(
    sanitizeRuntimeWebSocketError({
      code: "ECONNRESET",
      message: "raw socket details",
      name: "Error",
    }),
    {
      code: "ECONNRESET",
      name: "Error",
    },
  );
});

test("websocket message router refuses oversized payloads", () => {
  const message = serializeRuntimeWsPayload({
    data: "x".repeat(MAX_RUNTIME_WS_MESSAGE_BYTES),
  });

  assert.equal(message, null);
});
