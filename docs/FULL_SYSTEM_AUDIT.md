# FULL SYSTEM AUDIT - SQR

**Audit date:** 2026-04-01  
**Method:** static code inspection only  
**Scope:** backend, frontend, UI/UX, responsive behavior, API design, database behavior, security, performance, observability, architecture, maintainability  
**Audit mode:** documentation-only, no implementation changes performed as part of this audit

## A. Executive Summary

### System Health Score

**8.2 / 10**

This score is supportable for the current codebase. The system is materially healthier than the previous 7.5/10 state because the earlier high-value issues around rollup keys, batched daily inserts, mobile viewport sizing, SQL LIKE escaping, CSRF fallback behavior, receipt observability, and admin moderation rate limiting have been addressed in code.

### Overall Stability

SQR is stable enough for **controlled production deployment**. The architecture is coherent, security controls are layered, and the codebase is improving in maintainability even though some heavy orchestration files still remain.

### Biggest Strengths

- Clear backend composition through [server/internal/local-server-composition.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/internal/local-server-composition.ts).
- Strong session, role, and CSRF protections via [server/auth/guards.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/auth/guards.ts) and [server/http/csrf.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/http/csrf.ts).
- Centralized structured logging and error handling via [server/lib/logger.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/lib/logger.ts) and [server/middleware/error-handler.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/middleware/error-handler.ts).
- Backup export/create path is much safer because [server/repositories/backups-payload-utils.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/repositories/backups-payload-utils.ts) now streams paged JSON arrays instead of materializing a single giant payload.
- Frontend shell viewport handling is materially better through `100dvh` fallbacks in [client/src/index.css](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/index.css) and shell usage in [client/src/App.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/App.tsx).
- Viewer, monitor, receipt, backup, and collection modules show real decomposition progress.

### Biggest Risks

- Restore still has scale-sensitive memory behavior in [server/repositories/backups-restore-utils.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/repositories/backups-restore-utils.ts) and [server/repositories/backups-restore-dataset-utils.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/repositories/backups-restore-dataset-utils.ts), especially the unbounded `Set<string>` of restored record IDs.
- Pagination contracts remain mixed across imports, search, audit, auth-admin, and collection flows.
- Two non-test source files still exceed 700 lines.
- Dense mobile/admin surfaces still require runtime verification; static inspection alone cannot prove final usability.

### Comparison to Previous Audit

- Previous critical structural issues are no longer present in the same form.
- No issue verified in this audit currently rises to Critical.
- The codebase is healthier, but still carries medium-priority scale and consistency debt.

### Critical Path

1. Reduce restore-path memory pressure in backup recovery.
2. Standardize pagination contracts by endpoint family.
3. Continue decomposing the remaining oversized orchestration files.
4. Keep runtime QA active on dense mobile surfaces.

## B. Architecture Overview

### Backend Architecture

The backend is broadly aligned with the intended layering:

- routes define endpoints and protection
- controllers handle HTTP parsing and response shaping
- services coordinate domain logic
- repositories isolate PostgreSQL access
- internal modules handle startup, runtime monitoring, and composition

Evidence:

- [server/internal/local-server-composition.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/internal/local-server-composition.ts) acts as the composition root.
- Import flow uses [server/controllers/imports.controller.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/controllers/imports.controller.ts), services, and repositories in the expected order.
- Backup, activity, auth, and collection domains follow the same broad pattern.

Weaknesses:

- Some large orchestration services remain, especially [server/services/collection/collection-record-mutation-operations.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/services/collection/collection-record-mutation-operations.ts).
- Route naming and response envelopes are not yet fully standardized.

### Frontend Architecture

The frontend is a React + TypeScript application centered on [client/src/App.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/App.tsx), app-shell state, and modular page domains.

Strengths:

- Shell concerns, providers, route rendering, and error boundaries are separated cleanly.
- Floating AI now has dedicated layout, visibility, and scroll-lock helpers rather than ad hoc page logic.
- Viewer and monitor are significantly more modular than before.

Weaknesses:

- [client/src/pages/Viewer.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/pages/Viewer.tsx) remains a large orchestration page at 764 lines.
- Some data-heavy mobile pages still need runtime QA to validate touch ergonomics and scroll behavior.

