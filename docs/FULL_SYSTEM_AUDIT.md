# FULL SYSTEM AUDIT - SQR

Date: 2026-03-31
Scope: Full-system technical audit covering backend, frontend, UI/UX, layout and responsiveness, API design, database and query behavior, security, performance, error handling, observability, module architecture, and maintainability.
Method: Static code inspection of the current repository state. No code, schema, configuration, or UI changes were made as part of this audit.

## A. Executive Summary

### System Health Score

Current system health score: **8.2 / 10**

This is an improvement over the previous audit baseline of 7.5/10. Several previously significant issues have been addressed in the current codebase, especially around schema integrity, search safety, mobile viewport handling, session consistency, and collection daily batching. The system is now stronger technically than the previous audit document suggested, but a few scale and hardening risks remain.

### Overall Stability Impression

SQR is a real production-style operational application with a stronger-than-average architecture for its stage:

- 723 TypeScript files across `client/src`, `server`, and `shared`
- 123 test files
- 37 PostgreSQL tables defined in `shared/schema-postgres.ts`
- strong CI with build, contract tests, route tests, service tests, client tests, coverage gate, DB integration, and Playwright smoke

The codebase shows deliberate engineering investment in:

- layered backend composition
- session and auth hardening
- file validation and safe receipt handling
- runtime protection and adaptive throttling
- mobile-aware UI for the most operationally sensitive surfaces

The main risks are no longer basic correctness issues. They are mostly:

- scale-risk memory behavior in backup export and restore paths
- selective admin-action hardening gaps
- observability gaps in some best-effort receipt code paths
- API contract inconsistency and route alias drift
- maintainability strain from a handful of oversized multi-responsibility files

### Biggest Strengths

- Strong auth/session security stack: `server/http/csrf.ts`, `server/auth/guards.ts`, `server/auth/session-jwt.ts`, `server/auth/passwords.ts`
- Good runtime protection primitives: `server/internal/apiProtection.ts`, `server/internal/aiConcurrencyGate.ts`, `server/internal/runtime-monitor-manager.ts`
- Mature file validation pipeline for receipts: `server/lib/collection-receipt-security.ts`, `server/routes/collection-receipt.service.ts`
- Improved mobile UI infrastructure: `client/src/components/FloatingAI.tsx`, `client/src/hooks/use-mobile-viewport-state.ts`, `client/src/pages/collection-records/ReceiptPreviewDialog.tsx`, `client/src/pages/collection-records/ViewAllRecordsDialog.tsx`
- Strong CI: `.github/workflows/ci.yml`

### Biggest Risks

- Backup export and restore still materialize large JSON payloads in memory even after recent improvements
- Admin moderation routes in `server/routes/activity.routes.ts` do not use dedicated admin-action rate limiting
- Receipt service still contains several silent or near-silent catch paths that reduce operational visibility during file edge cases
- API response envelopes and route aliases have drifted, increasing client contract complexity
- The collection data layer remains concentrated in very large files, especially `server/repositories/collection-record-repository-utils.ts`

### Comparison to the Previous Audit

The previous audit is now partially stale. The following prior findings have been genuinely addressed in the current code:

- rollup table composite primary keys
- daily calendar N+1 upsert behavior
- mobile `100vh` fallback with `100dvh`
- SQL `LIKE` wildcard escaping
- idle session sweeper transaction consistency
- 2FA key separation

Other previous findings were overstated or are now only partially true.

### Verified Previous Findings

