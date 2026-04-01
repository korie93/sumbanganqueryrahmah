# FULL SYSTEM AUDIT — SQR

**Audit Date:** 2026-03-31
**Previous Audit Date:** 2026-03-30
**Scope:** Full-system review — backend, frontend, UI/UX, layout, mobile responsiveness, API design, database design, security, performance, error handling, module architecture, maintainability
**Method:** Static code inspection, file-by-file analysis, cross-reference verification
**Auditor:** Principal Software Auditor (automated)

---

## A. Executive Summary

### System Health Score: 8.2 / 10

**Change from previous audit:** +0.7 (was 7.5/10)

The SQR system has improved significantly since the previous audit dated 2026-03-30. Five of seven previously reported critical/high findings have been confirmed as **FIXED**. The codebase demonstrates mature engineering across architecture, security, observability, and resilience. The remaining issues are narrower in scope and lower in severity than what existed previously.

### Overall Stability Impression

The system is **production-ready for controlled deployment** at moderate scale. The architecture is clean, security is multi-layered, error handling is comprehensive, and observability is strong. The remaining technical debt is manageable and does not block production use.

### Biggest Strengths

1. **Clean layered architecture** — routes → controllers → services → repositories with factory-based DI via `local-server-composition.ts`. 37 PostgreSQL tables, 100+ indexes, clear domain boundaries.
2. **Strong security posture** — multi-layer CSRF (double-submit + Fetch metadata + origin/referer), timing-safe bcrypt, JWT with secret rotation, comprehensive file upload validation (magic bytes, PDF JS/action blocking, EXIF/XMP/IPTC stripping), mutation idempotency keys.
3. **Resilience patterns** — circuit breakers on AI/export, adaptive 3-state rate limiting (NORMAL/DEGRADED/PROTECTION), AI concurrency gate with per-role limits, worker clustering with crash detection and restart throttling, database protection mode.
4. **Comprehensive testing** — 226 tests across 84 files. CI pipeline: typecheck → DB schema governance → tests → build → bundle budgets → Playwright smoke against PostgreSQL 16.
5. **Structured logging** — pino-based structured logging with automatic redaction of 15+ sensitive field patterns, request-level context (requestId, clientIp, userAgent), slow request detection (threshold: 1500ms).
6. **Database monitoring** — connection pool pressure tracking with throttled warnings, idle session sweeping, rollup refresh queue with retry/backoff.
7. **Backup streaming** — backup export now uses cursor-based pagination (1000 rows/page) with file streaming and SHA256 integrity hashing. Previous OOM risk is resolved.

### Biggest Risks

1. **WebSocket early-close connection lifecycle** — the only remaining issue from the previous audit's critical findings. Early `ws.close()` calls bypass cleanup handlers (low practical impact since sockets are never stored before rejection).
2. **Oversized files** — 4 source files exceed 700 lines, with the largest at 898 lines. Maintainability risk for future development velocity.
3. **Mixed pagination patterns** — inconsistent use of offset/limit vs page/pageSize across API endpoints. Not a runtime risk but increases frontend integration complexity.
4. **Backup restore Set accumulation** — unbounded `Set<string>` of restored record IDs could grow large on very large restores.

### Comparison to Previous Audit

| Finding | Previous Status | Current Status | Change |
|---------|----------------|----------------|--------|
| Rollup table composite PKs | Missing | FIXED | ✅ Improved |
| N+1 day-insert batch | 30 individual INSERTs | FIXED (sql.join batch) | ✅ Improved |
| 100dvh viewport fallback | Missing | FIXED (@supports fallback) | ✅ Improved |
| SQL LIKE wildcard escaping | Missing | FIXED (sql-like-utils.ts) | ✅ Improved |
| Backup export OOM risk | All tables in memory | FIXED (streaming + pagination) | ✅ Improved |
| WebSocket early-close | Present | STILL PRESENT (low practical risk) | ⚠️ No change |
| Silent receipt catch blocks | 5+ silent catches | FIXED (all logged) | ✅ Improved |
| CSRF fallback bypass | Potential bypass | FIXED (blocks by default) | ✅ Improved |
| x-forwarded-for IP parsing | Manual parsing | FIXED (uses req.ip) | ✅ Improved |
| Bulk admin rate limiting | Missing | FIXED (30 req/10min) | ✅ Improved |
| Oversized files | 5 files >700 lines | 4 files >700 lines | ⬆ Slightly improved |

### Production-Readiness Judgment

**Ready for controlled production use.** The system can serve production traffic at moderate to high scale. The only remaining concern from the critical path is WebSocket connection cleanup, which has low practical impact since early-rejected sockets are never stored in the connected clients map.

---

## B. Architecture Overview

### Backend Architecture

```
server/
├── config/           # Runtime config (615 lines), security, body limits
├── auth/             # Guards, JWT, passwords, 2FA, activation, lifecycle
├── http/             # Express middleware: CSRF, CORS, validation, errors, async-handler
├── controllers/      # Request/response handlers
├── services/         # Business logic (~60 files)
├── repositories/     # Drizzle ORM data access (~40 files)
├── routes/           # Route registration and handlers (~40 files)
├── internal/         # Runtime assembly, bootstrapping, monitoring (~38 files)
├── middleware/        # Express middleware (error handler, rate limit)
├── ws/               # WebSocket server and session management
├── intelligence/     # AI search, embedding, caching infrastructure
├── lib/              # Shared utilities (logger, receipt security, etc.)
├── mail/             # Email/SMTP utilities
├── storage/          # File storage abstraction
├── sql/              # Raw SQL helpers
├── test-support/     # Test factories and helpers
└── tests/            # Server test files (~51 files)
```

### Frontend Architecture

