# WebSocket Runtime Limits

<!-- AUDIT-FIX [L1]: operational reference for enforced WebSocket DoS limits. -->

SQR WebSocket connections are bounded at both the server runtime and application handler layers.

## Message Size

- Default maximum message size: `64 KiB`.
- Runtime setting: `SQR_WS_MAX_MESSAGE_BYTES`.
- Oversized client messages are closed with WebSocket close code `1009` (`Message Too Big`).
- Message payload content must never be logged; logs and metrics should include only byte counts and limit names.

## Payload Window

- Application-level rolling window: `512 KiB` per connection per `10s`.
- Repeated small messages that exceed the rolling window are treated as a DoS signal and the socket is closed.
- The payload tracker is cleaned up when a socket closes.

## Connection Count

- Default maximum connections: `10,000` per runtime process.
- Runtime setting: `SQR_WS_MAX_CONNECTIONS`.
- Multi-worker production deployments must configure a shared WebSocket bus with `SQR_WS_SHARED_BUS=redis`.

## Operations Notes

- Production WebSocket memory protection should be validated during load tests with both single large messages and many small messages.
- If legitimate clients hit `1009`, inspect client batching before raising the limit.
- Keep limits conservative for low-memory VPS deployments; prefer application-level batching or pagination over larger socket payloads.