| Prior finding | Current classification | Evidence | Notes |
| --- | --- | --- | --- |
| Rollup table composite PKs | FIXED | `shared/schema-postgres.ts`, `server/internal/collection-bootstrap-records.ts`, `drizzle/0014_reviewed_collection_record_daily_rollups.sql`, `drizzle/0015_reviewed_collection_record_daily_rollup_refresh_queue.sql`, `drizzle/0016_reviewed_monitor_and_monthly_rollups.sql` | Composite primary keys now exist for daily rollups, monthly rollups, and refresh queue slices. |
| N+1 day-insert batch issue | FIXED | `server/repositories/collection-daily-repository-utils.ts`, `upsertCollectionDailyCalendarDays()` | Per-day sequential insert loop has been replaced by a batched `VALUES` upsert. |
| 100dvh viewport fallback | FIXED | `client/src/index.css`, `client/src/App.tsx`, major page shells | Shared viewport utility classes now provide `100vh` fallback with `100dvh` support. |
| SQL LIKE wildcard escaping | FIXED | `server/repositories/sql-like-utils.ts`, `server/repositories/search.repository.ts` | Search patterns are escaped and queries use `ESCAPE '\\'`. |
| Backup export OOM risk from full table loading | PARTIALLY FIXED | `server/repositories/backups-restore-utils.ts`, `server/services/backup-operations.service.ts` | Create-backup path now writes paged temp payloads, but full-payload materialization still exists in helper/export/restore paths and backup storage remains one large JSON string. |
| WebSocket early-close cleanup | FIXED | `server/ws/runtime-manager.ts`, `server/ws/tests/runtime-manager.test.ts` | Current early-close paths do not populate the map before close, so the old leak claim is not supported by current code. |
| Silent receipt catch blocks | STILL PRESENT | `server/routes/collection-receipt.service.ts` | Several catches still return fallback values or perform best-effort cleanup without structured logging. |

No regression was detected for the previous findings listed above.

### New Findings

- Activity moderation routes lack dedicated admin-action rate limiting even though similar auth-admin routes already use `rateLimiters.adminAction`
- API response envelopes remain inconsistent across modules (`ok`, `success`, and raw payload styles)
- Legacy route aliasing remains broad (`/api/login` and `/api/auth/login`, `/api/search/columns` and `/api/columns`, `/api/activity/all` and `/api/activities`)
- Several operational files remain very large and mixed in responsibility, especially in collection and storage layers
- Frontend still contains scattered `console.*` instrumentation outside the structured backend logging strategy

### Critical Path

The most important next actions, in order:

1. Reduce remaining backup export and restore memory amplification
2. Add dedicated limiter coverage for bulk moderation routes in `server/routes/activity.routes.ts`
3. Improve logging inside receipt service catch paths that currently fail quietly
4. Normalize API response envelopes and start reducing legacy route alias drift
5. Split the largest collection and storage files before they become the default extension point for more logic

## B. Architecture Overview

### Backend Architecture

The backend is assembled through a deliberate composition root in `server/internal/local-server-composition.ts` and an HTTP pipeline in `server/internal/local-http-pipeline.ts`.

The overall shape is healthy:

- routes define endpoints and permissions
- controllers exist for major modules such as search, operations, AI, and imports
- services own business logic
- repositories encapsulate SQL-heavy behavior
- storage adapters expose a common interface to application services

The architecture is not perfectly uniform. Some route groups still call services directly or combine request parsing and orchestration without a distinct controller layer. This is not a correctness bug, but it does mean the advertised route -> controller -> service -> repository flow is only mostly true, not universally enforced.

### Frontend Architecture

The frontend is a React + TypeScript app with a central shell in `client/src/App.tsx`, lazy page loading in `client/src/app/lazy-pages.tsx`, and a modular page structure under `client/src/pages`.

Strong frontend patterns observed:

- lazy page and feature loading
- dedicated hooks for mobile and viewport behavior
- reusable UI primitives
- explicit mobile branches where operationally necessary
- route-level error handling through `client/src/app/AppRouteErrorBoundary.tsx`

Weaknesses observed:

- a few very large page and hook files remain
- some page-level logic still mixes networking, local state, and export behavior
- response shape inconsistency on the backend increases frontend client branching

### Data Flow

Typical request flow:

1. frontend page or hook calls REST endpoint through the API client
2. route applies auth, permissions, and sometimes rate limiting
3. controller or route handler delegates to a service
4. service delegates to repositories or storage adapters
5. repository executes Drizzle SQL and returns typed payloads
6. backend returns JSON or file response
7. frontend updates page state, often with explicit loading and error branches

The most complex flows are:

- auth and session lifecycle
- collection record mutation and rollup refresh
- receipt upload, preview, and download
- backup, export, and restore
- AI interaction, concurrency limits, and mobile shell behavior

### Notable Architectural Strengths

