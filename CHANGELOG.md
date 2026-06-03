# Changelog

## 2026-06-03 - SQR autonomous audit hardening

### Performance

- Sharded the adaptive auth rate-limit cooldown cache into bounded LRU segments
  so pressure eviction no longer walks one global cache during sustained bursts.

### Architecture

- Split API retry, backoff, and circuit-breaker transport helpers out of the
  main API client while keeping the existing public API exports stable.
- Decomposed the AI page controller into focused state, actions, and lifecycle
  hooks while preserving the existing page controller contract.
- Centralized AI page-local state in a reducer with reducer unit coverage for
  each state transition and React-style functional setter parity.
- Extracted scanner child-process soft/hard timeout handling into a shared
  timeout chain used by runtime scans and startup version checks.

### Bug Fixes

- Moved collection monthly summary window listener cleanup to AbortController
  signals so refresh listeners are released atomically on hook unmount.

### Security

- Added a dedicated hashed-fingerprint rate limiter to startup-gated operations
  debug endpoints before the debug token access gate.

### Accessibility

- Added explicit group and pressed-state semantics to monthly comparison quick
  range controls, with contracts for login and month-field accessible labels.

### Design System

- Added generic z-index scale aliases and replaced remaining local hardcoded
  z-layer utilities with shared layering tokens.
- Replaced decorative `overflow: hidden` surface clipping with `overflow: clip`
  fallbacks where content should not create nested scroll containers.

### Verification

- `tsx --test server/middleware/tests/rate-limit.test.ts`
- `tsx --test client/src/pages/collection-summary/useCollectionMonthlySameDayPace.contract.test.ts client/src/pages/collection-summary/useCollectionMonthlyComparisonData.contract.test.ts`
- `tsx --test client/src/pages/collection-summary/collection-monthly-comparison-a11y.contract.test.ts`
- `tsx --test client/src/app/frontend-hardening-contract.test.ts`
- `tsx --test client/src/lib/queryClient.test.ts client/src/lib/api-client-navigation-contract.test.ts client/src/lib/api/tests/request-cancellation.test.ts`
- `tsx --test client/src/pages/ai/ai-page-controller-utils.test.ts client/src/pages/ai/ai-page-controller-structure.contract.test.ts client/src/pages/ai/ai-conversation-card-a11y-contract.test.ts client/src/app/client-timer-cleanup-contract.test.ts`
- `tsx --test client/src/pages/ai/useAIPageState.reducer.test.ts client/src/pages/ai/ai-page-controller-structure.contract.test.ts client/src/pages/ai/ai-page-controller-utils.test.ts client/src/app/client-timer-cleanup-contract.test.ts`
- `tsx --test server/lib/tests/process-timeout-manager.test.ts server/services/tests/collection-receipt-external-scan.test.ts server/services/tests/collection-receipt-external-scan-startup.test.ts`
- `tsx --test server/routes/tests/operations-debug-routes.test.ts server/routes/tests/operations.routes.integration.test.ts`

## 2026-05-31 - SQR resource lifecycle and configuration hardening

This release contains targeted cleanup and configuration hardening for the
31 May 2026 resource lifecycle audit. The changes are intentionally surgical:
resource owners now have explicit teardown paths, silent failures are surfaced,
and production defaults remain locked down.

### Runtime and security defaults

- Kept the runtime on Node.js 24 LTS and narrowed `package.json` engines to
  the supported 24.x line so future non-LTS majors are not accepted implicitly.
- Allowed non-breaking bcrypt 6.x security patch updates while keeping the
  lockfile deterministic and preserving exact-pin policy for other critical
  direct dependencies.
- Added a hard Vite config failure when `VITE_ENABLE_SOURCEMAPS=1` is set for
  production-like builds.
- Raised the credential password minimum for new passwords and password changes
  from 12 to 14 characters. Existing password verification is unchanged, so
  current users are not locked out solely because their old password is shorter.

### Verification

