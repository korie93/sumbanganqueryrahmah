# Technical Audit Report

> **Date:** March 2026
> **Scope:** Full codebase — Backend, Frontend, Database, Security, Performance, Architecture
> **Codebase Stats:** ~44,700 LOC server | ~49,500 LOC client | 1,000 LOC shared | 93 test files

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Critical Findings](#2-critical-findings)
3. [High Findings](#3-high-findings)
4. [Medium Findings](#4-medium-findings)
5. [Low Findings](#5-low-findings)
6. [Memory Leak & Performance Watch Areas](#6-memory-leak--performance-watch-areas)
7. [Business Logic Risks](#7-business-logic-risks)
8. [Architecture & Maintainability Risks](#8-architecture--maintainability-risks)
9. [Verified Non-Issues](#9-verified-non-issues)
10. [Improvement Priorities](#10-improvement-priorities)
11. [Go / No-Go Assessment](#11-go--no-go-assessment)

---

## 1. Executive Summary

### Overall Quality

The codebase demonstrates **above-average engineering quality** for a production system of this size. It uses strict TypeScript throughout, has a well-layered backend architecture (routes → controllers → services → repositories → PostgreSQL), and ships with a real CI pipeline including type checking, unit tests, integration tests, bundle budgets, and Playwright smoke tests.

### Biggest Strengths

1. **Layered architecture with DI via factory functions** — clean separation of concerns in `local-server-composition.ts`
2. **Multi-layer CSRF protection** — double-submit cookie + Fetch metadata + origin/referrer validation with `crypto.timingSafeEqual`
3. **File upload security** — magic-byte validation, PDF JS/action blocking, EXIF metadata stripping
4. **Adaptive rate limiting** — 3 control states (NORMAL/DEGRADED/PROTECTION) with per-scope limits
5. **Circuit breaker + AI concurrency gate** — external service resilience
6. **Dynamic imports for heavy libraries** — jsPDF/xlsx loaded lazily, no bundle impact
7. **Comprehensive integration test suite** — 93 test files across all layers
8. **Proper cursor-based pagination** and bounded query limits throughout

### Biggest Technical Risks

1. CSRF protection fallback allows requests without any validation token
2. LIKE/ILIKE queries accept unescaped wildcard characters from user input
3. `use-toast.ts` hook has incorrect `[state]` dependency causing listener churn
4. N+1 query loop in calendar day upserts (30 round-trips per month)
5. Rollup refresh non-atomic (SELECT then DELETE/INSERT without transaction wrapper)
6. WebSocket reconnect can schedule after component cleanup begins
7. Object URL revocation timing is unreliable in `download.ts`

---

## 2. Critical Findings

### 2.1 CSRF Protection Fallback Bypass

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Area** | Security |
| **Location** | `server/http/csrf.ts:76-77` |
| **Function** | `createCsrfProtectionMiddleware` |
| **Status** | Confirmed by code path |
| **Fix Type** | Quick fix |

**What looks wrong:**

When a cookie-authenticated request arrives without a CSRF double-submit token, without `sec-fetch-site` header, without `Origin` header, and without `Referer` header, the middleware falls through to `return next()` at line 77, allowing the request to proceed.

```typescript
// server/http/csrf.ts:76-77
// Non-browser clients and tests may omit both origin and fetch metadata.
return next();
```

**Why it is risky:**

A browser-based attacker using XMLHttpRequest can omit origin/referer headers in some configurations. The comment says "Non-browser clients and tests may omit both" but this also applies to certain browser attack vectors. Any cookie-authenticated mutation can be performed without CSRF validation.

**Likely impact:**

Cross-site request forgery on all mutation endpoints for cookie-authenticated sessions.

**Suggested improvement:**

Block by default when auth cookie is present but no validation signal exists. Non-browser clients should use Bearer token auth (which correctly bypasses CSRF since it requires explicit header attachment).

---

### 2.2 LIKE/ILIKE Wildcard Injection in Search Queries

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Area** | Database / Security |
| **Location** | `server/repositories/search.repository.ts:60,66,68` and `server/repositories/ai-search-record-utils.ts:155-158,194,210,214` |
| **Function** | `buildFieldCondition`, `aiSearchRows`, `aiDigitsSearchRows`, `aiFuzzySearchRows` |
| **Status** | Confirmed by code path |
| **Fix Type** | Quick fix |

**What looks wrong:**

User-supplied search values are embedded into LIKE/ILIKE patterns without escaping `%` and `_` wildcard characters:

```typescript
// server/repositories/search.repository.ts:60
case "contains":
  return sql`${column} ILIKE ${`%${value}%`}`;

// server/repositories/ai-search-record-utils.ts:155
coalesce((dr.json_data::jsonb)->>'Nama','') ILIKE ${`%${q}%`}

// server/repositories/ai-search-record-utils.ts:194
regexp_replace(dr.json_data::text, '[^0-9]', '', 'g') LIKE ${`%${params.digits}%`}

// server/repositories/ai-search-record-utils.ts:210
CASE WHEN dr.json_data::text ILIKE ${`%${token}%`} THEN 1 ELSE 0 END
```

**Why it is risky:**

Users can craft inputs like `%` to match all rows, or `_` to match single characters — enabling search result manipulation and potential DoS through expensive full-table scans with crafted wildcard patterns.

**Likely impact:**

Data exposure through overly broad search results; potential performance degradation.

**Suggested improvement:**

Escape `%` and `_` in all user-supplied LIKE/ILIKE values before embedding:

```typescript
const escaped = value.replace(/[%_\\]/g, "\\$&");
return sql`${column} ILIKE ${`%${escaped}%`} ESCAPE '\\'`;
```

---

## 3. High Findings

### 3.1 use-toast Hook Listener Churn

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Area** | Frontend / Performance |
| **Location** | `client/src/hooks/use-toast.ts:174-182` |
| **Function** | `useToast` |
| **Status** | Confirmed by code path |
| **Fix Type** | Quick fix |

**What looks wrong:**

The `useEffect` dependency array is `[state]` instead of `[]`. Since `state` changes every time a toast is dispatched, the listener is removed and re-added on every state change. The global `listeners` array gets constant `push`/`splice` operations.

```typescript
// client/src/hooks/use-toast.ts:174-182
React.useEffect(() => {
  listeners.push(setState)
  return () => {
    const index = listeners.indexOf(setState)
    if (index > -1) {
      listeners.splice(index, 1)
    }
  }
}, [state])  // ← Should be []
```

**Why it is risky:**

Creates unnecessary GC pressure from repeated array mutations. While functional (the listener reference is stable via `setState`), it's a performance anti-pattern that causes N listener add/remove cycles per N toast events across all mounted `useToast` consumers.

**Likely impact:**

Performance degradation proportional to toast frequency and number of mounted consumers.

**Suggested improvement:**

Change dependency array from `[state]` to `[]`.

---

### 3.2 N+1 Query in Calendar Day Upserts

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Area** | Database / Performance |
| **Location** | `server/repositories/collection-daily-repository-utils.ts:151-187` |
| **Function** | `upsertCollectionDailyCalendarDays` |
| **Status** | Confirmed by code path |
| **Fix Type** | Medium refactor |

**What looks wrong:**

For each day in the month, a separate `INSERT ... ON CONFLICT DO UPDATE` query is executed in a loop. For a 31-day month, this means 31 database round-trips.

```typescript
// server/repositories/collection-daily-repository-utils.ts:151
for (const day of params.days) {
  await db.execute(sql`
    INSERT INTO public.collection_daily_calendar (...)
    VALUES (...)
    ON CONFLICT (year, month, day) DO UPDATE SET ...
  `);
}
```

**Why it is risky:**

Each round-trip adds network latency (typically 1-5ms per query). Under concurrent user load editing calendars, this creates 30x more database connections than necessary.

**Likely impact:**

30-150ms per calendar update instead of 1-5ms; potential connection pool pressure under load.

**Suggested improvement:**

Batch into a single multi-row INSERT with VALUES list.

---

### 3.3 Rollup Refresh Non-Atomic Operations

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Area** | Database / Collection |
| **Location** | `server/repositories/collection-record-repository-utils.ts:89-144` |
| **Function** | `refreshCollectionRecordDailyRollupSlice` |
| **Status** | Confirmed by code path |
| **Fix Type** | Medium refactor |

**What looks wrong:**

The rollup refresh performs three separate queries without a transaction wrapper:

1. **SELECT** aggregate from `collection_records` (lines 98-106)
2. **DELETE** from rollups if total is 0 (lines 110-115)
3. **INSERT/UPSERT** into rollups (lines 120-142)

```typescript
// Step 1: SELECT (line 98)
const aggregateResult = await executor.execute(sql`
  SELECT COUNT(*)::int AS total_records, COALESCE(SUM(amount), 0)::numeric(14,2) AS total_amount
  FROM public.collection_records WHERE ...
`);

// Step 2: conditional DELETE (line 110)
if (aggregate.totalRecords <= 0) {
  await executor.execute(sql`DELETE FROM public.collection_record_daily_rollups WHERE ...`);
}

// Step 3: UPSERT (line 120)
await executor.execute(sql`INSERT INTO public.collection_record_daily_rollups (...) ON CONFLICT ... DO UPDATE ...`);
```

**Why it is risky:**

If new records are inserted between the SELECT and the INSERT, the aggregated totals become stale. The `ON CONFLICT DO UPDATE` mitigates the insert case, but the DELETE case (when `totalRecords` drops to 0) can race with new inserts.

**Likely impact:**

Temporarily incorrect daily/monthly totals visible to users after concurrent mutations. Self-corrects on next rollup refresh cycle.

**Suggested improvement:**

Wrap in a CTE-based single operation or explicit transaction.

---

### 3.4 IP Extraction Bypasses Express Trust Proxy

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Area** | Backend / Security |
| **Location** | `server/internal/apiProtection.ts:40-42` |
| **Function** | `resolveAdaptiveRateBucket` |
| **Status** | Confirmed by code path |
| **Fix Type** | Quick fix |

**What looks wrong:**

IP is extracted manually from `x-forwarded-for` header instead of using `req.ip` (which respects Express trust proxy settings):

```typescript
// server/internal/apiProtection.ts:40-42
const ip = (req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown")
  .split(",")[0]
  .trim();
```

**Why it is risky:**

Attackers can spoof the `x-forwarded-for` header to bypass rate limiting. Express's `trust proxy` setting (configured in `server/http/trust-proxy.ts`) exists to properly resolve client IP through proxy chains, but this code bypasses it entirely.

**Likely impact:**

Rate limiting can be bypassed by spoofing IP addresses via header manipulation.

**Suggested improvement:**

Use `req.ip` instead of manual header parsing.

---

## 4. Medium Findings

### 4.1 Forced Password Change Heartbeat Bypass

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | Auth |
| **Location** | `server/auth/guards.ts:41-48` |
| **Function** | `FORCED_PASSWORD_CHANGE_ALLOWLIST` |
| **Status** | Confirmed by code path |
| **Fix Type** | Quick fix |

**What looks wrong:**

`POST:/api/activity/heartbeat` is in the allowlist for forced password change:

```typescript
// server/auth/guards.ts:41-48
const FORCED_PASSWORD_CHANGE_ALLOWLIST = new Set([
  "GET:/api/auth/me",
  "GET:/api/me",
  "POST:/api/auth/change-password",
  "PATCH:/api/me/credentials",
  "POST:/api/activity/logout",
  "POST:/api/activity/heartbeat",  // ← PROBLEM
]);
```

**Why it is risky:**

A user who must change their password can keep their session alive indefinitely via heartbeat without ever changing the password.

**Likely impact:**

Users can delay mandatory password changes indefinitely. Not a direct security breach but weakens password rotation policy enforcement.

**Suggested improvement:**

Remove heartbeat from allowlist, or have heartbeat return 403 when `mustChangePassword` is true.

---

### 4.2 Client-Side Role Not Validated

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | Frontend / Security |
| **Location** | `client/src/lib/auth-session.ts:85-103` |
| **Function** | `getStoredAuthenticatedUser` |
| **Status** | Confirmed by code path |
| **Fix Type** | Quick fix |

**What looks wrong:**

The cached user object parsed from localStorage only validates presence of `username` and `role` fields (line 93) but doesn't validate that `role` is a valid value:

```typescript
// client/src/lib/auth-session.ts:91-96
const parsed = JSON.parse(raw) as User;
if (!parsed?.username || !parsed?.role) {
  throw new Error("Invalid cached user");
}
return parsed;  // ← No validation that role is "user" | "admin" | "superuser"
```

**Why it is risky:**

An attacker can modify localStorage to set `role: "superuser"` and see admin-only UI elements. Server-side enforcement prevents actual data access, but UI exposure reveals admin features and navigation structure.

**Likely impact:**

UI-only privilege escalation. No data breach since server validates roles independently.

**Suggested improvement:**

Validate role is one of the allowed values before returning the cached user.

---

### 4.3 Object URL Revocation Timing in download.ts

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | Frontend |
| **Location** | `client/src/lib/download.ts:9-11` |
| **Function** | `downloadBlob` |
| **Status** | Confirmed by code path |
| **Fix Type** | Quick fix |

**What looks wrong:**

`URL.revokeObjectURL(objectUrl)` is called with `setTimeout(..., 0)`, revoking the blob URL in the next microtask:

```typescript
// client/src/lib/download.ts:9-11
window.setTimeout(() => {
  URL.revokeObjectURL(objectUrl);
}, 0);
```

**Why it is risky:**

On slow connections or with large files, the browser may not have initiated the download before the URL is revoked, causing a failed download.

**Likely impact:**

Intermittent download failures, especially on mobile or slow connections.

**Suggested improvement:**

Use a longer timeout (e.g., 10000ms) or revoke on a more reliable signal.

---

### 4.4 WebSocket Reconnect Race on Unmount

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | Frontend |
| **Location** | `client/src/components/AutoLogout.tsx:332-336,350-354` |
| **Component** | AutoLogout WebSocket effect |
| **Status** | Strong suspicion |
| **Fix Type** | Quick fix |

**What looks wrong:**

When the WebSocket `onclose` fires (line 332), it calls `scheduleReconnect()` (line 336) which sets a timeout. If this fires during or just after the cleanup function runs (lines 350-354), the cleanup sets `reconnectEnabledRef.current = false` and calls `cleanupSocket()`, but the `scheduleReconnect()` timeout may already be queued.

```typescript
// line 332-336
socket.onclose = () => {
  if (wsRef.current === socket) { wsRef.current = null; }
  scheduleReconnect();  // ← Can fire during cleanup
};

// line 350-354
return () => {
  reconnectEnabledRef.current = false;
  reconnectAttemptRef.current = 0;
  cleanupSocket();
};
```

**Why it is risky:**

The `scheduleReconnect` function does check `mountedRef.current` and `reconnectEnabledRef.current` (line 253), so the reconnect attempt will be blocked. However, the timeout itself creates a brief reference retention period.

**Likely impact:**

Minor: unnecessary timeout lingering briefly after unmount. Not a leak because reconnect is blocked by ref checks.

**Suggested improvement:**

Clear `reconnectRef` in the cleanup function to cancel any pending reconnect timeout.

---

### 4.5 Embedding Vector Serialization Bypasses Parameterization

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | Database / Security |
| **Location** | `server/repositories/ai-search-record-utils.ts:44-58` |
| **Function** | `serializeEmbeddingVector` |
| **Status** | Confirmed by code path |
| **Fix Type** | Medium refactor |

**What looks wrong:**

Embedding vectors are serialized to a string `[1.0,2.0,...]` and injected into SQL with `${embeddingLiteral}::vector`. While values are validated as finite numbers, this bypasses Drizzle's parameterization:

```typescript
// server/repositories/ai-search-record-utils.ts:57
return `[${normalized.join(",")}]`;
// Used later as: ${embeddingLiteral}::vector
```

**Why it is risky:**

Any bug in the validation logic could lead to SQL injection. Additionally, there's no maximum length validation on the embedding array — an oversized vector could create huge SQL strings.

**Likely impact:**

Low risk given numeric validation, but violates defense-in-depth principles.

**Suggested improvement:**

Add max dimension validation (768 based on schema). Consider using proper parameterized pgvector bindings.

---

### 4.6 Missing Foreign Key Constraints on Collection Records

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | Database |
| **Location** | `shared/schema-postgres.ts:327-379` |
| **Table** | `collectionRecords` |
| **Status** | Confirmed by code path |
| **Fix Type** | Medium refactor |

**What looks wrong:**

`collection_staff_nickname`, `staff_username`, and `created_by_login` columns have no foreign key constraints to their respective tables:

```typescript
// shared/schema-postgres.ts:342-344
createdByLogin: text("created_by_login").notNull(),
collectionStaffNickname: text("collection_staff_nickname").notNull(),
staffUsername: text("staff_username").notNull(),
// ← No FK to users or collection_staff_nicknames tables
```

**Why it is risky:**

Orphaned records when staff nicknames or users are deleted. Data integrity violations without database-level enforcement.

**Likely impact:**

Potential data corruption over time. Existing migration `0011` already contains cleanup queries for orphaned receipts, suggesting this has been observed.

**Suggested improvement:**

Add FK constraints with appropriate ON DELETE behavior (CASCADE or SET NULL) via migration.

---

### 4.7 Graceful Shutdown Resource Incomplete

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Area** | Backend |
| **Location** | `server/index-local.ts:52-75` |
| **Function** | `gracefulShutdown` |
| **Status** | Confirmed by code path |
| **Fix Type** | Medium refactor |

**What looks wrong:**

The graceful shutdown closes WebSocket connections and the HTTP server, but:

1. `server.close()` callback is async but exit happens before `pool.end()` may complete
2. Background tasks (cache sweep, heartbeat, scaling loop) are not explicitly cancelled
3. `setTimeout().unref()` means the force-exit timer won't keep the process alive

```typescript
// server/index-local.ts:65-74
server.close(async () => {
  try { await pool.end(); } catch { /* best-effort */ }
  logger.info("Server closed gracefully");
  process.exit(0);
});

setTimeout(() => {
  logger.warn("Graceful shutdown timed out, forcing exit");
  process.exit(1);
}, GRACEFUL_SHUTDOWN_TIMEOUT_MS).unref();  // ← unref() is risky here
```

**Why it is risky:**

Database connections may not drain properly, causing in-flight queries to fail.

**Likely impact:**

Potential data loss on shutdown for in-flight requests. Not critical for normal operation.

**Suggested improvement:**

Track background tasks and await their completion before exit. Remove `.unref()` from timeout.

---

## 5. Low Findings

### 5.1 Activity Timestamp Race Condition

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Area** | Auth / Backend |
| **Location** | `server/auth/guards.ts:163-166` |
| **Function** | `authenticateToken` middleware |
| **Status** | Confirmed by code path |
| **Fix Type** | Post-launch monitoring only |

**What looks wrong:**

Every authenticated request updates `lastActivityTime` without concurrency control. Multiple concurrent requests from the same user will race to update the timestamp.

**Why it is risky:**

Activity timestamp can become slightly inaccurate, but since all writes set it to `new Date()`, the latest write always wins with an approximately correct value.

**Likely impact:**

Minimal. Timestamps may be off by milliseconds. Idle detection still works because any request resets the timer.

---

### 5.2 Missing CHECK Constraints on Financial Fields

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Area** | Database |
| **Location** | `shared/schema-postgres.ts:335,337` |
| **Table** | Collection record amount fields |
| **Status** | Confirmed by code path |
| **Fix Type** | Medium refactor |

**What looks wrong:**

Amount fields (`amount`, `receipt_total_amount`) lack `CHECK >= 0` constraints.

**Why it is risky:**

Application-level validation could be bypassed, allowing negative financial amounts.

**Likely impact:**

Financial data corruption if validation is bypassed.

**Suggested improvement:**

Add `CHECK (amount >= 0)` constraints via migration.

---

### 5.3 Floating-Point Money Rounding

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Area** | Collection |
| **Location** | `server/services/collection/collection-daily-utils.ts:74-76` |
| **Function** | `roundMoney` |
| **Status** | Watch area only |
| **Fix Type** | Post-launch monitoring only |

**What looks wrong:**

```typescript
function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
```

Accumulated calls with multiple calculations can still drift due to floating-point representation.

**Likely impact:**

Typically sub-cent rounding errors. Amounts are stored as `numeric(14,2)` in PostgreSQL, which is decimal-safe, so database values are always correct. Risk is limited to client-side display of intermediate calculations.

---

## 6. Memory Leak & Performance Watch Areas

| Area | File | Risk | Severity |
|------|------|------|----------|
| Toast listener churn | `client/src/hooks/use-toast.ts:182` | Listener add/remove on every state change | High |
| Object URL revocation | `client/src/lib/download.ts:9-11` | Premature blob revocation | Medium |
| Receipt preview URLs | `client/src/pages/collection-records/useCollectionReceiptPreview.ts` | Potential leak if abort races with URL creation | Medium |
| Image element retention | `client/src/pages/collection/useCollectionReceiptDraftPreviews.ts` | Image objects from failed loads not released | Low |
| Viewer component state | `client/src/pages/Viewer.tsx` (919 lines) | 26 `useState` declarations cause cascading re-renders | Medium |
| Adaptive rate state | `server/internal/apiProtection.ts` | Rate buckets retained 60s+ past expiry | Low |
| Worker metrics map | `server/cluster-local.ts` | Old worker IDs accumulate with frequent restarts | Low |
| Calendar day N+1 | `server/repositories/collection-daily-repository-utils.ts:151-187` | 30 round-trips per calendar update | High |

---

## 7. Business Logic Risks

| Area | File | Risk | Severity |
|------|------|------|----------|
| Rollup atomicity | `server/repositories/collection-record-repository-utils.ts:89-144` | SELECT-then-UPSERT non-atomic | High |
| Duplicate submit | `client/src/pages/collection-records/useCollectionRecordsActions.ts` | No submission state guard | Medium |
| Receipt race | `server/services/collection/collection-record-mutation-operations.ts` | Concurrent creates can bypass duplicate hash check | Medium |
| Floating-point money | `server/services/collection/collection-daily-utils.ts:74-76` | `roundMoney` accumulation drift possible | Low |

### Verified Non-Issue: Date Calculations

The pattern `new Date(year, month, 0).getDate()` with 1-based month (1-12) is **CORRECT** in JavaScript. Day 0 rolls back to the last day of the previous month:

- `new Date(2024, 1, 0).getDate()` → 31 (January = correct)
- `new Date(2024, 2, 0).getDate()` → 29 (February 2024 = correct)
- `new Date(2024, 12, 0).getDate()` → 31 (December = correct)

This is **NOT** an off-by-one error.

---

## 8. Architecture & Maintainability Risks

| Area | File | Lines | Issue |
|------|------|-------|-------|
| Viewer monolith | `client/src/pages/Viewer.tsx` | 919 | 26 state vars, mixed data/display/export concerns |
| Mutation operations | `server/services/collection/collection-record-mutation-operations.ts` | 1040 | Audit snapshot + validation + persistence mixed |
| BackupRestore | `client/src/pages/BackupRestore.tsx` | 666 | 21 `useState` declarations |
| useSystemMetrics | `client/src/hooks/useSystemMetrics.ts` | 829 | 5 sync effects, complex polling — but well-structured |
| Repository utils | `server/repositories/collection-record-repository-utils.ts` | 1235 | Large utility file with mixed query concerns |

**Recommendation:** These are maintainability concerns, not stability blockers. Decompose when modifying these files for other reasons.

---

## 9. Verified Non-Issues

The following items were initially flagged but confirmed safe after analysis:

| Item | Why it's fine |
|------|---------------|
| `new Date(year, month, 0)` with 1-based month | Day 0 correctly rolls to last day of previous month in JS |
| `useSystemMetrics` timer cleanup | Proper `AbortController` usage and `mountedRef` guards verified |
| `AIChat.tsx` message array | Limited to 50 messages via `maxMessages` constant |
| Backup/restore endpoints | All require `superuser` role — verified at route level |
| CSV export escaping | Proper quote-doubling via `value.replace(/"/g, '""')` |
| Receipt MIME whitelist | Frontend and backend both enforce `jpeg/png/pdf/webp` |
| Metric rolling window | Capped at 60 data points via `ROLLING_LIMIT` |
| Dynamic imports for jsPDF/xlsx | Module caching prevents repeated loads |

---

## 10. Improvement Priorities

### Fix Now (Before Next Release)

- [ ] **CSRF fallback bypass** — block requests without any validation signal when auth cookie present (`server/http/csrf.ts:77`)
- [ ] **LIKE wildcard escaping** in all search repositories (`server/repositories/search.repository.ts:60,66,68` and `ai-search-record-utils.ts:155,194,210,214`)
- [ ] **use-toast dependency** array fix (`client/src/hooks/use-toast.ts:182`: `[state]` → `[]`)
- [ ] **IP extraction** — use `req.ip` instead of manual header parsing (`server/internal/apiProtection.ts:40-42`)

### Fix Next (Next Sprint)

- [ ] N+1 calendar upserts — batch into single query
- [ ] Rollup refresh atomicity — use CTE or transaction
- [ ] Object URL revocation timing in `download.ts` — increase timeout
- [ ] Forced password change heartbeat bypass — remove from allowlist
- [ ] Client-side role validation in `auth-session.ts`
- [ ] Add max dimension validation for embedding vectors

### Fix Later (Technical Debt)

- [ ] `Viewer.tsx` decomposition (919 lines → 3-4 components)
- [ ] `collection-record-mutation-operations.ts` audit logic extraction
- [ ] `BackupRestore.tsx` component splitting
- [ ] Foreign key constraints on `collection_records` table
- [ ] CHECK constraints on financial fields
- [ ] Graceful shutdown resource tracking improvement
- [ ] Activity OFFSET pagination → cursor-based in `activity.repository.ts`

---

## 11. Go / No-Go Assessment

### Verdict: **GO for controlled production use, with conditions.**

### Stable enough for production?

**Yes.** The application has strong architectural foundations, comprehensive test coverage, multi-layer security controls, and proper resource bounding. The issues found are typical of a maturing production system.

### What blocks full confidence?

1. **CSRF fallback bypass** (Finding 2.1) — the most critical security gap. Must be fixed before any public-facing deployment.
2. **LIKE wildcard injection** (Finding 2.2) — allows search manipulation and potential DoS.

### What is technical debt but not a blocker?

- Large component files (`Viewer.tsx`, `BackupRestore.tsx`) — maintainability concern, not stability
- Missing FK constraints — data integrity risk but manageable with application-level validation
- N+1 queries — performance concern under load, not correctness
- `use-toast` listener churn — performance concern, not functional bug
- Graceful shutdown gaps — edge case during restarts only
- Object URL revocation timing — intermittent, not consistent failure
