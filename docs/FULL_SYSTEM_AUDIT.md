# SQR Full System Technical Audit

**Date:** 2026-03-30
**Scope:** Full-system review — backend, frontend, UI/UX, layout, mobile responsiveness, API design, database design, security, performance, error handling, module architecture, maintainability

---

## A. Executive Summary

### Overall Judgment

The SQR system is a well-architected, production-quality full-stack TypeScript application. It demonstrates mature engineering practices including layered architecture (routes → controllers → services → repositories), structured error handling, circuit breakers, adaptive rate limiting, comprehensive file validation, and strong CSRF/JWT security. The codebase is well above average for its stage.

### Top Strengths

1. **Clean layered architecture** — clear separation between routes, controllers, services, and repositories with factory-based DI
2. **Strong security posture** — multi-layer CSRF (double-submit + Fetch metadata + origin/referer), timing-safe bcrypt (cost 12), JWT with secret rotation, comprehensive file upload validation (magic bytes, PDF JS blocking, EXIF stripping)
3. **Resilience patterns** — circuit breakers on AI/export, adaptive rate limiting (NORMAL/DEGRADED/PROTECTION), AI concurrency gate with per-role limits, worker clustering with crash detection
4. **Comprehensive testing** — 226 tests across 84 files, CI pipeline with typecheck → tests → build → Playwright smoke
5. **Structured logging** — zero console.log in server code; all logging via pino
6. **Database monitoring** — connection pool pressure tracking with throttled warnings

### Top Weaknesses

1. **Backup/restore memory risk** — loads entire database into memory for export (no streaming, no pagination)
2. **N+1 query** — per-day INSERT loop in collection daily calendar upsert (30 queries instead of 1)
3. **WebSocket connection leak risk** — early-close paths don't clean up the connected clients map
4. **Swallowed errors** — 6+ catch blocks in receipt service silently return null without logging
5. **100vh vs 100dvh** — global page min-height uses 100vh which clips content on mobile Safari
6. **Missing primary keys** — 3 rollup/queue tables lack a proper PK (only composite unique index)

### Overall Technical Health

**7.5/10** — Solid architecture with good security. Main risks are in performance-sensitive paths (backup, WebSocket scale) and a few mobile viewport issues. Safe for initial production with the priority fixes below.

### Production-Readiness Judgment

**Conditionally ready.** The system can serve production traffic at moderate scale. Critical items to address before high-load production: backup streaming, WebSocket cleanup, and the N+1 query pattern.

---

## B. Architecture Overview

### Backend Structure

```
server/
├── config/           # Runtime config (615 lines), security, body limits
├── auth/             # Guards, JWT, passwords, 2FA, activation, lifecycle
├── http/             # Express middleware: CSRF, CORS, validation, errors, async-handler
├── middleware/        # Error handler, rate limiters
├── internal/         # DI composition, runtime environment, API protection, circuit breaker,
│                       AI concurrency gate, idle session sweeper, cluster management
├── routes/           # 9 route groups (auth, collection, operations, ai, activity, search, etc.)
├── controllers/      # 4 main controllers (search, operations, ai, imports)
├── services/         # 50+ service files (auth, AI, backup, collection, activity, etc.)
├── repositories/     # 20+ repos + utility files (collection record utils: 1235 lines)
├── storage/          # PostgreSQL storage adapters
├── ws/               # WebSocket runtime manager, session auth
├── lib/              # Logger, receipt security, upload parser
└── sql/              # Manual SQL migrations
```

### Frontend Structure

