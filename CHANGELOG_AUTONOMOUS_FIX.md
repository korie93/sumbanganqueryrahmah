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
- MED-FE-5: Added a dependency-free i18n foundation with `en`/`ms` locale resources, typed namespace lookup/interpolation helpers, an accessible language switcher component, and tests proving locale fallback and missing-key behavior.
- MED-UI-1: Introduced a container-query responsive pattern for the login shell/card spacing with a `@supports` media-query fallback and documented when component-width responsiveness should use container queries.
- MED-UI-2: Standardized responsive guidance around Tailwind-first layout, approved route-level CSS breakpoint exceptions, and added a responsive contract test that rejects unapproved custom CSS breakpoint widths.
- MED-UI-3: Added an accessible password strength meter with deterministic scoring, common-pattern/repetition/sequence penalties, reduced-motion-safe progress bars, and integration across activation, reset-password, and change-password flows.
- MED-UI-4: Added shared focus-visible design tokens, global keyboard-focus defaults with legacy and forced-colors fallbacks, and documented the repo-wide focus styling contract.
- MED-UI-5: Extended automated design-token contrast coverage to verify the shared focus ring meets WCAG non-text contrast in light and dark themes.
- MED-CFG-1: Documented app-owned security header responsibilities, expanded the Nginx contract to reject conflicting proxy-level security headers, and added a deploy runbook for header validation.
- MED-CFG-2: Added shared module boundary documentation, target `shared/common|server|client` directories, and a contract test preventing browser code from importing server-only Drizzle schema modules.
- MED-CFG-3: Added native npm SBOM generation for CycloneDX and SPDX JSON, release workflow artifact upload, SBOM validation tests, and supply-chain documentation.
- MED-CFG-4: Added SheetJS SHA512 checksum verification via `CHECKSUMS.sha512`, refactored the vendor integrity checker, covered it with tests, and wired the release workflow to verify the vendored tarball.
- MED-CFG-5: Switched the PM2 example to the direct Node entrypoint with `wait_ready`, `shutdown_with_message`, 10s graceful drain windows, runtime readiness signalling after bootstrap, and PM2 shutdown-message handling for single-process and cluster modes.
- LOW-1/2/3: Added CSP, secret-leak incident response, and data-retention runbooks with a docs contract test to keep the required operational sections present.
- LOW-4: Added Lighthouse/PageSpeed score threshold enforcement to the strict runner, wired it into the smoke CI job with artifact upload, and documented the no-new-dependency CI budget process.
- LOW-5: Expanded the Playwright accessibility contract with screen-reader scenarios for login validation alerts and Floating AI dialog/live-log focus management, plus a source contract and testing strategy notes.
- LOW-6: Preserved full API/login error messages and added an accessible expandable disclosure for long toast and login alerts instead of silently cutting messages at 240 characters.
- LOW-7: Upgraded the client API retry guard into an explicit CLOSED/OPEN/HALF_OPEN circuit breaker with immediate retry-enabled rejection, recovery probes, and state transition tests.
- LOW-8: Extended bundle budget monitoring with a JSON report artifact in CI and documented the current chunk-size baseline and review rules.