### Data Flow

- Cookie/JWT-authenticated browser requests hit Express APIs.
- Input normalization uses helpers in [server/http/validation.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/http/validation.ts).
- Repositories use Drizzle and SQL against [shared/schema-postgres.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/shared/schema-postgres.ts).
- Real-time monitor and activity updates use WebSockets via [server/ws/runtime-manager.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/ws/runtime-manager.ts).

### Architectural Judgment

The system is no longer suffering from missing structure. Current risks are about scale edges, contract consistency, and maintainability, not architectural absence.

## C. Verified Previous Findings

### 1. Rollup table composite PKs

- **Status:** FIXED
- **Exact location:** [shared/schema-postgres.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/shared/schema-postgres.ts)
- **What was found:** `primaryKey()` exists on all three previously flagged rollup and queue tables at the `slicePrimaryKey` declarations around lines 425, 450, and 479.
- **Why it matters:** This resolves the earlier identity/schema concern.
- **Recommendation direction:** Keep as-is.
- **Priority:** Monitor

### 2. N+1 day-insert batch

- **Status:** FIXED
- **Exact location:** [server/repositories/collection-daily-repository-utils.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/repositories/collection-daily-repository-utils.ts), `upsertCollectionDailyCalendarDays`
- **What was found:** The implementation now uses one batched `VALUES` block via `sql.join(...)`.
- **Why it matters:** This removes the earlier serial insert inefficiency.
- **Recommendation direction:** Keep as-is.
- **Priority:** Monitor

### 3. 100dvh viewport fallback

- **Status:** FIXED
- **Exact location:** [client/src/index.css](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/index.css), [client/src/App.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/App.tsx)
- **What was found:** `.viewport-min-height` and `.app-shell-min-height` now use `@supports (height: 100dvh)`.
- **Why it matters:** This resolves the earlier shell-level mobile clipping issue.
- **Recommendation direction:** Keep applying the same shell pattern.
- **Priority:** Monitor

### 4. SQL LIKE wildcard escaping

- **Status:** FIXED
- **Exact location:** [server/repositories/sql-like-utils.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/repositories/sql-like-utils.ts)
- **What was found:** `escapeLikePattern` and `buildLikePattern` are reused across search, imports, audit, backups, auth-admin, collection, and AI search repositories.
- **Why it matters:** This closes the previous wildcard correctness issue.
- **Recommendation direction:** Keep as-is.
- **Priority:** Monitor

### 5. Backup export OOM via all-table in-memory loading

- **Status:** FIXED
- **Exact location:** [server/repositories/backups-payload-utils.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/repositories/backups-payload-utils.ts)
- **What was found:** Backup payload creation now uses `appendPagedJsonArray(...)` with paged fetches rather than the earlier all-in-memory pattern.
- **Why it matters:** This materially reduces the previous export/create backup OOM risk.
- **Recommendation direction:** Keep export/create architecture; focus next on restore-path scale behavior.
- **Priority:** Monitor

### 6. WebSocket early-close cleanup

- **Status:** LOW-RISK WATCH AREA
- **Exact location:** [server/ws/runtime-manager.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/ws/runtime-manager.ts)
- **What was found:** Early `ws.close()` branches still exist, but they run before `connectedClients.set(activityId, ws)`.
- **Why it matters:** Earlier audit language overstated this as a connection-map leak. In current code, rejected sockets are closed before they are stored.
- **Recommendation direction:** Do not prioritize unless runtime evidence shows a different socket lifecycle problem.
- **Priority:** Monitor

### 7. Silent receipt catch blocks

- **Status:** FIXED
- **Exact location:** [server/routes/collection-receipt.service.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/routes/collection-receipt.service.ts), [server/routes/collection-receipt-file-utils.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/routes/collection-receipt-file-utils.ts)
- **What was found:** Best-effort failures are now routed through `logCollectionReceiptBestEffortFailure(...)` and logged.
- **Why it matters:** This closes the previous observability blind spot.
- **Recommendation direction:** Keep as-is.
- **Priority:** Monitor

### 8. CSRF fallback bypass