```
client/src/
├── app/              # App shell: routing, providers, auth bootstrap, navigation (10+ hooks)
├── components/       # Shared: Navbar (381 lines), FloatingAI (559 lines), AIChat (496 lines),
│                       AutoLogout, UI library (40+ Radix wrappers)
├── context/          # AIContext
├── hooks/            # 12 custom hooks (mobile, pagination, shortcuts, feedback)
├── lib/              # API client, auth session, query client, utilities
├── pages/            # 22 main pages + 103 collection sub-components + supporting files
├── styles/           # ai.css, FloatingAI.module.css
└── types/            # Type declarations
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
- **Backup** directly queries all major tables for export and performs full-table restore
- **Activity** tracks user sessions, integrates with WebSocket heartbeat and auto-logout
- **Settings** drives feature flags and tab visibility used across frontend

---

## C. Full Findings by Category

### Backend

#### Architecture — GOOD (minor improvement areas)

| Aspect | Status | Notes |
|--------|--------|-------|
| Layered architecture | ✅ Good | Clear routes → controllers → services → repositories |
| DI / composition | ✅ Good | Factory-based in `local-server-composition.ts` (414 lines) |
| Service boundaries | ✅ Good | Auth, collection, AI, backup, activity cleanly separated |
| Duplicated logic | ⚠️ Minor | Some receipt-handling logic duplicated across service + route |
| Large files | ⚠️ Notable | `collection-record-repository-utils.ts` (1235 lines), `collection-record-mutation-operations.ts` (1040 lines), `cluster-local.ts` (685 lines) |
| PostgresStorage facade | ⚠️ Legacy | Some domains still use `PostgresStorage` instead of direct repos |
| Missing domain boundaries | ✅ OK | Collection sub-modules are well-separated |

#### API Quality — GOOD

| Aspect | Status | Notes |
|--------|--------|-------|
| Route naming | ✅ Consistent | RESTful `/api/` prefix, resource-oriented |
| Pagination | ✅ Present | Server-side pagination with configurable limits |
| Response envelope | ✅ Consistent | `{ ok, message, data?, error? }` pattern |
| Validation | ✅ Strong | Zod schemas, input parsing via `buildRequestValidation` |
| Error shape | ✅ Consistent | HttpError class with statusCode, code, details |
| Status codes | ✅ Correct | Proper 400/401/403/404/409/413/500 usage |
| Large payload risk | ⚠️ High | Backup export returns entire DB as JSON in response body |
| N+1 risk | ⚠️ Present | Collection daily calendar upsert (30 sequential INSERTs) |

#### Security — STRONG (see Section F for details)

| Aspect | Status | Notes |
|--------|--------|-------|
| CSRF | ✅ Excellent | Double-submit + Fetch metadata + origin/referer |
| JWT | ✅ Secure | HS256, 24h expiry, secret rotation support |
| Bcrypt | ✅ Excellent | Cost 12, timing-safe with dummy hash for non-existent users |
| Rate limiting | ✅ Strong | Multi-tier, adaptive, load-aware |
| File upload | ✅ Excellent | Magic byte validation, PDF JS blocking, EXIF stripping |
| CORS | ✅ Proper | Configurable allowlist, rejects unsafe wildcards |
| SQL injection | ✅ Protected | Drizzle ORM parameterized queries + LIKE escaping |
| 2FA fallback | ⚠️ Medium | Falls back to SESSION_SECRET if 2FA key not configured |

#### Reliability — GOOD (with risks)

| Aspect | Status | Notes |
|--------|--------|-------|
| Circuit breaker | ✅ Well-designed | CLOSED/OPEN/HALF_OPEN with counter trimming |
| Graceful shutdown | ✅ Proper | 25s timeout, WebSocket cleanup, DB pool drain |
| Missing transactions | ⚠️ Risk | Idle session sweeper: multiple queries without transaction |
| Fire-and-forget | ⚠️ Present | Worker restart errors swallowed (`catch(() => undefined)`) |
| WebSocket cleanup | ⚠️ Risk | Early-close paths skip map cleanup |
| Swallowed errors | ⚠️ Present | 6+ catch blocks in receipt service return null silently |

#### Performance — GOOD (with critical spots)

| Aspect | Status | Notes |
|--------|--------|-------|
| DB pool monitoring | ✅ Good | Pressure detection with throttled warnings |
| Caching | ✅ Present | AI search cache, settings cache, tab visibility cache (5s) |
| N+1 query | 🔴 Critical | 30 INSERTs in loop for calendar days |
| Backup memory | 🔴 Critical | Loads ALL tables into memory for export |
| Set accumulation | 🔴 High | Backup restore builds unbounded Set of record IDs |
| Structured logging | ✅ Good | Pino throughout, zero console.log |

#### Error Handling — GOOD

| Aspect | Status | Notes |
|--------|--------|-------|
| Global handler | ✅ Proper | Catches HttpError, 413, unhandled; logs context |
| Async handler | ✅ Proper | Wraps async routes, catches promise rejections |
| Error classes | ✅ Structured | HttpError with helpers (badRequest, unauthorized, etc.) |
| Swallowed catches | ⚠️ Weak | 6 silent catch blocks in receipt service |
| Error codes | ✅ Shared | 13 error codes in `shared/error-codes.ts` |

---

### Frontend

#### Architecture — GOOD

| Aspect | Status | Notes |
|--------|--------|-------|
| Component structure | ✅ Good | Modular pages with sub-components |
| UI library | ✅ Good | 40+ Radix-based components (shadcn/ui pattern) |
| State management | ✅ Good | React Query for server state, Context for AI |
| App shell hooks | ⚠️ Complex | 10+ interconnected hooks for shell state |
| Oversized components | ⚠️ Notable | Viewer.tsx (919), BackupRestore.tsx (669), FloatingAI.tsx (559), Login.tsx (513) |
| Code splitting | ✅ Good | Lazy pages, manual chunks (validation, query, charts, excel, pdf) |
| Prop drilling | ✅ Minimal | Hooks-based architecture avoids deep drilling |

#### Data Flow — GOOD

| Aspect | Status | Notes |
|--------|--------|-------|
| React Query | ✅ Proper | Consistent query lifecycle with loading/error states |
| Abort controllers | ✅ Present | Cancellation on unmount/navigation |
| COLLECTION_DATA_CHANGED_EVENT | ✅ Good | Cross-hook data refresh pattern |
| Cache invalidation | ✅ Good | Event-driven refresh pattern |
| Loading states | ✅ Consistent | Skeleton loaders for major pages |
| Empty states | ⚠️ Inconsistent | Some pages lack mobile-optimized empty state UI |

#### Performance — GOOD

| Aspect | Status | Notes |
|--------|--------|-------|
| Virtual scrolling | ✅ Present | react-window on Viewer tables |
| Low-spec mode | ✅ Innovative | RAM/CPU detection, reduced animations |
| Debounced search | ✅ Good | 300ms debounce |
| Bundle splitting | ✅ Good | Manual chunks for heavy libs (xlsx, jspdf, recharts) |
| Memory leaks | ⚠️ Low risk | Modal lifecycle, observer cleanup appear proper |

#### UX Behavior — GOOD

| Aspect | Status | Notes |
|--------|--------|-------|
| Form validation | ✅ Good | Zod + React Hook Form with inline messages |
| Toast feedback | ✅ Consistent | Success/error toasts after mutations |
| Error recovery | ✅ Good | Error boundary with retry/home/reload options |
| Modal behavior | ✅ Good | Proper 100dvh sizing, safe-area-aware |
| Keyboard shortcuts | ✅ Present | Gated by mobile detection |

---

### UI/UX

#### Screen-by-Screen Assessment

| Screen/Module | Desktop | Mobile | Verdict |
|---------------|---------|--------|---------|
| Login | ✅ Clean | ✅ Good (2FA, fingerprint) | Keep as-is |
| Dashboard | ✅ Good | ✅ Acceptable | Keep with minor polish |
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

### Layout & Responsiveness

#### Desktop — GOOD
- Clean layouts with proper max-width constraints
- Consistent spacing and card-based design
- Sticky navbar with backdrop blur
- Virtual scrolling on large tables

#### Mobile — GOOD with issues

| Element | Status | Detail |
|---------|--------|--------|
| Navbar hamburger | ✅ Good | Sheet drawer, proper width (min 92vw, max 22rem) |
| Tab/navigation bars | ✅ Good | Responsive stacking |
| Floating AI | ✅ Excellent | Fullscreen mode, safe-area, keyboard-aware, avoid-overlap system |
| Dialogs/Modals | ✅ Good | 100dvh-aware, max-height constraints |
| Collection Save form | ✅ Good | Keyboard state detection, sticky-to-static toggle |
| Tables | ⚠️ Fragile | CollectionRecords: min-w-1280px forces scroll on tablets |
| Page min-height | 🔴 Broken | Uses 100vh instead of 100dvh — clips on mobile Safari |
| Activity table height | ⚠️ Fragile | Hardcoded 400px max-height |
| Safe area handling | ✅ Good | env(safe-area-inset-bottom) used throughout |
| Touch targets | ✅ Good | Button heights > 44px |

#### Critical Layout Bugs

1. **100vh in index.css** — `min-height: calc(100vh - 3.5rem)` used for main content area. On mobile Safari, 100vh includes the address bar height, causing content to be clipped. Affects 10+ pages. Fix: use 100dvh with fallback.

2. **CollectionRecordsTable min-w-1280px** — Forces horizontal scroll on all devices below 1280px width, including tablets. Should use responsive min-width or a different mobile layout.

3. **ActivityLogsTable max-h-400px** — Fixed height doesn't adapt to viewport. On short mobile screens, the table area is too large; on tall screens, it wastes space.

---

### API Design

| Aspect | Status | Detail |
|--------|--------|--------|
| RESTful naming | ✅ Good | `/api/collection/records`, `/api/auth/session`, etc. |
| HTTP methods | ✅ Correct | GET for reads, POST for creates, PATCH for updates, DELETE for deletes |
| Pagination | ✅ Present | `page` + `limit` with server-side enforcement |
| Filtering | ✅ Present | Advanced filters with operators |
| Validation | ✅ Strong | Zod schemas on all input |
| Error responses | ✅ Consistent | `{ ok: false, message, error: { code, details } }` |
| Backup export | ⚠️ Dangerous | Returns entire DB as single JSON blob |
| Rate limiting | ✅ Strong | Per-endpoint tiers with adaptive load adjustment |

---

### Database

#### Schema Quality — GOOD with notable gaps

**Tables:** 30+ PostgreSQL tables, 400+ columns, 100+ indexes

| Aspect | Status | Detail |
|--------|--------|--------|
| Table design | ✅ Good | Logical grouping, proper naming |
| Indexing | ✅ Strong | 100+ indexes, composite where needed, case-insensitive |
| Relations | ⚠️ Incomplete | 8+ missing FK constraints (data integrity risk) |
| Primary keys | 🔴 Missing | 3 rollup/queue tables lack PK |
| Soft deletes | ✅ Present | `isDeleted` flag on imports, receipts |
| Enum constraints | ⚠️ Missing | Status/role fields are TEXT without CHECK constraints |
| NOT NULL | ⚠️ Missing | Several critical fields (email, createdAt) are nullable |
| Normalization | ⚠️ Denormalized | userActivity stores redundant username/role |
| Audit trail | ✅ Present | auditLogs + settingVersions |
| Migrations | ✅ Good | 21 idempotent SQL migrations |

#### Critical Schema Issues

1. **No PK on rollup tables** — `collectionRecordDailyRollups`, `collectionRecordMonthlyRollups`, `collectionRecordDailyRollupRefreshQueue` have only composite unique indexes, no proper PK. Risk: ORM edge cases, replication issues, no guaranteed unique identifier.

2. **Missing FKs** — 8+ tables reference other tables by text column without foreign key constraints. Risk: orphaned data, no cascade behavior, integrity violations.

3. **No enum constraints** — `users.role` (user/admin/superuser), `users.status` (active/pending/banned), `backupJobs.status` (queued/running/done/failed) are unconstrained TEXT fields. Risk: invalid values can be inserted.

---

### Security

See dedicated Section F below.

---

### Error Handling

| Aspect | Status | Detail |
|--------|--------|--------|
| Global Express handler | ✅ Good | Catches HttpError, entity-too-large, unhandled |
| Async route wrapping | ✅ Good | All async handlers wrapped |
| Structured error codes | ✅ Good | 13 shared error codes |
| Swallowed catches | ⚠️ 6 cases | Receipt service returns null silently |
| Circuit breaker errors | ✅ Good | CircuitOpenError properly propagated |
| Validation errors | ✅ Good | Zod parse → badRequest with details |
| Client error display | ✅ Good | Error boundaries + toast notifications |

---

### Performance

| Area | Status | Risk Level |
|------|--------|------------|
| DB connection pool | ✅ Monitored | Low |
| Search caching | ✅ Present | Low |
| Virtual table rendering | ✅ Present | Low |
| Bundle splitting | ✅ Proper | Low |
| **Backup export memory** | 🔴 Unbounded | **Critical** |
| **N+1 calendar upsert** | 🔴 30 queries/call | **Critical** |
| **Backup restore Set** | ⚠️ Unbounded Set | **High** |
| **Full-table export scans** | ⚠️ No limits | **High** |
| WebSocket heartbeat scan | ⚠️ O(n) every 30s | Medium |

---

### Maintainability

| Aspect | Status | Detail |
|--------|--------|--------|
| TypeScript strict mode | ✅ Enabled | Full type safety |
| Shared schemas | ✅ Good | schema-postgres.ts + api-contracts.ts |
| CI pipeline | ✅ Comprehensive | typecheck → tests → build → smoke |
| Documentation | ✅ Extensive | 23 docs files, ARCHITECTURE.md |
| Test coverage | ⚠️ Moderate | 226 tests, 70% line target, UI coverage gap |
| Large files | ⚠️ Risk | 5+ files over 500 lines in both server and client |
| Dependency count | ⚠️ High | 141 dependencies |

---

## D. Module-by-Module Findings

### 1. Auth / Login

| Aspect | Finding |
|--------|---------|
| **Purpose** | User authentication with JWT, 2FA, device fingerprinting, account lifecycle |
| **Strengths** | Timing-safe bcrypt (cost 12), JWT secret rotation, login lockout, forced password change flow, dummy hash for non-existent users |
| **Weaknesses** | 2FA encryption falls back to SESSION_SECRET if key not configured |
| **Bug risks** | Low — well-tested with dedicated test files |
| **Security risks** | Medium — 2FA fallback key, but only when env var not set |
| **Performance risks** | Low — bcrypt cost 12 adds ~250ms per login (acceptable) |
| **UX risks** | Low — Login page is 513 lines but functional |
| **Verdict** | ✅ Keep as-is (enforce 2FA key in production config) |

### 2. User Management / Role Management

| Aspect | Finding |
|--------|---------|
| **Purpose** | CRUD for users, role assignment, account activation, password management |
| **Strengths** | Role-based guards on all admin endpoints, structured account lifecycle |
| **Weaknesses** | Roles are TEXT fields without DB constraints |
| **Bug risks** | Low — validation in service layer compensates |
| **Security risks** | Low — role escalation prevented by requireRole() middleware |
| **Performance risks** | Low |
| **UX risks** | Low |
| **Verdict** | ✅ Keep as-is |

### 3. Import / Upload

| Aspect | Finding |
|--------|---------|
| **Purpose** | CSV/Excel file import with preview, validation, bulk processing |
| **Strengths** | Streaming upload via busboy (not loaded in memory), file extension validation, configurable size limits, abort capability |
| **Weaknesses** | Temp file cleanup relies on try/finally — orphan risk on crash |
| **Bug risks** | Low |
| **Security risks** | Low — extension validation, size limits |
| **Performance risks** | Medium — XLSX parsing of large files blocks event loop |
| **UX risks** | Low — progress tracking, preview before import |
| **Verdict** | ✅ Keep as-is |

### 4. Saved Files / Data

| Aspect | Finding |
|--------|---------|
| **Purpose** | List and manage imported data records |
| **Strengths** | Bulk operations, search, server-side pagination |
| **Weaknesses** | Page is 560 lines — could benefit from extraction |
| **Bug risks** | Low |
| **Security risks** | Low |
| **Performance risks** | Low — paginated |
| **UX risks** | Low |
| **Verdict** | ✅ Keep with minor polish |

### 5. Viewer

| Aspect | Finding |
|--------|---------|
| **Purpose** | Data viewer with filters, search, export (CSV/PDF/Excel) |
| **Strengths** | Virtual scrolling (react-window), mobile card layout, debounced search, low-spec mode, abort controllers |
| **Weaknesses** | 919 lines — largest page, mixes table/filter/export logic |
| **Bug risks** | Low — but complexity increases maintenance risk |
| **Security risks** | Low |
| **Performance risks** | Low — well-optimized with virtual rendering |
| **UX risks** | Low — responsive mobile cards |
| **Verdict** | ✅ Keep as-is (refactor for maintainability later) |

### 6. General Search

| Aspect | Finding |
|--------|---------|
| **Purpose** | Global search with simple and advanced modes, filter operators |
| **Strengths** | LIKE pattern escaping, parameterized queries, column allowlist |
| **Weaknesses** | None significant |
| **Bug risks** | Low |
| **Security risks** | Low — SQL injection protected via escaping |
| **Performance risks** | Low — rate-limited (10 req/10s) |
| **UX risks** | Low — responsive filter panels |
| **Verdict** | ✅ Keep as-is |

### 7. Analysis / Reporting

| Aspect | Finding |
|--------|---------|
| **Purpose** | Analytics dashboard with charts (Recharts) |
| **Strengths** | Lazy-loaded charts, skeleton loading |
| **Weaknesses** | Charts may be small on mobile screens |
| **Bug risks** | Low |
| **Security risks** | Low |
| **Performance risks** | Medium — chart data aggregation could be slow for large datasets |
| **UX risks** | Low — desktop is clean, mobile may need polish |
| **Verdict** | ✅ Keep with minor polish |

### 8. Collection Report

| Aspect | Finding |
|--------|---------|
| **Purpose** | Collection reporting with daily/monthly summaries |
| **Strengths** | Server-side rollup aggregation, refresh queue pattern |
| **Weaknesses** | Rollup tables lack primary keys |
| **Bug risks** | Medium — missing PK could cause edge cases |
| **Security risks** | Low |
| **Performance risks** | Medium — N+1 calendar upsert |
| **UX risks** | Low |
| **Verdict** | ⚠️ Keep with fixes (add PKs, batch calendar upsert) |

### 9. Collection Summary

| Aspect | Finding |
|--------|---------|
| **Purpose** | Summary statistics for collection staff performance |
| **Strengths** | Monthly/daily aggregation, COLLECTION_DATA_CHANGED_EVENT refresh |
| **Weaknesses** | None significant |
| **Bug risks** | Low |
| **Security risks** | Low |
| **Performance risks** | Low |
| **UX risks** | Low |
| **Verdict** | ✅ Keep as-is |

### 10. Receipt Handling

| Aspect | Finding |
|--------|---------|
| **Purpose** | Upload, validate, store, preview collection receipts |
| **Strengths** | Magic byte validation, PDF JS blocking, EXIF stripping, dimension limits, file hash deduplication |
| **Weaknesses** | 6 swallowed error catches — silent failures mask issues |
| **Bug risks** | Medium — null returns from swallowed errors could cause confusing UI |
| **Security risks** | Low — excellent validation |
| **Performance risks** | Low |
| **UX risks** | Medium — silent failures provide no feedback |
| **Verdict** | ⚠️ Keep with fixes (add logging to catch blocks) |

### 11. Activity / Session Tracking

| Aspect | Finding |
|--------|---------|
| **Purpose** | Track user sessions, login/logout events, idle detection |
| **Strengths** | WebSocket heartbeat, auto-logout, device fingerprinting |
| **Weaknesses** | Idle session sweeper lacks transactions; denormalized activity data |
| **Bug risks** | Medium — race conditions in sweeper |
| **Security risks** | Low — properly tracks sessions |
| **Performance risks** | Medium — sweeper processes sessions sequentially |
| **UX risks** | Low |
| **Verdict** | ⚠️ Keep with fixes (add transaction to sweeper) |

### 12. AI SQR Assistant / Widget

| Aspect | Finding |
|--------|---------|
| **Purpose** | AI-powered search and chat using Ollama (llama3, nomic-embed-text) |
| **Strengths** | Concurrency gate with per-role limits, circuit breaker, search caching, rate limiting, inflight deduplication, streaming responses, low-spec mode adjustment |
| **Weaknesses** | 6s timeout may be too short for slow hardware |
| **Bug risks** | Low — well-protected with gates and breakers |
| **Security risks** | Low |
| **Performance risks** | Low — properly gated |
| **UX risks** | Low — excellent mobile experience (fullscreen, safe-area, keyboard-aware) |
| **Verdict** | ✅ Keep as-is |

### 13. Audit Logs

| Aspect | Finding |
|--------|---------|
| **Purpose** | Admin audit trail for all system changes |
| **Strengths** | Structured entries with actor, action, details |
| **Weaknesses** | No FK constraints on audit log table; mobile table height hardcoded |
| **Bug risks** | Low |
| **Security risks** | Low — audit integrity acceptable for current scale |
| **Performance risks** | Medium — large audit tables could slow backup export |
| **UX risks** | Low — table overflow handled |
| **Verdict** | ✅ Keep with minor polish |

### 14. Export Features

| Aspect | Finding |
|--------|---------|
| **Purpose** | Export data to CSV, PDF, Excel across viewer, search, collection |
| **Strengths** | Lazy-loaded jspdf/xlsx, abort controllers |
| **Weaknesses** | PDF/Excel generation happens client-side — heavy on mobile |
| **Bug risks** | Low |
| **Security risks** | Low |
| **Performance risks** | Medium — large exports on low-spec devices may be slow |
| **UX risks** | Low — proper feedback |
| **Verdict** | ✅ Keep as-is |

### 15. Backup / Restore

| Aspect | Finding |
|--------|---------|
| **Purpose** | Full database backup creation, export, restore |
| **Strengths** | Circuit breaker, integrity verification, async job queue |
| **Weaknesses** | Loads entire DB into memory, 3x memory footprint on export, unbounded Set on restore |
| **Bug risks** | High — OOM on large datasets |
| **Security risks** | Medium — backup data includes all user records |
| **Performance risks** | 🔴 Critical — no streaming, no pagination |
| **UX risks** | Low |
| **Verdict** | ⚠️ Needs improvement (streaming export/restore) |

### 16. Dashboard / Home

| Aspect | Finding |
|--------|---------|
| **Purpose** | Landing page after login with key metrics |
| **Strengths** | Clean layout, role-appropriate content |
| **Weaknesses** | None significant |
| **Bug risks** | Low |
| **Security risks** | Low |
| **Performance risks** | Low |
| **UX risks** | Low |
| **Verdict** | ✅ Keep as-is |

### 17. Settings / Config

| Aspect | Finding |
|--------|---------|
| **Purpose** | System settings with role-based visibility and editing |
| **Strengths** | Category-based organization, version tracking |
| **Weaknesses** | roleSettingPermissions uses text key instead of FK |
| **Bug risks** | Low — application layer validates |
| **Security risks** | Low |
| **Performance risks** | Low — cached |
| **UX risks** | Low |
| **Verdict** | ✅ Keep as-is |

---

## E. Mobile vs Desktop Review

### Desktop — GOOD

**What is good:**
- Clean card-based layouts with proper max-width constraints
- Virtual scrolling on large tables
- Keyboard shortcuts for power users
- Consistent navbar with grouped navigation
- Proper modal sizing and behavior
- Charts render well at desktop widths

**What is weak:**
- Viewer.tsx at 919 lines mixes concerns (maintainability, not visual)
- No issues visually on desktop

### Mobile — GOOD with 3 critical bugs

**What is good:**
- FloatingAI excellent: fullscreen mode, safe-area, keyboard-aware, avoid-overlap
- Navbar hamburger menu with Sheet drawer (92vw, max 22rem)
- Collection Save form: keyboard state detection, sticky-to-static toggle
- Dialogs use 100dvh correctly
- Touch targets properly sized (> 44px)
- Low-spec mode reduces animations on constrained devices

**What is weak:**
1. 🔴 **Page min-height uses 100vh** — clips content on mobile Safari (address bar)
2. 🔴 **CollectionRecordsTable min-w-1280px** — forces horizontal scroll on tablets
3. ⚠️ **ActivityLogsTable max-h-400px** — not responsive to viewport

**What should remain unchanged:**
- FloatingAI positioning and behavior
- Navbar mobile Sheet drawer
- Modal/Dialog responsive sizing
- Collection Save form keyboard handling
- Skeleton loading patterns
- Error boundary display

**What should be improved first:**
1. Replace 100vh with 100dvh in index.css page min-height
2. Make CollectionRecordsTable use responsive min-width
3. Make ActivityLogsTable height viewport-relative

---

## F. Priority Matrix

### Critical — Do First

| # | Issue | Area | Impact |
|---|-------|------|--------|
| 1 | Backup export loads entire DB into memory | Backend/Performance | OOM risk on large datasets |
| 2 | N+1 query: 30 sequential INSERTs for calendar days | Backend/Performance | Slow endpoint, DB load |
| 3 | Missing primary keys on 3 rollup/queue tables | Database | ORM issues, replication risk |
| 4 | 100vh used instead of 100dvh for page min-height | Frontend/Mobile | Content clipping on mobile Safari |

### High — Do Next

| # | Issue | Area | Impact |
|---|-------|------|--------|
| 5 | WebSocket connection leak: early-close paths skip map cleanup | Backend/Reliability | Memory accumulation at scale |
| 6 | 6 swallowed catch blocks in receipt service | Backend/Reliability | Silent failures, debugging difficulty |
| 7 | Backup restore: unbounded Set of record IDs | Backend/Performance | OOM on large restores |
| 8 | Idle session sweeper: no transaction wrapping | Backend/Reliability | Race conditions, partial updates |
| 9 | Missing FK constraints on 8+ table relationships | Database | Orphaned data risk |
| 10 | CollectionRecordsTable min-w-1280px | Frontend/Mobile | Forces scroll on tablets |
| 11 | 2FA encryption key fallback to SESSION_SECRET | Security | Weakens 2FA independence |
| 12 | Full-table export scans without limits | Backend/Performance | Memory pressure on concurrent exports |

### Medium — Later

| # | Issue | Area | Impact |
|---|-------|------|--------|
| 13 | Status/role fields lack CHECK constraints | Database | Invalid data insertion |
| 14 | Nullable createdAt on several tables | Database | Query filtering issues |
| 15 | ActivityLogsTable hardcoded max-h-400px | Frontend/Mobile | Non-responsive table height |
| 16 | Worker restart errors swallowed | Backend/Reliability | Unnoticed failed restarts |
| 17 | Large component files (Viewer 919 lines, etc.) | Frontend/Maintainability | Harder to maintain |
| 18 | userActivity stores redundant username/role | Database | Denormalization drift |

### Low — Optional Polish

| # | Issue | Area | Impact |
|---|-------|------|--------|
| 19 | Charts may be small on mobile | Frontend/UX | Minor UX polish |
| 20 | Empty states not fully mobile-optimized | Frontend/UX | Minor UX polish |
| 21 | Some backup/restore UI flows could be simpler | Frontend/UX | Minor UX polish |
| 22 | XLSX parsing blocks event loop | Backend/Performance | Low frequency, acceptable |
| 23 | 5+ files over 500 lines | Maintainability | Long-term code health |

---

## G. Recommended Improvement Roadmap

### Phase 1: Urgent Stability & Security Fixes

**Timeline: Immediate (before next deployment)**

1. **Fix 100vh → 100dvh** in index.css page min-height (with `@supports` fallback)
2. **Add logging to swallowed catch blocks** in receipt service (6 locations)
3. **Enforce 2FA encryption key** in production config (prevent SESSION_SECRET fallback)
4. **Add primary keys** to `collectionRecordDailyRollups`, `collectionRecordMonthlyRollups`, `collectionRecordDailyRollupRefreshQueue`
5. **Fix WebSocket cleanup** — add map cleanup to early-close paths in runtime-manager.ts

### Phase 2: Performance & Error Handling

**Timeline: Next sprint**

1. **Batch N+1 query** — convert 30 sequential INSERTs to single multi-row INSERT in collection-daily-repository-utils.ts
2. **Stream backup export** — replace full-table-scan-to-memory with chunked streaming
3. **Batch backup restore** — process record IDs in chunks instead of unbounded Set
4. **Wrap idle session sweeper in transaction** with batch processing
5. **Add FK constraints** to the 8+ tables missing them (with migration)
6. **Add CHECK constraints** for status/role enum fields

### Phase 3: UI/UX & Layout Improvements

**Timeline: Following sprint**

1. **Fix CollectionRecordsTable** — responsive min-width instead of hardcoded 1280px
2. **Fix ActivityLogsTable** — viewport-relative max-height instead of 400px
3. **Polish mobile empty states** across pages
4. **Review chart sizing** on mobile for Analysis page
5. **Simplify Backup/Restore flow** for mobile users

### Phase 4: Architecture & Maintainability

**Timeline: Future quarter**

1. **Extract Viewer.tsx sub-components** — split 919-line file into filter, table, export modules
2. **Extract Login.tsx flows** — separate auth, 2FA, fingerprint logic
3. **Complete PostgresStorage → direct repository migration** — remove legacy facade
4. **Add NOT NULL constraints** to currently nullable critical fields
5. **Increase test coverage** — add UI component tests, expand integration coverage
6. **Normalize userActivity table** — remove redundant username/role columns

---

## H. Final Verdict

### What is Already Good Enough — DO NOT change unnecessarily

- ✅ Overall layered architecture (routes → controllers → services → repositories)
- ✅ CSRF protection (multi-layer defense-in-depth)
- ✅ JWT implementation (HS256, rotation, proper expiry)
- ✅ Bcrypt password hashing (cost 12, timing-safe)
- ✅ File upload security (magic bytes, PDF blocking, EXIF stripping)
- ✅ Rate limiting (multi-tier, adaptive, load-aware)
- ✅ Circuit breaker pattern
- ✅ AI concurrency gate design
- ✅ FloatingAI mobile experience
- ✅ Collection Save form mobile keyboard handling
- ✅ Modal/Dialog responsive sizing (100dvh)
- ✅ Navbar mobile Sheet drawer
- ✅ Structured logging (pino, zero console.log)
- ✅ CI/CD pipeline (typecheck → test → build → smoke)
- ✅ Code splitting and bundle optimization
- ✅ Virtual scrolling on large tables
- ✅ Error boundary with recovery options

### What is Risky to Leave As-Is

- 🔴 Backup export/restore memory handling — will OOM on growing datasets
- 🔴 N+1 calendar upsert — 30x slower than necessary
- 🔴 Missing rollup table PKs — can cause edge cases
- 🔴 100vh on mobile — actively clips content on Safari now
- ⚠️ WebSocket connection map leak paths — will accumulate at scale
- ⚠️ Swallowed errors in receipt handling — masks real issues
- ⚠️ Missing FK constraints — orphaned data risk grows over time

### What Should Be Fixed Before Further Feature Expansion

1. **Backup streaming** — current implementation cannot scale with data growth
2. **N+1 query batching** — simple fix with high impact
3. **100vh → 100dvh** — one-line CSS fix for mobile Safari
4. **Rollup table PKs** — migration required before adding features to these tables
5. **WebSocket cleanup** — critical for multi-user production environments
6. **Receipt error logging** — must be able to diagnose production issues

---

## Appendix: Metrics Summary

| Metric | Value |
|--------|-------|
| Total TypeScript files | 420+ |
| Server files | 294 |
| Client files | 123 |
| Shared files | 3 |
| PostgreSQL tables | 30+ |
| Database columns | 400+ |
| Database indexes | 100+ |
| API endpoints | ~100 |
| React pages | 22 main + 248 sub-components |
| Custom hooks | 12 + 9 app shell |
| UI components | 40+ (Radix/shadcn) |
| NPM dependencies | 141 |
| Test files | 84 (226 tests) |
| Documentation files | 23 |
| Largest server file | collection-record-repository-utils.ts (1235 lines) |
| Largest client file | Viewer.tsx (919 lines) |
| Node version | ≥24 |
| Build tool | Vite + esbuild |
| Database | PostgreSQL 16 |
| ORM | Drizzle 0.39 |