- Explicit composition root
- Good separation of security-sensitive primitives
- Clear receipt security boundary
- Strong CI governance
- Reasonable lazy loading in the client

### Notable Architectural Weaknesses

- Large repository and storage surfaces in collection-heavy areas
- Some controller coverage is inconsistent
- API contract drift increases frontend complexity
- Backup and restore remain architecturally heavy

## C. Findings by Category

### Backend

#### 1. Backup export and restore still materialize large payloads in memory

- Severity: Critical
- Category: Backend, Database, Performance, Reliability
- Exact location:
  - `server/repositories/backups-restore-utils.ts`
  - `getBackupDataForExport()`
  - `prepareBackupPayloadFileForCreate()`
  - `server/services/backup-operations.service.ts`
  - `exportBackup()`
  - `createBackup()`
  - `restoreBackup()`
- What was found:
  - `createBackup()` no longer builds the payload purely through one `Promise.all([...db.select()...])` path. It now uses `prepareBackupPayloadFileForCreate()` to page data into a temp file.
  - However, `getBackupDataForExport()` still exists and still loads full table sets into memory.
  - `exportBackup()` and `restoreBackup()` still call `JSON.parse(...)` or `JSON.stringify(...)` on the full backup payload.
  - Backups are still stored as a large JSON string in `backups.backupData`.
- Why it matters:
  - This remains the most meaningful scale risk in the system. It is no longer as bad as the previous audit claimed, but it still amplifies memory usage on large datasets.
- Current status: Existing - PARTIALLY FIXED
- Recommended improvement direction:
  - Continue moving backup export and restore away from full-string payload handling.
  - Retire the old full-memory helper once compatibility is confirmed.
- Priority: Fix Now

#### 2. Activity moderation routes lack dedicated admin-action rate limiting

- Severity: Medium
- Category: Backend, Security, API
- Exact location:
  - `server/routes/activity.routes.ts`
  - `/api/activity/logs/bulk-delete`
  - `/api/activity/kick`
  - `/api/activity/ban`
  - `/api/admin/ban`
  - `/api/admin/unban`
  - comparison point: `server/routes/auth/auth-admin-routes.ts`
- What was found:
  - These routes are protected by authentication and role checks.
  - They do not use a dedicated limiter like `rateLimiters.adminAction`, even though similar sensitive auth-admin routes do.
- Why it matters:
  - The routes are privileged and potentially disruptive. The current protections are not absent, but they are less explicit than adjacent admin surfaces.
- Current status: New - STILL PRESENT
- Recommended improvement direction:
  - Align these routes with the rest of the admin-action hardening model.
- Priority: Fix Next

#### 3. Receipt service still contains silent catch paths with weak observability

- Severity: Medium
- Category: Backend, Error Handling, Observability
- Exact location:
  - `server/routes/collection-receipt.service.ts`
  - `extractReceiptBuffer()`
  - `getQuarantinedReceiptBytes()`
  - `removeCollectionReceiptFile()`
  - `pruneMissingRelationReceipt()`
  - legacy preview and promotion branches
- What was found:
  - Several catches return `null`, suppress cleanup failures, or fall back silently.
  - Main request-failure paths do log, but multiple best-effort branches do not.
- Why it matters:
  - This is less about broken functionality and more about missing evidence when edge-case file behavior occurs in production.
- Current status: Existing - STILL PRESENT
- Recommended improvement direction:
  - Add structured warning-level logging for fallback and cleanup branches that currently disappear silently.
- Priority: Fix Next

#### 4. Backend layering is mostly good, but not fully uniform

- Severity: Low
- Category: Backend, Architecture, Maintainability
- Exact location:
  - `server/routes/*`
  - `server/controllers/*`
  - `server/internal/local-server-composition.ts`
- What was found:
  - Some route groups cleanly delegate through controllers.
  - Others still parse request details and orchestrate services directly.
- Why it matters:
  - This is not a runtime defect, but it makes long-term route consistency harder and increases variation in how business logic enters the service layer.
- Current status: Existing - STILL PRESENT
- Recommended improvement direction:
  - Continue converging route groups toward a more uniform boundary over time, starting with the largest operational surfaces.
- Priority: Fix Later