- **Status:** FIXED
- **Exact location:** [server/http/csrf.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/http/csrf.ts)
- **What was found:** Cookie-authenticated unsafe API requests now fail closed with `CSRF_SIGNAL_MISSING` when required same-origin signals are absent.
- **Why it matters:** This closes the earlier fallback bypass concern.
- **Recommendation direction:** Keep as-is.
- **Priority:** Monitor

### 9. Bulk admin rate limiting

- **Status:** FIXED
- **Exact location:** [server/routes/activity.routes.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/routes/activity.routes.ts), [server/middleware/rate-limit.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/middleware/rate-limit.ts)
- **What was found:** Sensitive moderation routes now use `adminAction` limiting at 30 requests per 10 minutes.
- **Why it matters:** This closes the previous abuse-hardening gap.
- **Recommendation direction:** Keep as-is.
- **Priority:** Monitor

## D. New Findings

### 1. Mixed pagination contracts across APIs

- **Severity:** Medium
- **Category:** API
- **Exact location:** [server/controllers/imports.controller.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/controllers/imports.controller.ts), [shared/api-contracts.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/shared/api-contracts.ts), [client/src/lib/api/imports.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/lib/api/imports.ts), [server/services/search.service.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/services/search.service.ts)
- **What was found:** The system currently mixes `cursor + limit`, `page + pageSize`, `page + limit`, and `offset + limit`. Imports alone expose multiple patterns.
- **Why it matters:** This increases frontend branching, test surface, and contract drift risk.
- **Current status:** New
- **Recommendation direction:** converge by endpoint family, not by sweeping refactor.
- **Priority:** Fix Next

### 2. Restore path retains unbounded `Set<string>` for restored record IDs

- **Severity:** Medium
- **Category:** Database / Performance
- **Exact location:** [server/repositories/backups-restore-utils.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/repositories/backups-restore-utils.ts), [server/repositories/backups-restore-dataset-utils.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/repositories/backups-restore-dataset-utils.ts)
- **What was found:** Restore still tracks restored collection record IDs in `new Set<string>()`, then materializes them for receipt-cache sync.
- **Why it matters:** Export/create backup improved, but restore still has scale-sensitive in-memory accumulation.
- **Current status:** New
- **Recommendation direction:** reduce retained restore working sets and avoid holding every restored record ID if not strictly necessary.
- **Priority:** Fix Next

### 3. Two non-test source files still exceed 700 lines

- **Severity:** Medium
- **Category:** Maintainability
- **Exact location:** [shared/schema-postgres.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/shared/schema-postgres.ts), [client/src/pages/Viewer.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/pages/Viewer.tsx)
- **What was found:** Current source line counts are 839 and 764 respectively.
- **Why it matters:** These files are still large coordination surfaces that increase regression and onboarding cost.
- **Current status:** Still Present
- **Recommendation direction:** continue domain-aware decomposition, not cosmetic splitting.
- **Priority:** Fix Later

### 4. Multiple source files remain near the 700-line threshold

- **Severity:** Low
- **Category:** Maintainability
- **Exact location:** [server/services/collection/collection-record-mutation-operations.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/services/collection/collection-record-mutation-operations.ts), [client/src/components/ui/sidebar.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/components/ui/sidebar.tsx), [server/routes/tests/operations.routes.integration.test.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/routes/tests/operations.routes.integration.test.ts), [client/src/pages/BackupRestore.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/pages/BackupRestore.tsx), [server/http/tests/bootstrap-migration.integration.test.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/http/tests/bootstrap-migration.integration.test.ts), [server/services/auth-account-managed-operations.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/services/auth-account-managed-operations.ts)
- **What was found:** Several files now sit in the 624-685 line range, close enough to become the next oversized hotspots.
- **Why it matters:** This shows where maintainability pressure will reappear first.
- **Current status:** Watch Area
- **Recommendation direction:** use these files as the next decomposition queue when touching their domains again.
- **Priority:** Monitor

### 5. Oversized file decomposition progress is real, but not finished

