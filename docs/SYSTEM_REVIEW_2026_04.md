# Comprehensive System Review — April 2026

Full audit of backend, frontend, UI/UX, layout, memory leaks, regression,
bugs and errors for desktop and mobile.

---

## Executive Summary

The codebase is **production-ready** with strong security practices and good
architecture. Four low-risk fixes were applied during this review. The
remaining items below are recommendations for future improvement.

---

## Fixes Applied

| # | File | Change | Category |
|---|------|--------|----------|
| 1 | `server/ws/session-auth.ts` | Added `logger.warn` on JWT verification failure | Security observability |
| 2 | `client/src/index.css` | Added global `:focus-visible` outline style | Accessibility (keyboard) |
| 3 | `client/src/index.css` | Reduced `z-index: 999` → `1` on elevate pseudo-elements | Layout correctness |
| 4 | `client/src/components/FloatingAI.tsx` | Added `observedElements.clear()` in useEffect cleanup | Memory cleanup |

---

## Previously Fixed Critical Issues (Verified)

All nine critical issues from the previous audit are confirmed **RESOLVED**:

| Issue | Status |
|-------|--------|
| CSRF bypass fallback | ✅ Fixed — returns 403 `CSRF_SIGNAL_MISSING` |
| SQL LIKE wildcard injection | ✅ Fixed — `sql-like-utils.ts` escapes `%`, `_`, `\` |
| Rate-limit IP spoofing | ✅ Fixed — uses `req.ip` not manual `x-forwarded-for` |
| Backup OOM (full-table load) | ✅ Fixed — cursor-based streaming via `appendPagedJsonArray` |
| WebSocket connection leak | ✅ Fixed — close before set, cleanup on disconnect |
| Mobile 100vh clipping | ✅ Fixed — `@supports (height: 100dvh)` with fallback |
| Receipt silent catch blocks | ✅ Fixed — all use `logCollectionReceiptBestEffortFailure` |
| Rollup tables missing PKs | ✅ Fixed — composite `primaryKey()` on all rollup tables |
| N+1 day insert loop | ✅ Fixed — batched via `sql.join` in single INSERT |

---

## Backend Audit

### Error Handling — ✅ Strong

- Global error handler in `server/middleware/error-handler.ts` with `HttpError`
  differentiation and generic 500 for unknowns.
- All routes use `asyncHandler` wrapper that passes errors to `next()`.
- Controllers throw typed `HttpError` instances.
- Background job queues have proper try-catch with logging.
- Cluster process crashes logged and restart-throttled.

### Authentication & Authorization — ✅ Strong

- JWT HS256 with 24h expiry and algorithm lock-down.
- bcrypt cost-12 password hashing with timing-safe comparison.
- Double-submit CSRF token with `timingSafeEqual`.
- Role-based access control with nickname scoping.
- Account lockout (`HTTP 423`) after failed attempts.
- Two-factor authentication support.

### Input Validation — ✅ Strong

- Zod schema validation on all auth and API inputs.
- All SQL queries use parameterized `sql` tagged templates (448+ instances).
- File upload validation: type whitelist, size limits, path traversal prevention.
- LIKE patterns escaped via `buildLikePattern` with `ESCAPE '\'`.

### HTTP Security — ✅ Strong

- Helmet.js with custom CSP directives.
- Whitelist-based CORS configuration.
- Receipt responses include `X-Content-Type-Options: nosniff`,
  `Cache-Control: private, no-store`, `Cross-Origin-Resource-Policy: same-origin`.
- Rate limiting on login (15/10min), recovery (20/10min), mutations (12/10min),
  admin actions (30/10min), search (10/10sec).

### Logging & Observability — ✅ Strong

- Structured pino logger with 14 redacted PII keys.
- Deep object sanitization (recursive).
- Request context (requestId, method, path, IP, UA) attached automatically.

### Recommendations

1. **WebSocket auth logging** — APPLIED in this review.
2. **Backup restore unbounded Set** — `backups-restore-utils.ts` line 34 stores
   all collection record IDs in a `Set<string>` during restore. At very large
   scale this could cause memory pressure. Consider streaming validation.
3. **Oversized files** — Four files exceed 700 lines:
   - `schema-postgres.ts` (898 lines)
   - `Viewer.tsx` (839 lines)
   - `sidebar.tsx` (727 lines, generated)
   - `collection-record-mutation-operations.ts` (725 lines)

   Consider decomposing when next modifying these files.

---

## Frontend Audit

### React Memory Leaks — ✅ Good (minor items)

