# Autonomous Fix Changelog

## 2026-05-27

- CRIT-1: Enforced Redis-backed rate-limit/runtime protection state on production-like hosts. `SQR_RATE_LIMIT_STORE=memory` now remains local/test only, production templates require `SQR_RATE_LIMIT_STORE=redis` with `SQR_REDIS_RATE_LIMIT_URL`, and deployment docs now call out the fail-closed Redis requirement.
- CRIT-2: Tightened login IP brute-force throttling to five attempts per 15 minutes and added a regression proving rotating usernames cannot bypass the per-network login gate.