```
client/src/
├── App.tsx              # Root component with routing
├── main.tsx             # Entry point
├── index.css            # Global styles (tailwind, viewport, scroll)
├── app/                 # Core application setup
├── components/          # Shared components (FloatingAI, Navbar, etc.)
│   ├── ui/              # 40+ Radix-based shadcn/ui components
│   └── monitor/         # System monitor components (26 files)
├── context/             # AI context (single lightweight React Context)
├── hooks/               # 14 shared hooks (system metrics, toast, pagination)
│   └── useSystemMetrics.ts (441 lines) — metrics polling and aggregation
├── lib/                 # API client, query client, utilities
├── pages/               # 24 main pages + ~200 sub-components
│   ├── viewer/          # 46 files
│   ├── settings/        # 26 files
│   ├── collection-records/ # 26 files
│   └── ... (15 more page groups)
├── styles/              # Additional style sheets
└── types/               # TypeScript type definitions
```

### Data Flow

```
[Browser] → HTTP/WS → Express middleware stack → Route → Controller
  → Service (business logic) → Repository (Drizzle ORM) → PostgreSQL

[Browser] ← JSON response ← Controller ← Service result

[Browser] ↔ WebSocket ↔ runtime-manager.ts ↔ session tracking / live updates
```

### Major Module Relationships

- **Auth** feeds into every protected route via `authenticateToken` guard
- **Collection** modules (daily, records, nicknames, summary, report) share repositories and rollup refresh queue
- **AI** uses circuit breaker, concurrency gate, and has its own embedding/search cache
- **Backup** uses cursor-based pagination with file streaming for export; full-transaction restore
- **Activity** tracks user sessions, integrates with WebSocket heartbeat and auto-logout
- **Settings** drives feature flags and tab visibility used across frontend

### Notable Architectural Strengths

- Factory-based DI via `local-server-composition.ts` — single place wiring all dependencies
- Centralized runtime config in `server/config/runtime.ts` (615 lines) — no scattered `process.env` reads
- Shared HTTP pipeline in `local-http-pipeline.ts` — body limits, CSRF, CORS, logging all in one place
- Idempotency key system for mutation duplicate prevention (`mutation-idempotency.repository.ts`)

### Notable Architectural Weaknesses

- Some domains still use `PostgresStorage` facade while repository extraction continues (transitional)
- Mixed pagination patterns across API endpoints (offset/limit vs page/pageSize)
- WebSocket lifecycle has a minor gap in early-close paths (detailed in findings below)

---

## Verified Previous Findings

This section explicitly verifies findings from the previous audit (2026-03-30).

### Finding 1: Rollup Table Composite PKs — ✅ FIXED

**Previous status:** Missing primary keys on 3 rollup/queue tables
**Current status:** FIXED

**Evidence:** `shared/schema-postgres.ts` lines 425, 450, 479 define composite `primaryKey()` for all three tables:

- `collectionRecordDailyRollups` — PK on `(paymentDate, createdByLogin, collectionStaffNickname)` (line 425)
- `collectionRecordMonthlyRollups` — PK on `(year, month, createdByLogin, collectionStaffNickname)` (line 450)
- `collectionRecordDailyRollupRefreshQueue` — PK on `(paymentDate, createdByLogin, collectionStaffNickname)` (line 479)

Migration `0014_reviewed_collection_record_daily_rollups.sql` confirms the constraint is promoted from unique index to primary key using `ALTER TABLE ... ADD CONSTRAINT ... PRIMARY KEY USING INDEX`.

### Finding 2: N+1 Day-Insert Batch Issue — ✅ FIXED

**Previous status:** 30 sequential INSERTs in a loop for calendar day upsert
**Current status:** FIXED

**Evidence:** `server/repositories/collection-daily-repository-utils.ts` lines 159-198. The function `upsertCollectionDailyCalendarDays()` now uses `sql.join()` to build a single multi-row INSERT with `ON CONFLICT DO UPDATE`:

```typescript
const valuesSql = sql.join(
  params.days.map((day) => sql`(...)`),
  sql`, `,
);
await executor.execute(sql`INSERT INTO ... VALUES ${valuesSql} ON CONFLICT ... DO UPDATE SET ...`);
```

All days are inserted in a single batch query instead of 30 individual queries.

### Finding 3: 100dvh Viewport Fallback — ✅ FIXED

**Previous status:** Uses 100vh without dynamic viewport height fallback
**Current status:** FIXED

**Evidence:** `client/src/index.css` contains the proper fallback pattern:

```css
min-height: 100vh;
min-height: calc(100vh - 3.5rem);
@supports (height: 100dvh) {
  min-height: 100dvh;
  min-height: calc(100dvh - 3.5rem);
}
```

The `@supports` fallback correctly uses 100vh for older browsers and upgrades to 100dvh for modern browsers that support it.

### Finding 4: SQL LIKE Wildcard Escaping — ✅ FIXED

**Previous status:** LIKE/ILIKE queries did not escape `%` and `_` wildcards from user input
**Current status:** FIXED

**Evidence:** `server/repositories/sql-like-utils.ts` (19 lines) provides `escapeLikePattern()` and `buildLikePattern()`. The escape function neutralizes `\`, `%`, and `_` characters:

```typescript
export function escapeLikePattern(value: string): string {
  return String(value).replace(/[\\%_]/g, "\\$&");
}
```

This utility is imported and used across **11+ repository files** including `search.repository.ts`, `ai-search-record-utils.ts`, `auth-managed-user-utils.ts`, `audit.repository.ts`, `backups-list-utils.ts`, `imports.repository.ts`, `collection-record-query-utils.ts`, `ai-branch-lookup-utils.ts`, and `ai-category.repository.ts`.

All ILIKE queries use the `ESCAPE '\'` clause alongside escaped patterns. Unit tests exist in `server/repositories/tests/sql-like-utils.test.ts`.

### Finding 5: Backup Export OOM Risk — ✅ FIXED

**Previous status:** `getBackupDataForExport()` loaded ALL tables into memory via `Promise.all([db.select()...])`
**Current status:** FIXED

**Evidence:** The backup export has been refactored to use streaming with cursor-based pagination:

- `server/repositories/backups-payload-utils.ts` — `prepareBackupPayloadFileForCreate()` uses:
  - `createWriteStream()` for file-based streaming
  - `appendPagedJsonArray()` with cursor-based pagination (`LIMIT 1000` per page)
  - Backpressure handling via `await once(writer, "drain")`
  - Incremental SHA256 hash computation

The old `Promise.all([db.select()...])` pattern is no longer present. The `QUERY_PAGE_LIMIT = 1000` setting controls page size, meaning only 1000 rows are in memory at any time per table.

**Note:** The backup restore still builds an unbounded `Set<string>` of `restoredCollectionRecordIds` (line 34 of `backups-restore-utils.ts`). At very large scale this Set could grow large, but this is far less severe than loading entire tables.

### Finding 6: WebSocket Early-Close Cleanup — ⚠️ STILL PRESENT (Revised Severity: Low)

**Previous status:** Early `ws.close()` calls don't remove connections from connectedClients Map
**Current status:** STILL PRESENT

**Evidence:** `server/ws/runtime-manager.ts` lines 74-127. The `wss.on("connection")` handler has four early-exit paths that call `ws.close()` without cleanup:

- **Line 79:** No token → `ws.close()` — no cleanup handler registered
- **Line 86:** Invalid activityId → `ws.close()` — no cleanup handler registered
- **Line 95:** Expired/invalid session → `ws.close()` — no cleanup handler registered
- **Line 125:** Catch block → `ws.close()` — no cleanup handler registered

**Revised assessment:** In all four early-exit cases, `connectedClients.set()` has NOT yet been called (it happens at line 104, after all early exits). Therefore the socket was never stored in the Map, and no stale entry exists. The close calls at lines 79, 86, 95, 125 are for sockets never stored in `connectedClients`. The 30-second heartbeat sweep (lines 47-67) also cleans up dead sockets.

**Practical impact:** Low. The early-close pattern is not defensive best practice, but it does not cause connection leaks because the socket was never added to the Map.

### Finding 7: Silent Receipt Catch Blocks — ✅ FIXED

**Previous status:** 5+ catch blocks in `collection-receipt.service.ts` lacking error logging
**Current status:** FIXED — All catch blocks now have proper error logging

**Evidence:** `server/routes/collection-receipt.service.ts` (324 lines) has 5 catch blocks, all with logging:

| Line | Function | Logging Method |
|------|----------|---------------|
| 110 | `resolveSelectedReceipt()` | `logCollectionReceiptBestEffortFailure()` |
| 134 | `resolveSelectedReceipt()` | `logCollectionReceiptBestEffortFailure()` |
| 174 | `pruneMissingRelationReceipt()` | `logCollectionReceiptBestEffortFailure()` |
| 248 | `serveCollectionReceipt()` | `logCollectionReceiptWarning()` |
| 314 | `serveCollectionReceipt()` | `logger.error()` |

### Additional Previously Reported Findings

#### CSRF Fallback Bypass — ✅ FIXED

**Previous status:** When auth cookie present but no CSRF token, no Origin, no Referer, and no sec-fetch-site header, the request was allowed through.
**Current status:** FIXED — `server/http/csrf.ts` line 79-83 now returns 403 `CSRF_SIGNAL_MISSING`.

#### x-forwarded-for Manual IP Parsing — ✅ FIXED

**Previous status:** `apiProtection.ts` manually parsed `x-forwarded-for`, bypassing Express trust proxy.
**Current status:** FIXED — `server/internal/apiProtection.ts` line 36 uses `req.ip`. Trust proxy configured separately in `server/http/trust-proxy.ts`.

#### Bulk Admin Rate Limiting — ✅ FIXED

**Previous status:** Bulk admin operations (kick/ban) lacked dedicated rate limits.
**Current status:** FIXED — `server/middleware/rate-limit.ts` defines `adminAction` rate limiter (30 req/10min). Applied to all kick/ban/bulk-delete endpoints. Bulk-delete also limits input array to 500 items.

#### Oversized Files (>700 lines) — PARTIALLY FIXED

| File | Previous Lines | Current Lines | Status |
|------|---------------|---------------|--------|
| collection-record-repository-utils.ts | 1,235 | 438 | ✅ FIXED (decomposed) |
| collection-record-mutation-operations.ts | 1,040 | 725 | ⬆ Improved (still >700) |
| storage-postgres-types.ts | 922 | 444 | ✅ FIXED (decomposed) |
| Viewer.tsx | 919 | 839 | ⬆ Improved (still >700) |
| auth-account-authentication-operations.ts | 887 | 552 | ✅ FIXED (reduced) |

3 of 5 previously oversized files have been successfully decomposed below 700 lines.

---

## New Findings

### NF-1: Mixed Pagination Patterns Across API Endpoints

**Severity:** Low
**Category:** API Design
**Status:** New
**Location:** Multiple repository files (`imports.repository.ts`, `audit.repository.ts`, `backups-list-utils.ts`, `auth-managed-user-utils.ts`)

**What was found:** The API uses two different pagination patterns inconsistently:
- **offset/limit pattern** — imports, activity, collection endpoints
- **page/pageSize pattern** — audit, backups, managed users endpoints

**Why it matters:** Frontend developers must handle two different pagination interfaces. Increases integration complexity.

**Recommended direction:** Standardize on one pattern (page/pageSize with totalPages) across all endpoints.
**Priority:** Fix Later

### NF-2: No Query-Level Timeouts on Parallel Database Operations

**Severity:** Low
**Category:** Performance / Reliability
**Status:** New
**Location:** `server/repositories/analytics.repository.ts`, other files using `Promise.all` with DB queries

**What was found:** Parallel database operations via `Promise.all` lack individual query timeouts.

**Why it matters:** If one query hangs under extreme database latency, all parallel queries block. The `connectionTimeoutMs` on the pool protects against connection acquisition but not query execution time.

**Recommended direction:** Consider adding `statement_timeout` at the PostgreSQL session level or wrapping critical `Promise.all` groups with timeout guards.
**Priority:** Monitor Only