- `npm run verify:node-version`
- `npm run audit:dependencies`
- `npm run test:scripts`
- `npm run typecheck`
- `npm run lint:client`
- `npm run lint:server`

### Rollback

Rollback remains commit-based. If a config hardening change causes deployment
friction, revert the specific commit and rerun the verification commands above.

## 2026-05-28 - SQR surgical security and reliability hardening

This release contains targeted hardening for the 28 May 2026 SQR audit. The
changes were intentionally scoped to security, lifecycle cleanup, authorization,
bounded caches, and frontend reliability contracts.

### Security

- Replaced timing-sensitive CSRF/session token comparisons with fixed-size
  SHA-256 hashing plus `timingSafeEqual`.
- Made session revocation writes atomic and conservative on uncertain Redis
  reads.
- Added full-jitter Redis retry behavior for session revocation paths.
- Replaced report popup `document.write()` with sanitized DOM injection via
  DOMPurify and explicit popup event wiring.
- Removed executable report HTML patterns and kept report interactions outside
  HTML template strings.
- Escaped email HTML content and restricted email URL protocols.
- Added per-item authorization for multipart receipt mutations before uploads
  proceed.
- Blocked operations debug route registration in production runtime.
- Sanitized fatal rejection logging to avoid leaking sensitive details.

### Reliability and performance

- Guaranteed request deadline cleanup through idempotent listener and timer
  teardown.
- Consolidated session revocation sweep ownership behind a singleton
  orchestrator.
- Added adaptive cache pressure eviction for rate-limit state.
- Exposed tab-visibility cache pressure in health/runtime telemetry.
- Documented global request timeout ownership to avoid dual-timeout ambiguity.
- Kept monitor route prefetch lazy so route-level splitting remains consistent.
- Added granular dashboard error states with per-section retry behavior.
- Expanded frontend timer cleanup contract coverage for stateful timer owners.

### Design system and maintainability

- Replaced arbitrary Tailwind typography and tracking values with named design
  tokens.
- Reduced hidden AutoLogout lifecycle state by moving related state into a
  reducer-backed model.
- Centralized collection record access checks behind route middleware.

### Verification

- `npm run typecheck`
- `npm run lint:client`
- `npm run test:client`
- `npm run build`

The latest full client test run completed with 944 passing tests.

### Rollback

Rollback remains commit-based. Revert the specific hardening commit that
introduced the regression, then run:

```sh
npm run typecheck
npm run lint:client
npm run test:client
npm run build
```

Recent hardening commits:

- `b6213f0f` - `fix(csrf): normalize token buffers`
- `f18ddac3` - `fix(auth): make session revocation atomic`
- `6e32f9fc` - `fix(auth): jitter session revocation retries`
- `3437387b` - `fix(http): guarantee request deadline cleanup`
- `1dd3c497` - `fix(auth): singleton session revocation sweep`
- `99747fa8` - `fix(rate-limit): bound adaptive cooldown cache`
- `964987dc` - `fix(report): replace document.write with sanitized DOM injection`
- `b77f561a` - `fix(mail): sanitize email HTML URL contexts`
- `70725f00` - `fix(rate-limit): add adaptive cache pressure eviction`
- `7ed638e1` - `fix(collection): authorize multipart receipt mutations before upload`
- `bc95eb4b` - `refactor(collection): centralize record access guard`
- `a08aa9f1` - `fix(auth): expose tab visibility cache pressure`
- `db1587f7` - `docs(http): reconcile request timeout ownership`
- `acc1b5af` - `fix(debug): block operations debug routes in production`
- `d134de4f` - `fix(process): sanitize fatal rejection details`
- `c54ddd40` - `refactor(auth-ui): reduce autologout lifecycle refs`
- `c85ff991` - `fix(app): keep monitor prefetch route-lazy`
- `5adc18d0` - `refactor(ui): replace arbitrary typography classes`
- `c186106e` - `fix(dashboard): add granular query error states`
- `c4380dcf` - `test(client): expand timer cleanup contracts`
