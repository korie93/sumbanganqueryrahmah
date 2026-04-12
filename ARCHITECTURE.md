# Architecture

## Purpose

Dokumen ini menerangkan seni bina semasa untuk SQR dan menjadi rujukan
utama ketika membuat perubahan pada backend, frontend, database, runtime
ops, dan pipeline pelepasan. Fokus dokumen ini ialah:

- menjelaskan aliran request sebenar
- menunjukkan sempadan modul yang stabil
- mendokumenkan jadual utama PostgreSQL
- menerangkan aliran authentication dan WebSocket
- menyenaraikan guardrails CI/CD dan release verification

Dokumen ini menggambarkan keadaan semasa kod. Sesetengah domain masih
dalam fasa transisi, tetapi arah seni bina yang diinginkan sudah
ditetapkan dan dijadikan asas untuk refactor berperingkat.

## System Overview

SQR ialah aplikasi React + TypeScript di frontend dan Node.js + Express
di backend, dengan PostgreSQL sebagai sumber kebenaran utama. Sistem ini
menggabungkan:

- pengurusan pengguna dan sesi
- import data dan carian
- modul collection / receipts / nickname access
- monitor operasi dan alerting
- AI-assisted search dan branch lookup
- backup, restore, dan audit trail
- WebSocket untuk kemas kini runtime masa nyata

High-level shape:

```text
Browser / Mobile Web
  -> React app
  -> fetch / REST API
  -> WebSocket /ws

Express HTTP runtime
  -> route modules
  -> route handlers / controllers
  -> services
  -> repositories / storage facade
  -> PostgreSQL

Background runtime loops
  -> monitor snapshots
  -> alert sync
  -> rollup refresh listeners
  -> AI / DB circuit telemetry
```

## Deployment Topology

Topologi deployment yang disokong dan didokumenkan secara rasmi pada masa ini ialah:

- satu primary app runtime
- satu primary PostgreSQL database
- Nginx reverse proxy di hadapan app

Ini bermaksud:

- read replica belum menjadi sebahagian daripada kontrak runtime/config rasmi
- reporting dan analytics queries masih berjalan pada primary PostgreSQL yang sama
- sebarang reka bentuk read-replica patut dianggap kerja seni bina berasingan, bukan andaian sedia ada

## Repository Structure

Top-level folders yang paling penting:

- `client/`
  Frontend React, shell HTML, route pages, UI primitives, route-level
  layout logic, browser-side utilities, and test helpers.
- `server/`
  Express app composition, auth, routes, services, repositories,
  internal bootstrapping, WebSocket runtime, config, and ops tooling.
- `shared/`
  Cross-runtime schema exports, Drizzle table definitions, shared API
  contracts, trusted-types constants, and common types.
- `scripts/`
  Repo verification, release readiness checks, smoke pipeline, contract
  guards, and maintenance utilities.
- `docs/`
  Runbooks, QA checklists, runtime workflow notes, CSS architecture, and
  deployment/troubleshooting guides.

## Runtime Entry Points

### `server/index-local.ts`

Primary local/runtime entrypoint. Responsibilities:

- load environment variables
- validate runtime config
- create the local runtime environment
- start the HTTP server
- expose the built app for runtime execution

### `server/cluster-local.ts`

Cluster-aware runtime entrypoint for built deployments. Responsibilities:

- load runtime config
- decide between single-process mode and cluster mode
- configure master orchestration
- start or fork worker processes
- fail fast on unrecoverable cluster master errors

### `server/app.ts`

Thin application export used by tooling and tests so route/middleware
registration stays aligned with the main runtime composition.

## Runtime Composition

The assembled runtime is created in:

- `server/internal/local-runtime-environment.ts`

This module wires together:

- Express application instance
- HTTP server
- WebSocket server
- session middleware
- adaptive protection middleware
- maintenance guard
- runtime monitor manager
- collection rollup refresh notifications
- route registration
- graceful shutdown coordination

This consolidation matters because it reduces drift between:

- local dev boot
- built runtime boot
- test app composition
- WebSocket-enabled runtime boot

## Request Flow

Target request flow:

```text
routes -> controllers / route handlers -> services -> repositories -> PostgreSQL
```