### NF-3: Backup Restore Unbounded Set of Record IDs

**Severity:** Medium
**Category:** Performance
**Status:** Existing (carried forward)
**Location:** `server/repositories/backups-restore-utils.ts` line 34

**What was found:** The restore process builds `const restoredCollectionRecordIds = new Set<string>()` that grows linearly with backup size.

**Why it matters:** For very large backups with millions of records, this Set could consume significant memory. Far less severe than the old all-tables-in-memory pattern but still unbounded.

**Recommended direction:** Process receipt cache sync in batches during restore.
**Priority:** Fix Later

### NF-4: Files Approaching 700-Line Threshold

**Severity:** Low
**Category:** Maintainability
**Status:** New
**Location:** Multiple files between 600-700 lines

**What was found:** 7 files are approaching the 700-line threshold:

| File | Lines |
|------|-------|
| server/services/auth-account-managed-operations.ts | 698 |
| server/cluster-local.ts | 685 |
| server/internal/runtime-monitor-manager.ts | 675 |
| client/src/pages/BackupRestore.tsx | 669 |
| server/internal/coreSchemaBootstrap.ts | 644 |
| server/routes/collection-receipt-file-utils.ts | 628 |
| server/config/runtime.ts | 615 |

**Recommended direction:** Monitor during code review. Decompose if any grows past 700 lines.
**Priority:** Monitor Only

### NF-5: Heavy Frontend Dependencies in Bundle

**Severity:** Low
**Category:** Performance
**Status:** Existing observation
**Location:** `package.json`

**What was found:** The frontend bundle includes heavy libraries: recharts, framer-motion (~2.5MB gzipped), html2canvas, jspdf, xlsx, react-window.

**Why it matters:** On low-spec mobile devices, large JavaScript bundles impact initial load time.

**Recommended direction:** Existing mitigations (bundle budgets, code splitting, lazy loading, low-spec mode) are adequate. Continue monitoring.
**Priority:** Monitor Only

### NF-6: CSRF Same-Origin Sec-Fetch-Site Passthrough

**Severity:** Low
**Category:** Security
**Status:** New (by design)
**Location:** `server/http/csrf.ts` line 51-52

**What was found:** When a cookie-authenticated request has `sec-fetch-site: same-origin` but no CSRF token, the request is allowed through.

**Why it matters:** `Sec-Fetch-Site` is a browser-controlled header that cannot be spoofed by JavaScript in modern browsers (Chrome 76+, Firefox 90+, Safari 16.4+). This is a valid defense layer. On older browsers that don't send this header, the fallback chain correctly checks origin/referer and blocks if neither is present.

**Recommended direction:** Acceptable as-is. Consider telemetry for how often this fallback path is used.
**Priority:** Monitor Only

---

## C. Findings by Category

### C1. Backend

#### Architecture — GOOD

| Aspect | Status | Notes |
|--------|--------|-------|
| Layered architecture | ✅ Good | Clear routes → controllers → services → repositories |
| DI / composition | ✅ Good | Factory-based in `local-server-composition.ts` |
| Service boundaries | ✅ Good | Auth, collection, AI, backup, activity cleanly separated |
| Large files | ⚠️ Improved | Worst offenders reduced; 2 source files still >700 lines |
| PostgresStorage facade | ⚠️ Legacy | Some domains still use `PostgresStorage` instead of direct repos |
| Idempotency | ✅ Good | Mutation idempotency keys prevent double-submit |

#### API Quality — GOOD

| Aspect | Status | Notes |
|--------|--------|-------|
| Route naming | ✅ Consistent | RESTful `/api/` prefix, resource-oriented |
| Pagination | ⚠️ Mixed | offset/limit in some endpoints, page/pageSize in others |
| Response envelope | ✅ Consistent | `{ ok, message, data?, error? }` pattern |
| Validation | ✅ Strong | Zod schemas with `parseRequestBody()` utility |
| Error shape | ✅ Consistent | HttpError class with statusCode, code, details |
| Backup export | ✅ Fixed | Now uses streaming with pagination |
| N+1 risk | ✅ Fixed | Calendar upsert now batched via sql.join |

#### Reliability — GOOD

| Aspect | Status | Notes |
|--------|--------|-------|
| Circuit breaker | ✅ Well-designed | CLOSED/OPEN/HALF_OPEN with counter trimming |
| Graceful shutdown | ✅ Proper | 25s timeout, WebSocket cleanup, DB pool drain |
| WebSocket cleanup | ⚠️ Low risk | Early-close paths before socket is stored in Map |
| Error handling | ✅ Good | All receipt catch blocks now have logging |
| Idle session sweeper | ⚠️ Risk | Multiple queries without transaction wrapping |

#### Performance — GOOD

| Aspect | Status | Notes |
|--------|--------|-------|
| DB pool monitoring | ✅ Good | Pressure detection with throttled warnings |
| Caching | ✅ Present | AI search cache, settings cache, tab visibility cache (5s) |
| N+1 query | ✅ Fixed | Calendar upsert batched |
| Backup memory | ✅ Fixed | Streaming with cursor-based pagination |
| Structured logging | ✅ Good | Pino with automatic sensitive field redaction |
| Query timeouts | ⚠️ Missing | No per-query timeout on Promise.all DB operations |

#### Error Handling — GOOD

| Aspect | Status | Notes |
|--------|--------|-------|
| Global handler | ✅ Proper | Catches HttpError, entity-too-large, unhandled; logs context |
| Async handler | ✅ Proper | Wraps async routes, catches promise rejections |
| Error classes | ✅ Structured | HttpError with helpers (badRequest, unauthorized, etc.) |
| Receipt catches | ✅ Fixed | All catch blocks have structured logging |
| Error codes | ✅ Shared | Shared error codes in `shared/error-codes.ts` |

---

### C2. Frontend

#### Architecture — GOOD