- **Severity:** Low
- **Category:** Maintainability
- **Exact location:** collection record, receipt, backup, viewer, and monitor modules
- **What was found:** The decomposition claim is supported, and progress is better than the minimum claim. Formerly oversized operational files such as [server/repositories/collection-record-repository-utils.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/repositories/collection-record-repository-utils.ts), [server/routes/collection-receipt.service.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/routes/collection-receipt.service.ts), [server/services/backup-operations.service.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/services/backup-operations.service.ts), [server/repositories/backups-restore-utils.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/repositories/backups-restore-utils.ts), and [server/services/auth-account-authentication-operations.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/services/auth-account-authentication-operations.ts) are now materially smaller at 401, 301, 340, 49, and 488 lines respectively.
- **Why it matters:** The maintainability trend is clearly positive, but the work is not complete while Viewer and schema remain oversized.
- **Current status:** Partially Fixed
- **Recommendation direction:** continue opportunistic decomposition during domain work.
- **Priority:** Monitor

## E. Findings by Category

### Backend

#### Layered backend composition is solid

- **Severity:** Low
- **Category:** Backend
- **Exact location:** [server/internal/local-server-composition.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/internal/local-server-composition.ts)
- **What was found:** Composition root cleanly wires repositories, services, guards, controllers, WebSocket manager, and route registration.
- **Why it matters:** This keeps application assembly centralized and reduces hidden coupling.
- **Current status:** Fixed
- **Recommendation direction:** preserve this composition-first pattern.
- **Priority:** Monitor

#### Global error handling is consistent for core API failures

- **Severity:** Low
- **Category:** Backend
- **Exact location:** [server/middleware/error-handler.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/middleware/error-handler.ts)
- **What was found:** The app uses a centralized JSON error handler with explicit 413 behavior, `HttpError` handling, and structured logging for unexpected failures.
- **Why it matters:** This is a strong production baseline.
- **Current status:** Fixed
- **Recommendation direction:** keep route handlers throwing structured errors instead of handcrafting local error shapes.
- **Priority:** Monitor

#### Route aliasing and naming drift remain

- **Severity:** Low
- **Category:** Backend
- **Exact location:** [server/routes/activity.routes.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/routes/activity.routes.ts)
- **What was found:** The activity surface exposes both `/api/activity/...` and `/api/activities...` patterns.
- **Why it matters:** This is not a correctness defect, but it increases mental overhead and API ambiguity.
- **Current status:** Still Present
- **Recommendation direction:** standardize naming gradually when deprecating aliases.
- **Priority:** Fix Later

### Frontend

#### App shell and route boundaries are healthier than before

- **Severity:** Low
- **Category:** Frontend
- **Exact location:** [client/src/App.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/App.tsx)
- **What was found:** Providers, route boundaries, shell layout, auto logout, and Floating AI are separated cleanly.
- **Why it matters:** This keeps global concerns centralized and easier to reason about.
- **Current status:** Fixed
- **Recommendation direction:** preserve the same shell/page separation.
- **Priority:** Monitor

#### Viewer remains a major orchestration hotspot

- **Severity:** Medium
- **Category:** Frontend
- **Exact location:** [client/src/pages/Viewer.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/pages/Viewer.tsx)
- **What was found:** Viewer improved through many extracted subcomponents and utilities, but the page still coordinates fetch, pagination, selection, export, and responsive rendering in one large orchestrator.
- **Why it matters:** Viewer remains a likely future regression hotspot.
- **Current status:** Still Present
- **Recommendation direction:** continue extracting orchestration slices only when doing domain work.
- **Priority:** Fix Later

#### Activity page handles polling and cleanup responsibly

- **Severity:** Low
- **Category:** Frontend
- **Exact location:** [client/src/pages/Activity.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/pages/Activity.tsx)
- **What was found:** The page uses abort controllers, request IDs, visibility refresh, interval cleanup, and mounted guards with proper teardown.
- **Why it matters:** This reduces stale-state and leak risk on a live operational page.
- **Current status:** Fixed
- **Recommendation direction:** keep this pattern for other long-lived data pages.
- **Priority:** Monitor

### UI/UX

#### Audit and activity pages are operationally dense but improved

- **Severity:** Medium
- **Category:** UI/UX
- **Exact location:** [client/src/pages/AuditLogs.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/pages/AuditLogs.tsx), [client/src/pages/Activity.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/pages/Activity.tsx)
- **What was found:** Both pages now contain more mobile-aware toggles and smaller sections, but they remain dense admin surfaces.
- **Why it matters:** Static inspection cannot fully prove mobile usability or touch ergonomics here.
- **Current status:** Runtime Verification Needed
- **Recommendation direction:** keep validating real mobile behavior after future changes.
- **Priority:** Monitor