### Frontend

#### 5. Frontend has improved mobile-specific architecture, but several high-density surfaces remain runtime-sensitive

- Severity: Medium
- Category: Frontend, UI/UX, Responsiveness
- Exact location:
  - `client/src/components/FloatingAI.tsx`
  - `client/src/hooks/use-mobile-viewport-state.ts`
  - `client/src/pages/AuditLogs.tsx`
  - `client/src/pages/activity/ActivityLogsTable.tsx`
  - `client/src/pages/collection-records/ReceiptPreviewDialog.tsx`
  - `client/src/pages/collection-records/ViewAllRecordsDialog.tsx`
- What was found:
  - The codebase now contains explicit mobile logic for AI layout, viewport changes, receipt preview fallback, collection record dialogs, and activity cards.
  - This is a meaningful improvement over the previous audit baseline.
  - However, these surfaces remain complex and require periodic runtime QA on real devices because browser chrome, keyboard, and dynamic viewport behavior cannot be fully proven statically.
- Why it matters:
  - These are user-facing operational interfaces on phones. Static code quality is good here, but runtime fidelity still depends on device behavior.
- Current status: Existing - NOT VERIFIABLE STATICALLY
- Recommended improvement direction:
  - Keep mobile runtime QA as part of release discipline for high-density pages and modal-heavy flows.
- Priority: Monitor Only

#### 6. Several frontend files remain too large and mixed in responsibility

- Severity: Medium
- Category: Frontend, Maintainability
- Exact location:
  - `client/src/index.css` - 919 lines
  - `client/src/pages/Viewer.tsx` - 834 lines
  - `client/src/hooks/useSystemMetrics.ts` - 769 lines
- What was found:
  - The largest frontend files combine multiple concerns such as layout, export logic, rendering modes, chart preparation, or wide global style ownership.
- Why it matters:
  - These files are now hard to audit safely. They are likely to become the default place for future logic because they already contain too much context.
- Current status: New - STILL PRESENT
- Recommended improvement direction:
  - Split by concern rather than by arbitrary line count, starting with the most operationally risky files.
- Priority: Fix Next

#### 7. Frontend observability is weaker than backend observability

- Severity: Low
- Category: Frontend, Observability
- Exact location:
  - `client/src/pages/Viewer.tsx`
  - `client/src/pages/Dashboard.tsx`
  - `client/src/components/AutoLogout.tsx`
  - `client/src/pages/Import.tsx`
  - `client/src/pages/Login.tsx`
  - `client/src/pages/AuditLogs.tsx`
  - `client/src/pages/Activity.tsx`
  - `client/src/pages/BackupRestore.tsx`
- What was found:
  - The backend uses structured pino logging consistently.
  - The frontend still has scattered `console.error`, `console.warn`, and one `console.log` in production code paths.
- Why it matters:
  - This is mostly hygiene rather than a security or correctness issue, but it creates inconsistent diagnostics across the stack.
- Current status: New - STILL PRESENT
- Recommended improvement direction:
  - Standardize frontend diagnostics or narrow `console.*` usage to explicit development-only surfaces.
- Priority: Fix Later

### UI/UX

#### 8. Mobile-focused operational UX has improved materially

- Severity: Low
- Category: UI/UX
- Exact location:
  - `client/src/components/FloatingAI.tsx`
  - `client/src/pages/collection-records/ReceiptPreviewDialog.tsx`
  - `client/src/pages/collection-records/ViewAllRecordsDialog.tsx`
  - `client/src/pages/activity/ActivityLogsTable.tsx`
  - `client/src/pages/AuditLogs.tsx`
- What was found:
  - Mobile-specific logic now exists for AI bottom-sheet behavior, collection record detail density, PDF preview fallback, and activity card presentation.
- Why it matters:
  - This was a weak area historically. The current code shows clear mobile-awareness rather than simple desktop shrink-to-fit behavior.
- Current status: Fixed - FIXED
- Recommended improvement direction:
  - Preserve these patterns and avoid redesign churn without targeted device QA.
- Priority: Monitor Only

#### 9. Information density remains high on several operational pages