| Aspect | Status | Notes |
|--------|--------|-------|
| Component structure | ✅ Good | Modular pages with sub-components |
| UI library | ✅ Good | 40+ Radix-based components (shadcn/ui pattern) |
| State management | ✅ Good | React Query for server state, Context for AI |
| Centralized API client | ✅ Good | `apiRequest()` with CSRF, error handling, request IDs |
| Oversized components | ⚠️ Improved | Viewer.tsx reduced from 919→839 lines |
| Code splitting | ✅ Good | Lazy pages, manual chunks (validation, query, charts, excel, pdf) |
| Device detection | ✅ Good | Low-spec mode: cores ≤4, RAM ≤4GB → reduced animations |

#### Data Flow — GOOD

| Aspect | Status | Notes |
|--------|--------|-------|
| React Query | ✅ Proper | Consistent query lifecycle with loading/error states |
| Abort controllers | ✅ Present | Cancellation on unmount/navigation via AbortSignal |
| Cache invalidation | ✅ Good | Event-driven refresh pattern |
| Loading states | ✅ Consistent | Skeleton loaders for major pages |
| Request tracking | ✅ Good | UUID-based x-request-id for debugging |

#### Performance — GOOD

| Aspect | Status | Notes |
|--------|--------|-------|
| Virtual scrolling | ✅ Present | react-window on Viewer tables |
| Low-spec mode | ✅ Innovative | RAM/CPU detection, reduced animations, longer stale times |
| Bundle splitting | ✅ Good | Manual chunks for heavy libs; bundle budgets CI check |

---

### C3. UI/UX

#### Screen-by-Screen Assessment

| Screen/Module | Desktop | Mobile | Verdict |
|---------------|---------|--------|---------|
| Login | ✅ Clean | ✅ Good (2FA, fingerprint) | Keep as-is |
| Dashboard | ✅ Good | ✅ Acceptable | Keep as-is |
| Viewer | ✅ Good (virtual scroll) | ✅ Card layout on mobile | Keep as-is |
| General Search | ✅ Good | ✅ Responsive filters | Keep as-is |
| Import | ✅ Good | ✅ Drag-and-drop | Keep as-is |
| Saved | ✅ Good | ⚠️ Acceptable | Keep with minor polish |
| Collection Daily | ✅ Good | ✅ Calendar responsive | Keep as-is |
| Collection Records | ✅ Good | ⚠️ min-w-1280 forces scroll | Needs minor fix |
| Collection Save Form | ✅ Good | ✅ Keyboard-aware sticky | Keep as-is |
| Collection Summary | ✅ Good | ✅ Acceptable | Keep as-is |
| Collection Report | ✅ Good | ⚠️ Acceptable | Keep with minor polish |
| AI Chat/FloatingAI | ✅ Good | ✅ Excellent (fullscreen, safe-area) | Keep as-is |
| Activity Logs | ✅ Good | ⚠️ max-h-400px hardcoded | Needs minor fix |
| Audit Logs | ✅ Good | ⚠️ Acceptable | Keep with minor polish |
| Backup/Restore | ✅ Good | ⚠️ Complex flow | Keep with minor polish |
| Settings | ✅ Good | ✅ Acceptable | Keep as-is |
| Analysis | ✅ Good | ⚠️ Charts may be small | Keep with minor polish |
| Navbar | ✅ Good | ✅ Sheet drawer works well | Keep as-is |

---

### C4. API Design

| Aspect | Status | Detail |
|--------|--------|--------|
| RESTful naming | ✅ Good | `/api/collection/records`, `/api/auth/session`, etc. |
| HTTP methods | ✅ Correct | GET for reads, POST for creates, PATCH for updates, DELETE for deletes |
| Pagination | ⚠️ Mixed | offset/limit in some endpoints, page/pageSize in others |
| Filtering | ✅ Present | Advanced filters with operators (contains, equals, greaterThan, etc.) |
| Validation | ✅ Strong | Zod schemas on all input via `parseRequestBody()` |
| Error responses | ✅ Consistent | `{ ok: false, message, error: { code, details } }` |
| Idempotency | ✅ Good | x-idempotency-key header for mutations |
| Rate limiting | ✅ Strong | Per-endpoint tiers with adaptive load adjustment |

**Route registration** (from `local-server-composition.ts`):
- `/api/auth/*` — session, login, recovery, admin account management
- `/api/activity/*` — session tracking, kick/ban operations
- `/api/imports/*` — file upload and processing
- `/api/search/*` — global and advanced search
- `/api/ai/*` — AI search and chat
- `/api/settings/*` — system configuration
- `/api/operations/*` — operational analytics
- `/api/collection/*` — collection records, receipts, reports, nicknames
- `/api/admin/*` — admin user management

---

### C5. Database

**Tables:** 37 PostgreSQL tables, 400+ columns, 100+ indexes

| Aspect | Status | Detail |
|--------|--------|--------|
| Table design | ✅ Good | Logical grouping, proper naming |
| Indexing | ✅ Strong | 100+ indexes, composite where needed, case-insensitive |
| Primary keys | ✅ Fixed | All tables including rollup tables now have PKs |
| Soft deletes | ✅ Present | `isDeleted` flag on imports, receipts |
| Relations | ⚠️ Incomplete | Some tables reference others by text without FK constraints |
| Enum constraints | ⚠️ Missing | Status/role fields are TEXT without CHECK constraints |
| Normalization | ⚠️ Denormalized | userActivity stores redundant username/role |
| Audit trail | ✅ Present | auditLogs + settingVersions |
| Migrations | ✅ Good | 21 idempotent SQL migrations with `IF NOT EXISTS` |
| Pool monitoring | ✅ Good | Pressure detection, event listeners, throttled warnings |
| Transaction safety | ✅ Good | `db.transaction()` used for multi-step operations, some with `FOR UPDATE` locks |

---

### C6. Security

