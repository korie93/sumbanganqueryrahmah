# Architecture Notes

## WebSocket Cluster Constraint

SQR WebSocket connection ownership is process-local. Each runtime process keeps
its own `connectedClients` map, so direct in-memory fan-out only reaches clients
connected to that same worker.

Safe deployment modes:

- `SQR_MAX_WORKERS=1`: safe default for small production deployments.
- `SQR_MAX_WORKERS>1` with `SQR_WS_SHARED_BUS=redis`: safe cluster mode because
  WebSocket broadcasts and cross-worker activity close events use Redis pub/sub.

Production-like startup fails fast when multiple workers are configured without
a shared WebSocket bus. This avoids split-brain behavior where some users miss
settings broadcasts, forced logout, idle-close, or presence updates.

Operational details and runtime limits are documented in [WEBSOCKET.md](./WEBSOCKET.md).
