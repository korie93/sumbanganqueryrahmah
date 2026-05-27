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