| Aspect | Status | Detail |
|--------|--------|--------|
| CSRF | ✅ Excellent | Double-submit token + Sec-Fetch-Site + Origin/Referer + block-by-default |
| JWT | ✅ Secure | HS256, timing-safe verification, secret rotation via `previousSessionSecrets` |
| Bcrypt | ✅ Excellent | Cost 12, timing-safe with dummy hash for non-existent users |
| Rate limiting | ✅ Strong | Multi-tier (login: 15/10min, recovery: 20/10min, admin: 30/10min, search: 10/10s) + adaptive |
| File upload | ✅ Excellent | Magic byte validation, PDF JS/action blocking, EXIF/XMP/IPTC/ICC stripping, dimension limits |
| CORS | ✅ Proper | Configurable allowlist, rejects unsafe wildcards |
| SQL injection | ✅ Protected | Drizzle ORM parameterized queries + LIKE escaping across all repositories |
| Secrets | ✅ Good | .gitignore covers .env/.env.*, no hardcoded secrets, placeholder rejection in production |
| Trust proxy | ✅ Good | Explicit proxy allowlist, prevents IP spoofing of rate limits |
| Cookie security | ✅ Good | httpOnly, sameSite: lax, conditional secure flag, CSRF token: randomBytes(32) |
| Role enforcement | ✅ Good | `requireRole()` middleware on all admin routes |
| Idempotency | ✅ Good | Duplicate mutation prevention with fingerprint validation |
| 2FA | ⚠️ Fallback | Falls back to SESSION_SECRET if `TWO_FACTOR_ENCRYPTION_KEY` not configured |

---

### C7. Performance

| Area | Status | Risk Level |
|------|--------|------------|
| DB connection pool | ✅ Monitored | Low — pressure detection with throttled warnings |
| Search caching | ✅ Present | Low — AI search cache, settings cache |
| Virtual table rendering | ✅ Present | Low — react-window on Viewer |
| Bundle splitting | ✅ Proper | Low — manual chunks, bundle budgets |
| Backup export | ✅ Fixed | Low — streaming with pagination (was Critical) |
| N+1 calendar upsert | ✅ Fixed | Low — batched via sql.join (was Critical) |
| Backup restore Set | ⚠️ Unbounded | Medium — grows linearly with backup size |
| Heavy frontend libs | ⚠️ Present | Low — mitigated by lazy loading and code splitting |
| Database protection mode | ✅ Good | Disables heavy queries under high DB latency |

---

### C8. Maintainability

| Aspect | Status | Detail |
|--------|--------|--------|
| TypeScript strict mode | ✅ Enabled | Full type safety |
| Shared schemas | ✅ Good | schema-postgres.ts + api contracts |
| CI pipeline | ✅ Comprehensive | typecheck → DB governance → tests → build → budgets → Playwright smoke |
| Documentation | ✅ Extensive | 20+ docs files, ARCHITECTURE.md, deployment guides |
| Test coverage | ✅ Good | 226 tests across 84 files, integration tests for all route families |
| Large files | ⚠️ Improved | 2 source files still >700 lines (down from 5) |
| Architecture docs | ✅ Good | ARCHITECTURE.md describes entry points, assembly, request flow |

---

## D. Module-by-Module Review

### 1. Auth / Account / Session

| Aspect | Finding |
|--------|---------|
| **Files** | `server/routes/auth/` (5 files), `server/services/auth-account-*.ts` (7 files), `server/auth/` (guards, JWT, session-cookie, passwords) |
| **Strengths** | Timing-safe bcrypt (cost 12), JWT secret rotation, login lockout with exponential backoff, forced password change flow, dummy hash for non-existent users, 2FA support, device fingerprinting |
| **Weaknesses** | 2FA encryption key fallback to SESSION_SECRET; auth-account-authentication-operations.ts at 552 lines |
| **Security risks** | Low — 2FA fallback only when env var not set |
| **Verdict** | ✅ Keep as-is (enforce 2FA key in production) |

### 2. Collection Flows (Records, Save, Edit, Delete)

| Aspect | Finding |
|--------|---------|
| **Files** | `server/routes/collection/` (5 files), `server/services/collection/` (12 files), `server/repositories/collection-*.ts` (10+ files) |
| **Strengths** | Idempotency keys for duplicate-submit prevention, event-driven refresh, role-based access |
| **Weaknesses** | collection-record-mutation-operations.ts at 725 lines |
| **Verdict** | ✅ Keep as-is (decompose mutation file during next feature change) |

### 3. Collection Daily / Summary / Nickname

| Aspect | Finding |
|--------|---------|
| **Files** | `server/services/collection/collection-daily-*.ts`, `collection-nickname.service.ts`, `collection-daily-repository-utils.ts` |
| **Strengths** | Calendar upsert now batched (FIXED), rollup refresh queue with retry/backoff, nickname session management |
| **Verdict** | ✅ Keep as-is |

### 4. Receipt Handling

| Aspect | Finding |
|--------|---------|
| **Files** | `collection-receipt.service.ts` (324 lines), `collection-receipt-file-utils.ts` (628 lines), `collection-receipt-security.ts` (722 lines) |
| **Strengths** | Comprehensive file validation, all catch blocks now logged (FIXED), legacy compatibility bridge |
| **Verdict** | ✅ Keep as-is — excellent security posture |

### 5. General Search

| Aspect | Finding |
|--------|---------|
| **Files** | `search.routes.ts`, `search.service.ts`, `search.repository.ts` (318 lines) |
| **Strengths** | LIKE escaping via `buildLikePattern()`, parameterized queries, column allowlist, rate-limited |
| **Verdict** | ✅ Keep as-is |

### 6. Viewer

| Aspect | Finding |
|--------|---------|
| **Files** | `Viewer.tsx` (839 lines), `client/src/pages/viewer/` (46 sub-components) |
| **Strengths** | Virtual scrolling, mobile card layout, debounced search, abort controllers, low-spec mode |
| **Weaknesses** | Still 839 lines — mixes table, filter, and export logic |
| **Verdict** | ✅ Functional, but decompose during next feature change |

### 7. Activity / Audit