#### Floating AI is architecturally stable

- **Severity:** Low
- **Category:** UI/UX
- **Exact location:** [client/src/components/FloatingAI.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/components/FloatingAI.tsx)
- **What was found:** Floating AI now uses dedicated layout resolution, scroll lock, visibility policies, and mobile viewport awareness.
- **Why it matters:** This is no longer a generic audit weakness. It is a sensitive but stabilized surface.
- **Current status:** LOW-RISK WATCH AREA
- **Recommendation direction:** avoid unnecessary redesign and keep runtime QA after shell changes.
- **Priority:** Monitor

### API

#### Error envelopes are improving but not fully uniform

- **Severity:** Medium
- **Category:** API
- **Exact location:** [server/middleware/error-handler.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/middleware/error-handler.ts), [server/routes/activity.routes.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/routes/activity.routes.ts), [server/controllers/imports.controller.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/controllers/imports.controller.ts)
- **What was found:** There is progress toward `ok: true/false`, but some endpoints still return domain-shaped payloads without one consistent envelope across modules.
- **Why it matters:** This increases client normalization work and schema drift risk.
- **Current status:** Partially Fixed
- **Recommendation direction:** continue convergence by endpoint family.
- **Priority:** Fix Later

#### Validation approach is strong and reusable

- **Severity:** Low
- **Category:** API
- **Exact location:** [server/http/validation.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/http/validation.ts), [shared/api-contracts.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/shared/api-contracts.ts)
- **What was found:** The codebase uses reusable readers and Zod contracts rather than ad hoc parsing everywhere.
- **Why it matters:** This improves consistency and reduces sloppy input handling.
- **Current status:** Fixed
- **Recommendation direction:** keep extending existing validation primitives.
- **Priority:** Monitor

### Database

#### Rollup schema correctness is materially improved

- **Severity:** Low
- **Category:** Database
- **Exact location:** [shared/schema-postgres.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/shared/schema-postgres.ts)
- **What was found:** Composite primary keys now exist on the rollup and rollup-refresh tables that previously lacked them.
- **Why it matters:** This removes a meaningful schema hygiene concern from the earlier audit.
- **Current status:** Fixed
- **Recommendation direction:** keep reviewing schema evolution with the same discipline.
- **Priority:** Monitor

#### Restore path remains the main database-scale watch area

- **Severity:** Medium
- **Category:** Database
- **Exact location:** [server/repositories/backups-restore-utils.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/repositories/backups-restore-utils.ts), [server/repositories/backups-restore-dataset-utils.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/repositories/backups-restore-dataset-utils.ts)
- **What was found:** Restore is better than before, but still accumulates state in memory and performs large payload handling during recovery.
- **Why it matters:** Disaster-recovery code does not need to be optimized first in a product, but it must remain trustworthy under realistic large datasets.
- **Current status:** Still Present
- **Recommendation direction:** treat restore-path scale work as reliability hardening, not optional polish.
- **Priority:** Fix Next

### Security

#### Session, role, and CSRF protections are strong

- **Severity:** Low
- **Category:** Security
- **Exact location:** [server/auth/guards.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/auth/guards.ts), [server/http/csrf.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/http/csrf.ts)
- **What was found:** Authentication checks session validity against activity state, account bans and locks, forced password change rules, role access, and tab visibility. CSRF middleware now fails closed for cookie-authenticated unsafe API requests.
- **Why it matters:** This is a real strength and materially supports controlled production use.
- **Current status:** Fixed
- **Recommendation direction:** preserve the existing security stack and avoid unnecessary churn here.
- **Priority:** Monitor

#### Admin action hardening is now acceptable

- **Severity:** Low
- **Category:** Security
- **Exact location:** [server/routes/activity.routes.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/routes/activity.routes.ts), [server/middleware/rate-limit.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/middleware/rate-limit.ts)
- **What was found:** Bulk delete, kick, ban, and unban admin flows now run behind a dedicated limiter keyed by IP, path, and acting username.
- **Why it matters:** This meaningfully reduces abuse surface on sensitive moderation routes.
- **Current status:** Fixed
- **Recommendation direction:** keep aligned with other privileged mutation routes.
- **Priority:** Monitor

