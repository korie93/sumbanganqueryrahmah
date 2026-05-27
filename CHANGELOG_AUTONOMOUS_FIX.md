# Autonomous Fix Changelog

## 2026-05-27

- CRIT-1: Enforced Redis-backed rate-limit/runtime protection state on production-like hosts. `SQR_RATE_LIMIT_STORE=memory` now remains local/test only, production templates require `SQR_RATE_LIMIT_STORE=redis` with `SQR_REDIS_RATE_LIMIT_URL`, and deployment docs now call out the fail-closed Redis requirement.
- CRIT-2: Tightened login IP brute-force throttling to five attempts per 15 minutes and added a regression proving rotating usernames cannot bypass the per-network login gate.
- CRIT-3: Added versioned encrypted 2FA secret payloads that preserve each enrollment's TOTP algorithm, keeping legacy SHA1 payloads valid while allowing new SHA256 enrollments without a database rewrite.
- CRIT-4: Added production-like startup guardrails requiring receipt external malware scanning to be enabled, fail-closed, and configured with a file placeholder before collection receipt uploads are accepted; startup now validates scanner reachability with a clean test scan and logs scanner version when available.
- CRIT-5: Hardened SQL LIKE pattern construction with trim, Unicode normalization, null-byte rejection, and a 200-character cap while preserving parameterized Drizzle bindings and explicit ESCAPE clauses.
- MED-BE-1: Added authenticated per-user adaptive rate buckets alongside per-IP buckets, configurable per-user read/write/upload limits, `RateLimit-*`/`X-RateLimit-*` response headers, and structured per-user throttle logging.
- MED-BE-2: Added shared JSON schema depth enforcement with a 10-level cap, explicit `SchemaDepthError`, and cyclic-payload rejection before recursive Zod validation.
- MED-BE-3: Added sliding JWT session refresh in the auth guard. Bearer clients receive a replacement token through `X-Auth-Token-Refresh`, cookie sessions refresh the httpOnly auth cookie without rotating CSRF, and the previous JWT id is revoked before the request proceeds.
- MED-BE-4: Added configurable inbound WebSocket message limits (`SQR_WS_MAX_MESSAGE_BYTES`, default 1MB), 64KB large-frame warning telemetry, 1009 close handling for oversized messages, and 300s Nginx WebSocket proxy timeouts.
- MED-BE-5: Strengthened streamed CSV import persistence with configurable 1,000-row database flush batches, a 64KB per-row byte budget, rollback on oversized legacy JSON rows, and tests proving streamed rows stay bounded instead of fully materializing large CSV uploads.
- MED-FE-1: Added shared client API retry handling with retryable 429/502/503/504 and network failures, exponential backoff with jitter, AbortSignal-aware retry cancellation, retry-count exposure on thrown errors, and a retry circuit that suppresses retries after repeated transient failures.
- MED-FE-2: Refactored the login page state hook into documented focused hooks for form state, security/2FA lockout state, redirect/session completion, and submission flow while preserving the public `useLoginPageState` contract consumed by `Login.tsx`.
- MED-FE-3: Memoized intentionally heavy dashboard display components and chart tooltip renderers, cached dashboard card/chart derived values, and added passive login CAPTCHA UI support for future `captcha_required` server responses without changing normal login behavior.
- MED-FE-4: Added a centralized frontend error-message registry with contextual Malay guidance for common HTTP/network failures, wired it into shared API and mutation feedback helpers, and replaced generic fallback messages in those common paths with status-aware recovery copy.
