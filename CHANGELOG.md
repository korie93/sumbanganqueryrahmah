# Changelog

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