### Performance

#### Backup export/create is much healthier than before

- **Severity:** Low
- **Category:** Performance
- **Exact location:** [server/repositories/backups-payload-utils.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/repositories/backups-payload-utils.ts), [server/services/backup-operations.service.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/services/backup-operations.service.ts)
- **What was found:** Export/create now pages through datasets and avoids the earlier all-tables-in-memory pattern.
- **Why it matters:** This removed the largest previously verified memory-stability issue on the backup side.
- **Current status:** Fixed
- **Recommendation direction:** preserve paged JSON writing and avoid regressing to eager full-table aggregation.
- **Priority:** Monitor

#### Some heavy UI domains still deserve live profiling

- **Severity:** Medium
- **Category:** Performance
- **Exact location:** [client/src/pages/Viewer.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/pages/Viewer.tsx), [client/src/pages/Monitor.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/pages/Monitor.tsx), [client/src/pages/BackupRestore.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/pages/BackupRestore.tsx)
- **What was found:** These pages orchestrate large datasets, charts, export flows, or restore controls and remain among the heaviest frontend surfaces.
- **Why it matters:** Static inspection alone cannot guarantee low-spec device behavior, even though the code now uses virtualization, lazy loading, and decomposition in the right places.
- **Current status:** Runtime Verification Needed
- **Recommendation direction:** keep profiling and smoke-testing these pages on realistic devices and data volumes.
- **Priority:** Monitor

### Maintainability

#### Maintainability trend is positive

- **Severity:** Low
- **Category:** Maintainability
- **Exact location:** viewer, monitor, backup, receipt, collection record, auth service domains
- **What was found:** Several formerly oversized domains have been split into focused helper modules and smaller components.
- **Why it matters:** This has already reduced regression risk and improved auditability.
- **Current status:** Partially Fixed
- **Recommendation direction:** continue the same style of targeted decomposition.
- **Priority:** Monitor

#### Schema file remains intentionally large

- **Severity:** Low
- **Category:** Maintainability
- **Exact location:** [shared/schema-postgres.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/shared/schema-postgres.ts)
- **What was found:** At 839 lines, the schema file is large, but this is partly a consequence of acting as the central database schema definition.
- **Why it matters:** This is less concerning than an oversized mixed-responsibility service, but still worth watching.
- **Current status:** Watch Area
- **Recommendation direction:** only split if it improves real domain clarity.
- **Priority:** Monitor

## F. Module-by-Module Review

### Auth / Account / Session

Strong overall. [server/auth/guards.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/auth/guards.ts), cookie/session helpers, 2FA modules, and rate limiters form a credible production auth stack. Managed-user operations remain somewhat large, but the risk is maintainability, not correctness.

### Collection Flows

Collection remains one of the largest domains, but structure has improved. Mutation and rollup helpers are now better separated than before. The main remaining hotspot is [server/services/collection/collection-record-mutation-operations.ts](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/services/collection/collection-record-mutation-operations.ts), which still coordinates many steps.

### Collection Daily

Healthier than before. Batched day upsert removed a previous inefficiency, and rollup keying is now sound. This area is no longer a headline risk.

### Collection Summary / Nickname Summary

These flows appear structurally sound and supported by clearer repository and service separation. No new high-severity concerns surfaced statically.

### Receipt Handling

Receipt handling is one of the better-defended backend domains. Security validation is strong, file handling is more modular, and silent best-effort failures are now logged. Large-file size risk has improved, although the receipt security module remains sizable.

### General Search

General search appears stable architecturally. The main risks are contract consistency and ensuring pagination conventions do not diverge further from other modules.

### Viewer

Viewer has seen substantial decomposition and is markedly healthier than before, but [client/src/pages/Viewer.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/pages/Viewer.tsx) is still a high-complexity orchestration surface. This is now a maintainability issue, not a broken-architecture issue.

### Activity / Audit

Backend hardening is improved through rate limiting and stronger route patterns. Frontend pages are operationally dense but use sensible abort and polling cleanup. These are acceptable admin surfaces, with runtime mobile QA still valuable.