| Aspect | Finding |
|--------|---------|
| **Files** | `activity.routes.ts`, `activity.service.ts`, `activity.repository.ts` |
| **Strengths** | Rate-limited bulk operations (FIXED), role-enforced kick/ban, structured audit logging |
| **Weaknesses** | Idle session sweeper lacks transaction wrapping |
| **Verdict** | ⚠️ Add transaction to sweeper when modifying this module |

### 8. Dashboard / Analysis

| Aspect | Finding |
|--------|---------|
| **Files** | `Dashboard.tsx` (197 lines), `Analysis.tsx` (389 lines) |
| **Strengths** | Clean layout, lazy-loaded charts, skeleton loading |
| **Verdict** | ✅ Keep as-is |

### 9. Settings / Admin / Security

| Aspect | Finding |
|--------|---------|
| **Files** | `settings.routes.ts`, `settings.service.ts`, `settings.repository.ts` (532 lines) |
| **Strengths** | Category-based organization, version tracking, role-based visibility, cached |
| **Verdict** | ✅ Keep as-is |

### 10. Backup / Export / Import

| Aspect | Finding |
|--------|---------|
| **Files** | `backup-operations.service.ts`, `backups-payload-utils.ts`, `backups-restore-utils.ts` (54 lines), `BackupRestore.tsx` (669 lines) |
| **Strengths** | Streaming export with pagination (FIXED), SHA256 integrity, circuit breaker, async job queue, full-transaction restore |
| **Weaknesses** | Restore still builds unbounded Set; BackupRestore.tsx at 669 lines |
| **Verdict** | ✅ Keep as-is — major previous issue resolved |

---

## E. Mobile vs Desktop / Responsive Behavior

### Desktop — GOOD

**Strengths:**
- Clean card-based layouts with proper max-width constraints
- Consistent spacing and responsive grid patterns
- Virtual scrolling on large tables (react-window)
- Keyboard shortcuts for power users (gated by mobile detection)
- Proper modal sizing and behavior
- Charts render well at desktop widths
- Sticky navbar with backdrop blur

**Desktop-specific risks:** None visual. Viewer.tsx at 839 lines is a maintainability concern, not visual.

### Mobile — GOOD

**Strengths:**
- FloatingAI excellent: fullscreen mode, safe-area-aware, keyboard-aware, auto-minimize on editable focus, avoid-overlap system
- Navbar hamburger menu with Sheet drawer (min 92vw, max 22rem)
- Collection Save form: keyboard state detection, sticky-to-static toggle
- Dialogs/modals use 100dvh correctly with max-height constraints
- Touch targets properly sized (> 44px)
- Low-spec mode reduces animations on constrained devices (cores ≤4, RAM ≤4GB)
- `env(safe-area-inset-bottom)` used throughout for notched devices
- 100dvh with @supports fallback properly implemented (FIXED)

**Mobile-specific issues:**

| Element | Status | Detail |
|---------|--------|--------|
| Page min-height | ✅ Fixed | Now uses 100dvh with @supports fallback |
| Floating AI | ✅ Excellent | z-[60] only on mobile, auto-minimize, scroll lock |
| Dialogs/Modals | ✅ Good | 100dvh-aware, max-height constraints |
| Collection Records table | ⚠️ Fragile | min-w-1280px forces horizontal scroll on tablets |
| Activity table height | ⚠️ Fragile | Hardcoded 400px max-height |
| Charts (Analysis) | ⚠️ Minor | May be small on narrow screens |

### Floating AI Impact

The FloatingAI component (559 lines) is well-optimized for mobile with no layout interference. Uses `useIsMobile()`, conditional fullscreen, auto-minimize on editable focus, scroll lock, and viewport state awareness.

---

## F. Priority Matrix

### Critical — Fix Now

No critical issues remain. All previous Critical items have been FIXED.

### High — Fix Next

| # | Issue | Area | File/Location | Impact |
|---|-------|------|---------------|--------|
| 1 | Backup restore unbounded Set accumulation | Performance | `backups-restore-utils.ts:34` | Memory risk on very large restores |
| 2 | Idle session sweeper lacks transaction | Reliability | `idle-session-sweeper.ts` | Race condition risk |
| 3 | WebSocket early-close paths lack defensive cleanup | Reliability | `runtime-manager.ts:79,86,95,125` | Low practical risk but not defensive |

### Medium — Fix Later

| # | Issue | Area | File/Location | Impact |
|---|-------|------|---------------|--------|
| 4 | Mixed pagination patterns | API Design | Multiple repository files | Inconsistent developer experience |
| 5 | CollectionRecordsTable min-w-1280px | Frontend/Mobile | Collection records page | Forces scroll on tablets |
| 6 | ActivityLogsTable hardcoded max-h-400px | Frontend/Mobile | Activity page | Non-responsive table height |
| 7 | Status/role fields lack CHECK constraints | Database | `schema-postgres.ts` | Invalid data insertion risk |
| 8 | 2FA encryption key fallback | Security | `server/config/security.ts` | Weakens 2FA independence |
| 9 | Viewer.tsx at 839 lines | Maintainability | `Viewer.tsx` | Complex to maintain |
| 10 | collection-record-mutation-operations.ts at 725 lines | Maintainability | `collection/` | Complex to maintain |

### Low — Monitor Only

| # | Issue | Area | File/Location | Impact |
|---|-------|------|---------------|--------|
| 11 | No per-query timeouts on Promise.all DB ops | Performance | Multiple repository files | Theoretical risk |
| 12 | Heavy frontend bundle | Performance | `package.json` | Mitigated by code splitting |
| 13 | Files approaching 700-line threshold | Maintainability | 7 files between 600-700 lines | Proactive monitoring |
| 14 | Worker restart errors swallowed | Reliability | `cluster-local.ts` | Low-frequency edge case |
| 15 | CSRF sec-fetch-site same-origin passthrough | Security | `csrf.ts:51-52` | By design, valid |

---

## System Health Score

