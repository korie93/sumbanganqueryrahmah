import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage } from "node:http";
import {
  firstHeaderValue,
  hasForwardedHeaders,
  isSameOriginWebSocketRequest,
  readWebSocketRequestHost,
  readWebSocketRequestProto,
} from "../ws-auth";
import { getActivityUserKey } from "../ws-connection-state";
import { normalizeRuntimeWsHeartbeatIntervalMs } from "../ws-heartbeat";
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

test("websocket auth helper reads first header values and forwarded header presence", () => {
  assert.equal(firstHeaderValue(["first", "second"]), "first");
  assert.equal(firstHeaderValue(undefined), "");
  assert.equal(hasForwardedHeaders({}), false);
  assert.equal(hasForwardedHeaders({ "x-forwarded-for": "203.0.113.10" }), true);
});

test("websocket auth helper only trusts forwarded host and proto when configured", () => {
  const req = {
    headers: {
      host: "internal.example.test",
      origin: "https://public.example.test",
      "x-forwarded-host": "public.example.test, proxy.example.test",
      "x-forwarded-proto": "https",
    },
    socket: {},
  } as unknown as Pick<IncomingMessage, "headers" | "socket">;

  assert.equal(
    readWebSocketRequestHost(req.headers, { trustForwardedHeaders: false }),
    "internal.example.test",
  );
  assert.equal(
    readWebSocketRequestHost(req.headers, { trustForwardedHeaders: true }),
    "public.example.test",
  );
  assert.equal(
    readWebSocketRequestProto(req, { trustForwardedHeaders: true }),
    "https",
  );
  assert.equal(
    isSameOriginWebSocketRequest(req, { trustForwardedHeaders: false }),
    false,
  );
  assert.equal(
    isSameOriginWebSocketRequest(req, { trustForwardedHeaders: true }),
    true,
  );
});

test("websocket auth helper falls back to localhost when host is missing", () => {
  const req = {
    headers: {
      origin: "http://localhost",
    },
    socket: {},
  } as unknown as Pick<IncomingMessage, "headers" | "socket">;

  assert.equal(
    readWebSocketRequestHost(req.headers, { trustForwardedHeaders: false }),
    "localhost",
  );
  assert.equal(
    isSameOriginWebSocketRequest(req, { trustForwardedHeaders: false }),
    true,
  );
});

test("websocket heartbeat interval normalization keeps runtime bounds", () => {
  assert.equal(normalizeRuntimeWsHeartbeatIntervalMs(undefined), 30_000);
  assert.equal(normalizeRuntimeWsHeartbeatIntervalMs(1_000), 10_000);
  assert.equal(normalizeRuntimeWsHeartbeatIntervalMs(45_999.9), 45_999);
});