| Component | Finding | Severity |
|-----------|---------|----------|
| `FloatingAI.tsx` | `observedElements` Set not cleared on cleanup | **Fixed** |
| `AIChat.tsx` | `retryTimersRef` array self-cleans but grows per retry | Low |
| `Analysis.tsx` | `copyTimersRef` array self-cleans after 2s | Low |
| All others | Timers, intervals, listeners properly cleaned up | ✅ Good |

### Error Boundaries — ✅ Good

- `AppRouteErrorBoundary` wraps top-level and authenticated routes.
- `Settings.tsx` has boundary for settings tabs.
- `componentDidCatch` logs errors.

### Loading States — ⚠️ Some gaps

- `BackupRestore.tsx` — Uses `useQuery` with `isLoading`/`isRefetching` but
  does not visually indicate when data is being refreshed in the background.
  Users may not realize data is updating during 30-second refresh intervals.
- `ActivityLogsTable.tsx` — Refetch loading not visible in expandable sections.

### React Query / Fetch Patterns — ✅ Good

- React Query handles component unmount cancellation internally.
- Auth-related fetches use `AbortController` where needed.

---

## UI/UX & Layout Audit

### Accessibility — ⚠️ Needs improvement

| Issue | Severity | Files |
|-------|----------|-------|
| Missing global `:focus-visible` styles | **Fixed** | `index.css` |
| Some buttons lack `aria-label` in Login.tsx | Low | `Login.tsx:350,468,483` |
| Calendar checkboxes rely on label wrapping only | Low | `CollectionDailyCalendarCard.tsx` |

### Responsive Design — ✅ Good overall

- Mobile viewport height uses `100dvh` with `@supports` fallback.
- Tailwind responsive utilities used throughout.
- `FloatingAI.module.css` has `max-width: calc(100vw - 1rem)` for mobile.

#### Minor concerns

- `FloatingAI.module.css` `min-width: 260px` may constrain on very small
  devices (< 280px viewport). Affects < 1% of users.
- Only one media breakpoint (`768px`) for floating AI panel.

### z-index Strategy — ⚠️ Improved

- **Fixed**: Pseudo-element overlay was `z-index: 999`, now `1` (sufficient
  because the pseudo-element is within its parent stacking context).
- `FloatingAI.module.css` uses `z-index: 40` — acceptable, below modal z-50.

### Dark Mode — ✅ Good, minor gaps

- Theme system supports dark mode via `.dark` class.
- `Login.tsx` and `Banned.tsx` use inline SVG background patterns without
  dark mode alternatives. Visual impact is minor (decorative patterns).

---

## Desktop vs Mobile Specific Issues

### Desktop — ✅ No issues found

- Layout fills viewport correctly.
- Scrollbars styled with 10px width (good for mouse users).
- Keyboard navigation now has global focus indicator.

### Mobile — ✅ Good with minor items

| Area | Status | Notes |
|------|--------|-------|
| Viewport height | ✅ Fixed | `100dvh` with `@supports` fallback |
| Touch targets | ✅ Good | Buttons use Tailwind spacing |
| Scrollbar | ✅ Acceptable | Styled thin for mobile |
| Floating AI panel | ✅ Good | `max-width: calc(100vw - 1rem)` |
| Landscape orientation | ⚠️ Not tested | No landscape-specific styles found |

---

## Performance Audit

### Database — ✅ Good

- Batch inserts via `sql.join` (no N+1).
- Cursor-based pagination for backup exports.
- Connection pool monitoring via `db-pool-monitor.ts`.
- Circuit breaker for AI services.
- Adaptive rate limiting (NORMAL → DEGRADED → PROTECTION).

### Bundle Size — Not verified

- CI runs `verify:bundle-budgets` script.
- Dependencies like `html2canvas`, `jspdf`, `xlsx` should be audited for
  tree-shaking effectiveness.

---

## Regression Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| WebSocket auth logging | None | Adds logging only; no behavior change |
| Focus-visible styles | Very low | Uses `@layer base` so component overrides still work |
| z-index 999 → 1 | Very low | Pseudo-element only needs to be above sibling content |
| observedElements.clear() | None | Called after disconnect(); defensive cleanup |

---

## Summary of Recommendations (Not Fixed — Future Work)

| Priority | Recommendation | Category |
|----------|---------------|----------|
| Medium | Show loading indicator during BackupRestore refetch | UX |
| Medium | Decompose files > 700 lines when next modified | Maintainability |
| Low | Add `aria-label` to Login.tsx buttons | Accessibility |
| Low | Add dark mode variants for decorative SVG backgrounds | UI |
| Low | Add landscape-specific styles for mobile | Layout |
| Low | Audit large dependencies for tree-shaking | Performance |
| Low | Stream backup restore ID validation (unbounded Set) | Memory |