- Severity: Medium
- Category: UI/UX, Maintainability
- Exact location:
  - `client/src/pages/AuditLogs.tsx`
  - `client/src/pages/Monitor.tsx`
  - `client/src/pages/Analysis.tsx`
  - `client/src/pages/Dashboard.tsx`
- What was found:
  - Even after mobile improvements, these pages still carry high information density and several conditional panels.
- Why it matters:
  - This is not a correctness bug, but dense operational pages accumulate UX debt faster than lighter surfaces.
- Current status: Existing - NOT VERIFIABLE STATICALLY
- Recommended improvement direction:
  - Continue using progressive disclosure on dense pages instead of adding more always-visible controls.
- Priority: Monitor Only

### API

#### 10. Response envelope consistency remains uneven

- Severity: Medium
- Category: API, Maintainability
- Exact location:
  - `server/controllers/imports.controller.ts`
  - `server/controllers/operations.controller.ts`
  - `server/controllers/search.controller.ts`
  - `server/routes/collection-receipt.service.ts`
  - `server/routes/settings.routes.ts`
  - `server/routes/collection/collection-route-shared.ts`
- What was found:
  - Some endpoints return `{ ok: true, ... }`
  - some return `{ success: true, ... }`
  - some return raw payload objects or arrays
  - some return structured `result.statusCode/result.body` envelopes
- Why it matters:
  - The frontend has to know endpoint-specific conventions instead of benefiting from predictable API contracts.
- Current status: New - STILL PRESENT
- Recommended improvement direction:
  - Define a small number of approved envelope styles and migrate gradually.
- Priority: Fix Next

#### 11. Legacy route aliasing increases contract drift

- Severity: Medium
- Category: API, Maintainability
- Exact location:
  - `server/routes/auth/auth-session-routes.ts`
  - `server/routes/search.routes.ts`
  - `server/routes/activity.routes.ts`
- What was found:
  - Examples:
    - `/api/login` and `/api/auth/login`
    - `/api/search/columns` and `/api/columns`
    - `/api/activity/all` and `/api/activities`
- Why it matters:
  - Route aliases are often acceptable for backward compatibility, but too many of them increase testing surface and client drift risk.
- Current status: Existing - STILL PRESENT
- Recommended improvement direction:
  - Document canonical routes and treat aliases as compatibility-only until they can be retired safely.
- Priority: Fix Later

### Database

#### 12. Rollup primary key integrity has been corrected

- Severity: Low
- Category: Database
- Exact location:
  - `shared/schema-postgres.ts`
  - `server/internal/collection-bootstrap-records.ts`
  - `drizzle/0014_reviewed_collection_record_daily_rollups.sql`
  - `drizzle/0015_reviewed_collection_record_daily_rollup_refresh_queue.sql`
  - `drizzle/0016_reviewed_monitor_and_monthly_rollups.sql`
- What was found:
  - Composite primary keys are now defined for the rollup and queue tables previously flagged.
- Why it matters:
  - This removes a real schema-quality concern from the earlier audit.
- Current status: Fixed - FIXED
- Recommended improvement direction:
  - Preserve the new schema discipline and keep bootstrap assertions aligned with Drizzle definitions.
- Priority: Monitor Only

#### 13. Daily calendar insert batching has been corrected

- Severity: Low
- Category: Database, Performance
- Exact location:
  - `server/repositories/collection-daily-repository-utils.ts`
  - `upsertCollectionDailyCalendarDays()`
- What was found:
  - The previous sequential insert pattern has been replaced with a single batched upsert query.
- Why it matters:
  - This reduces query chatter and removes a real efficiency flaw from the prior audit.
- Current status: Fixed - FIXED
- Recommended improvement direction:
  - Keep this pattern as the standard for similar slice-based writes.
- Priority: Monitor Only

#### 14. Some soft-linked relationships remain by design

- Severity: Low
- Category: Database, Maintainability
- Exact location:
  - `shared/schema-postgres.ts`
  - `server/internal/collection-bootstrap-access.ts`
- What was found:
  - The schema now has stronger FK coverage than before, but several text-driven or compatibility-oriented relationships remain soft-linked.
- Why it matters:
  - This is not automatically a defect. It becomes a defect only if soft links are mistaken for strongly enforced relational guarantees.