Current codebase is partially transitional, but the layering rules are now
clear enough to use consistently.

### 1. Routes

Route modules live under `server/routes/*` and define:

- URL structure
- auth/role guards
- middleware ordering
- request parsing boundaries
- response status shaping

Examples:

- `server/routes/auth/*`
- `server/routes/collection/*`
- `server/routes/imports.routes.ts`
- `server/routes/settings.routes.ts`

### 2. Controllers / Route Handlers

The codebase uses both dedicated controllers and grouped route-handler
factories. In practical terms, this layer owns:

- request validation
- query/header/body normalization
- translating domain errors to HTTP responses
- route-level observability/logging
- idempotency reservation and replay handling

Examples:

- `server/controllers/operations.controller.ts`
- `server/routes/auth/auth-route-response-utils.ts`
- `server/routes/collection/collection-route-handler-factories.ts`

### 3. Services

Services contain domain logic that should not depend on Express request
objects. Typical responsibilities:

- authentication flows
- settings orchestration
- AI search resolution
- audit cleanup and reporting
- backup operations
- collection/business rules

The goal is that services can be tested independently from transport.

### 4. Repositories / Storage

Repositories own PostgreSQL queries and persistence semantics. They use
Drizzle SQL building plus direct SQL where necessary for performance or
advanced Postgres behavior.

Current storage shape:

- dedicated repositories for focused domains
- `PostgresStorageCore` as a transitional facade
- domain ports such as `AuthAccountStorage` and `AiSearchStorage`

This means some older flows still go through a broader storage facade,
but the extraction direction is toward narrower repository/service seams.

### 5. Database

PostgreSQL is the only supported production-grade database target. Core
constraints:

- schema bootstrap happens in code
- migrations must remain idempotent
- rollups and alerts rely on Postgres features
- runtime health assumes pg pool metrics are available

Current deployment assumption:

- single-primary PostgreSQL connection
- no dedicated read-replica DSN or routing contract yet

## Concrete Request Examples

### Auth Login Flow

```text
POST /api/auth/login
  -> auth route
  -> auth service
  -> user repository / session logic
  -> user_activity + audit logging
  -> session cookie / JWT issued
```

Key behaviors:

- password verification
- account state checks
- optional 2FA path
- single-session / ban enforcement
- audit and activity logging

### Collection Mutation Flow

```text
POST /api/collection/...
  -> auth guard
  -> idempotency handler
  -> collection service / storage
  -> collection tables + receipts + audit
  -> idempotency completion / replay cache
```

Key behaviors:

- header normalization
- mutation fingerprint validation
- optimistic conflict handling
- receipt file handling / quarantine / scanning
- auditability of state changes

### Monitor Snapshot Flow

```text
GET /api/monitor/...
  -> auth/role gate
  -> monitor aggregation logic
  -> runtime monitor manager state
  -> repositories / alert history
  -> API response for monitor dashboard
```

## Observability Model

Observability semasa bertumpu pada:

- structured logs
- liveness/readiness health endpoints
- PostgreSQL pool pressure + health-check monitoring
- browser Web Vitals telemetry
- runtime monitor snapshots/alerts

Rujuk [OBSERVABILITY.md](./docs/OBSERVABILITY.md) untuk pecahan semasa dan sempadan apa yang belum dianggap siap, termasuk status OpenTelemetry.

## Database Schema

Schema definitions are exported via `shared/schema-postgres.ts` and split
into thematic files for maintainability.

### Core / Auth Tables

- `users`
  Canonical user records, roles, password state, activation status, and
  ban flags.
- `accountActivationTokens`
  Activation token lifecycle for newly created users.
- `passwordResetRequests`
  Password reset request tracking and expiry.
- `userActivity`
  Active/inactive login sessions, fingerprint context, and runtime usage.
- `bannedSessions`
  Session invalidation / blocklist support.
- `auditLogs`
  Structured audit trail for privileged and state-changing actions.

Relationships:

- one user can have many activity sessions
- one user can participate in many audit events
- activation/reset records map back to user identity lifecycle

### Import / Search Data Tables

- `imports`
  Imported data batches and metadata.
- `dataRows`
  Row-level imported records associated to a parent import.
