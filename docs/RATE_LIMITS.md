# Rate Limit Reference

This document summarizes the reviewed runtime rate-limit surfaces that are currently implemented in code. The source of truth for application-enforced HTTP limits is [server/middleware/rate-limit.ts](../server/middleware/rate-limit.ts). Reverse-proxy handshake shaping remains documented in [deploy/nginx/sqr.conf.example](../deploy/nginx/sqr.conf.example).

## Application HTTP Policies

| Scope | Window | Limit | Keying model | Source |
| --- | --- | --- | --- | --- |
| Login IP guard | 10 minutes | 50 requests | network identity (`ip` + direct peer) | `createAuthRouteRateLimiters().loginIp` |
| Login account guard | 10 minutes | 15 requests | network identity + bounded hashed account subject | `createAuthRouteRateLimiters().login` |
| Public recovery | 10 minutes | 20 requests | network identity + bounded hashed recovery subject | `createAuthRouteRateLimiters().publicRecovery` |
| Authenticated account mutation | 10 minutes | 12 requests | network identity + bounded authenticated username | `createAuthRouteRateLimiters().authenticatedAuth` |
| Admin action | 10 minutes | 30 requests | network identity + bounded authenticated username | `createAuthRouteRateLimiters().adminAction` |
| Admin destructive action | 10 minutes | 10 requests | network identity + bounded authenticated username | `createAuthRouteRateLimiters().adminDestructiveAction` |
| Search API | 10 seconds | 10 requests | network identity (`ip` + direct peer) | `searchRateLimiter` |
| Import upload | 5 minutes | 12 requests | network identity (`ip` + direct peer) | `importsUploadRateLimiter` |

## Key-Bounding Notes

- Subject-specific auth buckets are intentionally bounded by `createRateLimitKeyAdmissionController(...)`.
- Per-network bucket growth is capped so attacker-controlled username or identifier churn does not create unbounded in-memory keys.
- When a network exhausts the reviewed per-bucket subject budget, additional unique subjects are folded into an overflow suffix rather than expanding state indefinitely.

## Reverse Proxy and Runtime Coordination

- Nginx remains the coarse outer layer for handshake and body-size pressure only.
- Application rate limiters remain the identity-aware source of truth for auth, search, and import policies.
- Runtime monitor alerting tracks sustained `429` pressure separately from enforcement so operators can detect abuse or accidental client loops.

## Non-HTTP Backpressure Surfaces

- AI queueing and concurrency rejection are enforced separately in [server/internal/aiConcurrencyGate.ts](../server/internal/aiConcurrencyGate.ts).
- WebSocket inbound message abuse is enforced separately in the runtime socket lifecycle and heartbeat path, not through Express middleware.