### Dashboard / Analysis / Monitor

Monitor is now better componentized and backed by a dedicated `useSystemMetrics` hook. It remains a heavy runtime surface, but structurally it is improving.

### Backup / Export / Restore

This module improved the most. Export/create backup is materially safer than before. The remaining concern has shifted from "critical export OOM pattern" to "restore-path working-set scale risk," which is a better place to be, but still worth addressing.

### Settings / Admin / Security

Settings and admin surfaces appear structurally sound. The strongest engineering work here is in consistent guards, structured logging, rate limiting, and session security.

## G. Mobile vs Desktop / Responsive Review

### Mobile

- Main shell viewport handling is in much better shape because `100dvh` fallbacks now exist.
- Floating AI architecture is now purpose-built for mobile instead of relying on naive fixed positioning alone.
- Dense pages such as activity, audit, monitor, viewer, and backup/restore still need runtime verification because static inspection cannot prove touch ergonomics, scroll locking, or low-spec rendering quality.

### Desktop

- Desktop strengths remain the richer information density, wider data surfaces, and lower viewport-risk sensitivity.
- No new desktop-specific structural problems surfaced in static inspection.

### Responsive Consistency

- The core responsive direction is good.
- The remaining risk is not that responsiveness is absent, but that some data-heavy pages remain too dense to declare "fully polished" without live testing.

### Floating AI Impact

- No current static evidence suggests Floating AI is a systemic blocker.
- It should now be treated as a runtime-sensitive watch area, not a standing audit defect.

## H. Priority Matrix

### Critical

- None verified in current static inspection.

### High

- None verified in current static inspection.

### Medium

- Mixed pagination contracts across APIs
- Backup restore retained in-memory record ID set and large restore working set
- Viewer still oversized as a page orchestrator
- Dense runtime-heavy surfaces still need browser and device verification

### Low

- WebSocket early-close concern downgraded to low-risk watch area
- Route naming aliases remain inconsistent in places
- Several source files are near the oversized threshold
- Schema file remains large but intentionally centralized

## I. Improvement Roadmap

### Immediate

- Harden restore-path memory behavior in the backup and recovery domain.
- Decide and document target pagination conventions by endpoint family.

### Short-term

- Continue decomposing [client/src/pages/Viewer.tsx](c:/Users/Administrator/Desktop/sumbanganqueryrahmah/client/src/pages/Viewer.tsx) and any next-nearest orchestration hotspots when touched.
- Run focused runtime QA on viewer, audit, activity, monitor, and backup/restore mobile and low-spec paths.

### Medium-term

- Converge route naming and response-envelope consistency across admin and data APIs.
- Keep trimming near-threshold large source files through domain-aware helper extraction.

### Long-term

- Preserve decomposition discipline so future growth does not recreate the previous oversized-file pattern.
- Continue validating heavy operational flows with production-like smoke testing rather than relying only on static correctness.

## J. Final Verdict

### Are no critical issues remaining?

**Yes, based on this static audit, no currently verified issue remains Critical.**

### Are previous critical issues resolved?

**Yes, the previously important critical path items are resolved in their original form.**  
The biggest former issues around rollup PKs, day-insert batching, viewport handling, SQL LIKE escaping, backup export OOM pattern, CSRF fallback behavior, silent receipt failures, and bulk admin rate limiting are no longer present as previously reported.

### Is controlled production deployment justified?

**Yes.** The current system is stable enough for controlled production deployment.

### What still blocks higher confidence?

- Restore-path scale behavior during very large recovery operations
- API pagination inconsistency across domains
- Remaining oversized orchestration files
- Need for runtime validation on the heaviest mobile and data-dense surfaces

### What is technical debt but not a blocker?

- Route alias drift
- Partial response-envelope inconsistency
- Near-threshold file sizes
- Large but intentionally centralized schema definition

### Blunt Closing Assessment

SQR is no longer held back by the serious structural issues identified in the earlier audit. The system now looks like a production-capable operational application with credible security, reasonable architectural discipline, and improving maintainability. The remaining work is important, but it is mostly about scale guardrails, consistency, and keeping complexity from growing back in the heaviest domains.