- Current status: Existing - NOT VERIFIABLE STATICALLY
- Recommended improvement direction:
  - Treat remaining soft links as deliberate design choices unless there is evidence of orphan drift or consistency bugs.
- Priority: Monitor Only

### Security

#### 15. Core session and auth hardening are strong and should be preserved

- Severity: Low
- Category: Security
- Exact location:
  - `server/http/csrf.ts`
  - `server/auth/guards.ts`
  - `server/auth/passwords.ts`
  - `server/auth/session-jwt.ts`
  - `server/config/runtime.ts`
- What was found:
  - Multi-layer CSRF protection
  - secure session cookie discipline
  - timing-aware password validation
  - secret rotation support
  - environment guardrails for production-like environments
- Why it matters:
  - These are genuine strengths and reduce common operational attack surface.
- Current status: Fixed - FIXED
- Recommended improvement direction:
  - Preserve these patterns and avoid unnecessary rewrites in auth/session code.
- Priority: Monitor Only

#### 16. 2FA key separation is now in place

- Severity: Low
- Category: Security
- Exact location:
  - `server/config/security.ts`
  - `server/auth/two-factor.ts`
  - `server/services/auth-account-self-operations.ts`
- What was found:
  - New 2FA encryption now requires `TWO_FACTOR_ENCRYPTION_KEY`.
  - Legacy decryption fallback still supports older records encrypted with the session secret.
- Why it matters:
  - This resolves the earlier key-separation weakness without breaking legacy access.
- Current status: Fixed - FIXED
- Recommended improvement direction:
  - Ensure operations staff treat `TWO_FACTOR_ENCRYPTION_KEY` as a first-class production secret.
- Priority: Monitor Only

### Performance

#### 17. Large feature chunks remain in analytics, export, PDF, and Excel paths

- Severity: Medium
- Category: Performance, Frontend
- Exact location:
  - build outputs generated from:
    - `client/src/pages/Monitor.tsx`
    - `client/src/pages/Analysis.tsx`
    - `client/src/pages/Import.tsx`
    - `client/src/pages/Viewer.tsx`
    - chart, excel, and pdf feature bundles
  - CI guard: `.github/workflows/ci.yml`
- What was found:
  - Lazy loading is present, which is good.
  - Despite that, feature chunks for charts, Excel, PDF, and capture flows remain large.
- Why it matters:
  - This is mainly a low-spec device and cold-path latency concern, especially on operational networks and phones.
- Current status: Existing - STILL PRESENT
- Recommended improvement direction:
  - Keep aggressive lazy-loading discipline and avoid moving heavy libraries into the main app shell.
- Priority: Fix Later

#### 18. Backup storage model remains a scaling bottleneck even after create-path improvements

- Severity: High
- Category: Performance, Database, Reliability
- Exact location:
  - `server/services/backup-operations.service.ts`
  - `server/repositories/backups-restore-utils.ts`
  - `shared/schema-postgres.ts`
- What was found:
  - The create path is better than before, but the backup model still centers on a single large JSON payload persisted to the database.
- Why it matters:
  - This limits how far backup/export can scale before memory and payload-size behavior become operationally uncomfortable.
- Current status: Existing - PARTIALLY FIXED
- Recommended improvement direction:
  - Treat this as a reliability and scale problem, not just a repository optimization problem.
- Priority: Fix Now

### Maintainability

#### 19. Collection data layer remains too concentrated in one repository utility file

- Severity: High
- Category: Maintainability, Architecture
- Exact location:
  - `server/repositories/collection-record-repository-utils.ts` - 1130 lines
- What was found:
  - This file contains rollup maintenance, queue management, create/list/summarize/update/delete operations, monthly summaries, and purge flows.
- Why it matters:
  - It is now a multi-domain file, not just a repository helper. This raises regression risk for every future change in collection logic.
- Current status: Existing - STILL PRESENT
- Recommended improvement direction:
  - Split by responsibility boundary, not just by line count.
- Priority: Fix Next

#### 20. Storage and service surfaces are still oversized in several core areas