- `dataEmbeddings`
  Vector/embedding rows used by AI-assisted search flows.

Relationships:

- one import has many rows
- one row may have one embedding record
- search repositories combine keyword, digits, fuzzy, and semantic paths

### Collection Domain Tables

- `collectionRecords`
  Main collection records domain data.
- `collectionRecordReceipts`
  Receipt file metadata and file linkage for records.
- `collectionRecordDailyRollups`
  Daily aggregate rollups used by dashboards and reporting.
- `collectionRecordMonthlyRollups`
  Monthly aggregate rollups.
- `collectionRecordDailyRollupRefreshQueue`
  Refresh queue for async rollup consistency.
- `collectionStaffNicknames`
  Nickname identities used by collection workflows.
- `collectionNicknameSessions`
  Session tracking for nickname-facing access.
- `adminGroups`
  Admin grouping model.
- `adminGroupMembers`
  Membership rows for admin groups.
- `adminVisibleNicknames`
  Mapping between admins and nickname visibility.
- `collectionDailyTargets`
  Operational target values.
- `collectionDailyCalendar`
  Calendar support for target/day workflows.

Relationships:

- one collection record may have many receipts
- one admin group has many members
- one nickname may be visible to many admins through mapping rows
- rollup tables derive from collection records rather than acting as
  primary write targets

### AI / Branch / Intelligence Tables

- `aiConversations`
  Conversation/session state for AI-related flows.
- `aiMessages`
  Per-message persistence tied to conversations.
- `aiCategoryRules`
  Category classification rules.
- `aiCategoryStats`
  Category statistics and learning signals.
- `aeonBranches`
  Branch metadata for nearest-branch flows.
- `aeonBranchPostcodes`
  Postcode lookup support for branch resolution.
- `systemStabilityPatterns`
  Pattern storage used by runtime intelligence analysis.
- `monitorAlertIncidents`
  Historical alert incidents surfaced to monitor UI.

### Backup / Ops / Settings Tables

- `backups`
  Backup metadata and envelope records.
- `backupPayloadChunks`
  Chunked payload storage for larger backups.
- `backupJobs`
  Backup lifecycle jobs, status, and progress metadata.
- `systemSettings`
  Core runtime-configurable settings.
- `settingCategories`
  Category grouping for settings.
- `settingOptions`
  Selectable option rows.
- `roleSettingPermissions`
  Role-level settings access control.
- `settingVersions`
  Versioning / audit trail for settings mutations.
- `featureFlags`
  Feature enablement toggles.
- `mutationIdempotencyKeys`
  Idempotent mutation reservation/replay state.

## Authentication Flow

Authentication is hybrid: HTTP session behavior, JWT usage, CSRF guard,
activity tracking, and WebSocket session validation all cooperate.

### Login

```text
Credentials
  -> password verification
  -> account / ban / status checks
  -> optional 2FA checks
  -> activity session creation
  -> cookie + signed session/JWT material
```

### Session Secrets and Encryption

Runtime config provides:

- session signing secret
- previous session secrets for verification-only rotation windows
- dedicated 2FA encryption secret
- collection PII encryption secrets
- backup encryption secrets

This separation is important because one leaked secret should not
automatically compromise every control surface.

### Session Cookie and CSRF

HTTP requests are protected by:

- cookie security mode resolution
- CORS allowlist resolution
- CSRF middleware for state-changing routes
- trusted proxy handling for correct `req.ip` and rate limiting

### Activity Tracking and Invalidation

Auth state is backed by:

- `userActivity`
- banned session checks
- last-login timestamps
- audit log emissions for sensitive actions

Logout and enforcement flows should invalidate runtime sessions cleanly
and ensure stale activity cannot remain authoritative.

### Activation and Password Reset

Activation and reset URLs are built from the public app base URL and are
used by the mailer layer. Those flows depend on:

- activation/reset token persistence
- mail transport or dev outbox fallback
- safe public URL resolution

## WebSocket Architecture

WebSocket runtime lives primarily in:

- `server/ws/websocket.ts`
- `server/ws/runtime-manager.ts`
- `server/ws/session-auth.ts`

### Connection Lifecycle