### Score: 8.2 / 10

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Architecture | 9/10 | 15% | 1.35 |
| Security | 9/10 | 20% | 1.80 |
| Reliability | 8/10 | 15% | 1.20 |
| Performance | 8/10 | 10% | 0.80 |
| Error Handling | 9/10 | 10% | 0.90 |
| Frontend/UX | 8/10 | 10% | 0.80 |
| Database | 8/10 | 10% | 0.80 |
| Maintainability | 7/10 | 10% | 0.70 |
| **Total** | | **100%** | **8.35 → 8.2** |

---

## Critical Path Summary

**Most important next actions, in order:**

1. ✅ ~~Fix backup export OOM risk~~ — **DONE** (streaming with pagination)
2. ✅ ~~Fix N+1 calendar upsert~~ — **DONE** (sql.join batch)
3. ✅ ~~Fix 100dvh viewport fallback~~ — **DONE** (@supports fallback)
4. ✅ ~~Fix SQL LIKE wildcard escaping~~ — **DONE** (sql-like-utils.ts)
5. ✅ ~~Fix rollup table PKs~~ — **DONE** (composite primaryKey())
6. ✅ ~~Fix silent receipt catch blocks~~ — **DONE** (all logged)
7. ✅ ~~Fix CSRF fallback bypass~~ — **DONE** (blocks by default)
8. ✅ ~~Fix bulk admin rate limiting~~ — **DONE** (30 req/10min)
9. ⚠️ **Add transaction to idle session sweeper** — Prevents race conditions
10. ⚠️ **Batch backup restore Set accumulation** — Prevents memory growth at scale
11. ⚠️ **Add defensive cleanup to WebSocket early-close paths** — Best practice
12. 📋 **Standardize pagination patterns** — Improves developer experience
13. 📋 **Decompose 2 remaining oversized files** — Improves maintainability

---

## G. Improvement Roadmap

### Immediate (Before Next Deployment)

No blocking issues remain. All previous Critical items have been fixed. The system is safe for deployment as-is.

### Short-Term (Next Sprint)

1. **Add transaction wrapping to idle session sweeper** — wrap the sweep loop in `db.transaction()` to prevent partial updates
2. **Add defensive cleanup to WebSocket early-close paths** — register error/close handlers before any early-exit `ws.close()` calls
3. **Enforce 2FA encryption key in production** — reject SESSION_SECRET fallback when `NODE_ENV=production`
4. **Standardize pagination** — choose page/pageSize across all endpoints

### Medium-Term (Following Sprint)

1. **Batch backup restore** — process restored record IDs in chunks instead of unbounded Set
2. **Fix CollectionRecordsTable responsive width** — responsive min-width instead of 1280px
3. **Fix ActivityLogsTable height** — viewport-relative max-height
4. **Add CHECK constraints for status/role fields** — migration to add enum constraints

### Long-Term (Future Quarter)

1. **Decompose Viewer.tsx** — extract filter, table, and export into separate components
2. **Decompose collection-record-mutation-operations.ts** — extract sub-operations
3. **Complete PostgresStorage → direct repository migration** — remove legacy facade
4. **Add NOT NULL constraints** to currently nullable critical fields
5. **Normalize userActivity table** — remove redundant denormalized columns

---

## H. Final Verdict

### Is the system stable enough for controlled production use?

**Yes.** The SQR system is ready for production deployment. All previously identified Critical issues have been resolved. The architecture is sound, security is multi-layered and comprehensive, error handling is structured and observable, and performance-sensitive paths have been optimized.

### What still blocks higher confidence?

Nothing blocks deployment. The remaining issues are defensive hardening and maintainability improvements:

- Idle session sweeper transaction wrapping (edge case race condition)
- Backup restore unbounded Set (only matters at very large scale)
- WebSocket early-close cleanup (low practical risk — sockets never stored before rejection)
- 2FA encryption key enforcement in production config

### What is technical debt but not a blocker?

- Mixed pagination patterns across API endpoints
- 2 source files exceeding 700 lines (Viewer.tsx, collection-record-mutation-operations.ts)
- 7 files approaching the 700-line threshold
- Missing CHECK constraints on status/role TEXT fields
- Denormalized userActivity table
- PostgresStorage facade still used by some domains

### Comparison Summary

The system has meaningfully improved since the previous audit:
- **5 of 7 critical findings FIXED** (backup OOM, N+1 batch, 100dvh, LIKE escaping, receipt logging)
- **1 finding remains with reduced severity** (WebSocket cleanup — lower risk than initially assessed)
- **3 additional findings FIXED** (CSRF bypass, IP parsing, bulk rate limiting)
- **3 of 5 previously oversized files decomposed** below 700 lines
- **System health score improved from 7.5 to 8.2** out of 10

---

## Appendix: Metrics Summary

| Metric | Value |
|--------|-------|
| Total TypeScript/TSX files | ~791 |
| Total lines of code | ~129,434 |
| PostgreSQL tables | 37 |
| Database columns | 400+ |
| Database indexes | 100+ |
| Database migrations | 21 |
| API endpoints | ~100 |
| React pages | 24 main + ~200 sub-components |
| Custom hooks | 14 shared hooks |
| UI components | 40+ (Radix/shadcn) |
| NPM dependencies | 141 |
| Test files | 84 (226 tests) |
| Documentation files | 20+ |
| Files >700 lines (source) | 4 (schema-postgres: 898, Viewer: 839, sidebar: 727, mutation-ops: 725) |
| Files >700 lines (tests) | 6 (integration tests — acceptable) |
| Largest server source file | shared/schema-postgres.ts (898 lines) |
| Largest client source file | client/src/pages/Viewer.tsx (839 lines) |
| Node version | ≥24 |
| Build tool | Vite + esbuild |
| Database | PostgreSQL 16 |
| ORM | Drizzle 0.39 |
| Test runner | Node.js built-in (via tsx --test) |
| CI | GitHub Actions (typecheck → DB governance → tests → build → bundle budgets → Playwright smoke) |