- Severity: Medium
- Category: Maintainability, Architecture
- Exact location:
  - `server/services/collection/collection-record-mutation-operations.ts` - 975 lines
  - `server/storage-postgres-types.ts` - 881 lines
  - `shared/schema-postgres.ts` - 839 lines
  - `server/services/auth-account-authentication-operations.ts` - 792 lines
  - `server/routes/collection-receipt.service.ts` - 790 lines
  - `server/repositories/collection-receipt-utils.ts` - 726 lines
- What was found:
  - Several high-value modules now sit beyond the size where safe review is easy.
- Why it matters:
  - Large files are not automatically wrong, but in these cases they correlate with mixed responsibilities and high operational sensitivity.
- Current status: Existing - STILL PRESENT
- Recommended improvement direction:
  - Use boundary-driven decomposition on future changes rather than waiting for an all-at-once refactor.
- Priority: Fix Next

## D. Module-by-Module Review

### Auth, Account, and Session

Current state: Strong

- Strongest backend area overall
- Session guards in `server/auth/guards.ts` are rigorous
- CSRF and cookie handling are mature
- 2FA key separation is now fixed
- Idle session consistency was improved via `expireIdleActivitySession()` in `server/repositories/activity.repository.ts`

Main residual risk:

- broad auth surface means changes here carry high blast radius
- route alias drift remains present in login/session endpoints

### Collection Flows

Current state: Functional but complexity-heavy

- Collection flows are feature-rich and operationally useful
- Biggest technical debt concentration in the repo
- Mutation logic and repository utilities are now very large

Main residual risk:

- future feature work is likely to pile into already oversized collection files

### Collection Daily, Summary, and Nickname

Current state: Improved and mostly healthy

- Daily batching issue is fixed
- Rollup table key integrity is fixed
- Refresh queue and monthly summary logic are now structurally safer than before

Main residual risk:

- rollup and nickname flows are still operationally coupled to a broad collection domain surface

### Receipt Handling

Current state: Strong security, moderate observability debt

- File validation is a standout strength
- Receipt preview/mobile fallback architecture is materially better than before
- Main weakness is not security but silent fallback behavior in some catch branches

Main residual risk:

- difficult production debugging for cleanup and edge-case preview failures

### General Search

Current state: Healthy

- Search routes are rate-limited
- SQL `LIKE` escaping is fixed
- Search controller and repository boundaries are understandable

Main residual risk:

- route alias duplication (`/api/search/columns` and `/api/columns`)

### Viewer

Current state: Functional but oversized

- Feature-rich and supports multiple export paths
- Still one of the largest client pages

Main residual risk:

- maintainability and low-spec performance, not immediate correctness

### Activity and Audit

Current state: Security-adequate, operationally improved, still worth watching

- Mobile-specific rendering now exists for activity cards
- Audit mobile state is better structured than before
- Auth and permission boundaries are present

Main residual risk:

- activity moderation routes do not use a dedicated admin limiter
- page density still requires runtime QA on phones

### Dashboard and Analysis

Current state: Good feature coverage, moderate performance pressure

- Strong reporting coverage
- Charts and export features are useful

Main residual risk:

- heavy bundles and dense information layout on smaller devices

### Settings, Admin, and Security Surfaces

Current state: Strong

- Admin auth flows are better limited than most of the rest of the system
- Security settings and account lifecycle rules are well defended

Main residual risk:

- response contract inconsistency across admin-related routes

### Backup, Export, and Import

Current state: Mixed

- Import path has improved materially through temp-file and parser hardening
- Backup path is improved but still the largest systemic reliability concern

Main residual risk:

- memory amplification on large backup export or restore operations

## E. Mobile vs Desktop

### Mobile

Mobile support is meaningfully better than the prior audit suggested.

Verified strengths in code:

- shared `100dvh` fallback utilities in `client/src/index.css`
- mobile viewport handling in `client/src/hooks/use-mobile-viewport-state.ts`
- mobile-aware Floating AI layout in `client/src/components/FloatingAI.tsx`
- type-aware receipt preview fallback in `client/src/pages/collection-records/ReceiptPreviewDialog.tsx`
- mobile collection-record dialog behavior in `client/src/pages/collection-records/ViewAllRecordsDialog.tsx`
- activity card branch in `client/src/pages/activity/ActivityLogsTable.tsx`