```text
Client connects to /ws
  -> handshake validation
  -> same-origin checks
  -> session token verification
  -> active session lookup
  -> per-user connection limit
  -> socket registered in connectedClients map
```

### Authentication Rules

Runtime manager enforces:

- same-origin handshake expectations
- rejection of unsafe query-string session token patterns
- verification that the mapped activity session is still active
- nickname-session cleanup where relevant

### Heartbeat

Heartbeat loop periodically:

- iterates active sockets
- checks socket liveness
- sends `ping`
- removes sockets that fail liveness checks
- clears interval on server shutdown

This prevents ghost connections from staying registered forever.

### Broadcast and Backpressure

Broadcast flow:

- payload serialization
- message size sanity checks
- `readyState` validation
- buffered amount checks
- dropping backpressured clients if limits are exceeded

This is important because monitor and runtime notifications must not let
slow clients exhaust memory or stall the server.

### Cleanup

On `close` or `error`, runtime manager:

- removes the socket from `connectedClients`
- detaches listeners
- clears nickname-session state where needed
- logs lifecycle transitions at debug/warn level

## Frontend Architecture

Frontend is route-oriented, with page state composed from smaller hooks
and UI primitives.

Important patterns already in use:

- context/provider shells for page-level state
- lazy-loaded monitor and dashboard sections
- `react-window` virtualization for large tables/lists
- centralized design tokens in `theme-tokens.css`
- contract scripts to protect CSP, tokens, breakpoints, and browser-safe patterns

Page composition is moving toward:

```text
route shell
  -> page state hooks
  -> context provider
  -> section wrapper components
  -> reusable UI primitives
```

## Runtime Configuration and Safety

Validated runtime configuration is centralized through:

- `server/config/runtime-env-schema.ts`
- `server/config/runtime.ts`

Rules:

- runtime env is validated on startup
- security-sensitive envs are checked for placeholders
- production-like boot rejects missing required secrets
- scattered direct `process.env` access is intentionally minimized
- repo contracts verify that direct env access stays confined to approved helpers

## CI/CD and Verification Pipeline

The repo uses layered verification rather than a single build-only gate.

### Fast Contract Gates

- node version contract
- client entry shell / CSP contract
- browser storage safety
- design token compatibility
- client tsconfig contract
- server env access contract
- DB schema governance

### Test Layers

- `test:client`
- `test:scripts`
- `test:http`
- `test:services`
- `test:repositories`
- `test:routes`
- `test:ws`
- `test:intelligence`
- `test:db-integration`

### Build and Smoke

Release and smoke flows build the frontend and bundled server, then:

- boot the built server
- wait for readiness
- run preflight checks
- run UI smoke tests
- collect artifacts
- run extra drills such as backup integrity and monitoring snapshots

Primary orchestration scripts:

- `scripts/release-readiness-local.mjs`
- `scripts/smoke-ci-local.mjs`

## Operational Design Notes

### PostgreSQL First

The system assumes PostgreSQL as the standard persistence layer. New
features should not reintroduce mixed-database assumptions.

### Observability

Structured logging, request-context propagation, slow-request warnings,
and runtime monitor snapshots are part of the operational model rather
than optional extras.

### Security-First Defaults

Current direction prefers:

- explicit secrets
- backup encryption enforcement
- PII encryption at rest
- quarantine and scan hooks for uploaded receipts
- consistent auth guard behavior
- safer CSP and client boot shell rules

## Transitional Boundaries

The codebase is improved significantly, but some areas are still
transitional and should be treated carefully:

- some route families still call broader storage facades
- not every domain has a standalone controller file yet
- some bootstrap and runtime monitor behaviors remain infra-heavy
- repository extraction continues incrementally rather than all at once

This is intentional. Stability takes priority over “big-bang” rewrites.

## Change Guidance

When adding or refactoring features:

1. keep request validation near route/controller boundaries
2. keep business rules in services
3. keep SQL and persistence logic in repositories
4. extend runtime config/schema before adding new env-driven behavior
5. add tests and contract guards for regressions that are likely to recur
6. prefer small, production-safe refactors over wide rewrites

That workflow keeps the architecture understandable while still allowing
the project to evolve safely.