Remaining mobile concerns:

- dynamic viewport, keyboard, and browser chrome behavior are only partially auditable statically
- dense pages such as Audit, Dashboard, Analysis, and Monitor still need periodic device QA

### Desktop

Desktop remains the more stable and lower-risk interaction mode overall.

Verified strengths:

- large data surfaces still have richer room on desktop
- operational controls are less compressed
- most responsive complexity now lives behind mobile-specific branches

Desktop risks:

- none of the current major findings are desktop-specific blockers
- maintainability and API contract issues affect both desktop and mobile equally

### Floating AI Impact

Current assessment:

- the code now reflects a much more deliberate mobile bottom-sheet and desktop floating-panel strategy than the older audit implied
- this surface should be treated as stabilized architecture, not as a casual redesign target

Classification: NOT VERIFIABLE STATICALLY for final runtime fidelity on all devices, but no static evidence suggests a current architectural defect in the AI layout system itself

### Modal and Preview Behavior

Current assessment:

- collection record dialogs and receipt preview flows are much more device-aware than before
- PDF fallback logic on mobile is now explicit

Classification: improved and mostly healthy, with runtime verification still recommended for real devices

## F. Priority Matrix

### Critical

- Backup export and restore still materialize large payloads in memory

### High

- Backup storage model remains a scaling bottleneck
- Collection data layer is overly concentrated in `server/repositories/collection-record-repository-utils.ts`

### Medium

- Activity moderation routes lack dedicated admin-action rate limiting
- Receipt service catch blocks still weaken observability
- API response envelopes are inconsistent
- Route alias drift remains broad
- Large frontend files remain hard to audit safely
- Large feature chunks remain in charts, PDF, Excel, and export paths

### Low

- Backend layering is not fully uniform
- Frontend still contains scattered `console.*`
- Some schema relationships remain intentionally soft-linked and should be documented as such
- Dense mobile operational pages require ongoing runtime QA

## G. Improvement Roadmap

### Immediate

1. Finish backup/export/restore memory hardening
2. Add dedicated rate-limit coverage to activity moderation routes
3. Improve structured logging in receipt service fallback and cleanup catches

### Short-term

1. Normalize API envelopes across the most-used operational endpoints
2. Document canonical routes and begin reducing alias sprawl
3. Split the collection repository utility into responsibility-based modules
4. Split the largest frontend operational files by feature boundary

### Medium-term

1. Continue reducing collection mutation/service file size
2. Introduce clearer frontend observability discipline
3. Reassess heavy feature bundles and keep large libraries lazy-loaded
4. Add regular mobile QA coverage for dense operational pages

### Long-term

1. Revisit backup storage architecture so backup/export is not centered on a single large JSON field
2. Continue converging backend route boundaries toward a more uniform controller pattern
3. Review remaining soft-linked schema relationships only where real orphan or integrity evidence exists

## H. Final Verdict

### Is the system stable enough for controlled production use?

Yes.

The current system is stable enough for controlled production use. It is materially healthier than the previous audit suggested, and several formerly important findings are genuinely fixed in the present codebase.

### What still blocks higher confidence?

The main blocker to higher confidence is not general architecture quality. It is the remaining backup/export/restore memory model. That path is now improved, but not yet architecturally comfortable at larger scale.

The next tier of confidence blockers:

- missing dedicated limiter coverage on activity moderation routes
- observability gaps in receipt fallback code
- large collection data-layer surfaces that make future changes riskier than they need to be

### What is technical debt but not a blocker?

- route alias drift
- response envelope inconsistency
- very large frontend and backend files
- dense mobile operational pages that still need runtime QA
- scattered frontend console logging

### Final Assessment

SQR is a credible production-style application with a strong security baseline, meaningful mobile and operational UX improvements, and better schema discipline than the previous audit reflected.

It should now be described as:

**Production-capable with focused scale and maintainability risks, not as a system in broad structural distress.**

The audit priority is no longer broad stabilization. It is targeted risk reduction:

1. backup/export memory path
2. privileged moderation hardening
3. observability in receipt edge cases
4. controlled reduction of file and contract drift
