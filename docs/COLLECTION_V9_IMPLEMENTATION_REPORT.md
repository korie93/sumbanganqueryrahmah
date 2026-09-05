# Collection V9 implementation and verification report

Status: implementation complete and locally release-verified on 5 September 2026.

This report records the implementation outcome for Collection Manual Verified ABORT, POOL, General Search history, Team Leader view, full Card No, and the Billing Principal two-table model. The referenced master document was treated as the requested product specification; repository and system instructions remained authoritative for execution and safety.

## 1. Repository and branch state before work

- Work started on `main` at `fe3130676f80`.
- The worktree was already dirty. Existing user changes were preserved; no reset, checkout, stash, commit, or destructive rewrite was performed.
- The implementation remains an uncommitted working-tree patch so it can be reviewed before commit.
- Before adding this report, the final audit showed 137 modified/deleted tracked files and 26 new untracked implementation files. The semantic tracked diff was 6,953 insertions and 6,517 deletions. Git emits its existing LF-to-CRLF checkout warning on this Windows environment, while the normal whitespace/error diff check passes.

## 2. Collection Manual Verified ABORT root cause and design

The old model could classify only Collection payments recorded in `collection_records`. A verified prior, external, or otherwise unassigned payment could make the obligation settled in the real world, but there was no controlled way to represent that fact without either falsifying the staff Collection amount or changing the automatic CP/ABORT result.

V9 adds a separate manual-settlement state to the Collection record. A superuser can verify, update, or revoke it through dedicated routes. The workflow requires a positive fixed-point POOL amount, an in-window settlement date, a controlled reason, conditional note, optional reference, explicit confirmation, and an expected version. Repository writes run in a transaction, acquire record and settlement-cycle locks in deterministic order, re-read authoritative facts, enforce threshold and identity invariants, and append immutable audit evidence. Request idempotency and optimistic-version conflicts prevent replay and lost updates. Revocation retains history while removing the manual contribution from effective settlement.

Automatic `classification` remains untouched as the automatic truth. Effective status is projected separately from automatic status plus valid manual evidence.

## 3. POOL ownership and claim protection

`pool_amount` is external/unassigned settlement evidence, not staff Collection. It is never written to `collection_records.amount`, receipt amounts, user rollups, monthly performance, or collector exports as claimed Collection. Ordinary users cannot submit or edit it; only the superuser-only manual-settlement route can do so.

The required RM500 case is preserved exactly: RM150 remains the user's Collection, RM350 remains POOL, and the effective covered amount is RM500. Database and service constraints allow only one active manual settlement per cycle and reject repeated evidence by canonical obligation, date, amount, and normalized reference. Automatic ABORT takes precedence, so the same obligation can never contribute a second OSP closure through POOL.

View Collection, General Search history, backup/restore, and exports label Collection and POOL separately.

## 4. General Search latest-only root cause and full-history fix

The former search enrichment selected one Collection status candidate with a final ordered `LIMIT 1`, and the record dialog rendered only that summary. There was no history endpoint, canonical cross-import history key, or representation for a separate POOL event and purged records.

V9 keeps the initial search response light and issues an opaque, authenticated AES-256-GCM `historyKey`. Expanding “Collection history” lazily calls the history endpoint with a default page size of 10 and a server maximum of 50. The key is decoded server-side and resolved back to one exact active Saved source row; raw import/row identifiers are not caller-controlled API parameters.

One bounded, parameterized repository query unions active Collection payments, active POOL evidence, purged Collection rows, and purged POOL evidence. It matches by the canonical obligation key, not customer name, and sorts deterministically by payment date, creation time, and item id. It returns page metadata plus one aggregate summary without an N+1 query. The UI distinguishes automatic/manual source, user amount, POOL amount, effective status/date, historical state, actor metadata permitted by RBAC, and pagination.

## 5. Full Card No in View Collection

Authorized View Collection reads now return the complete Card No, including team-filtered results and Collection exports. The server does not trust a stored last-four value: it reloads the exact linked Saved row, verifies the import id, row id, canonical obligation, account/card blind indexes, and governed source authority, then hydrates the full card. A mismatch fails closed. This change does not widen route access or expose the full number through logs, history tokens, or unrelated public responses.

## 6. Team Leader source of truth, RBAC, and query design

Team relationships now use immutable `collection_staff_nicknames.id` UUIDs. `admin_groups.leader_nickname_id` and `admin_group_members.member_nickname_id` are the relational source of truth; legacy nickname text is retained only as a compatibility/display snapshot. Foreign keys and uniqueness rules prevent missing, duplicate, or multi-team membership.

Only superuser and manager can list or apply Team Leader scope. Admin and user requests that forge `leaderId`, `teamLeader`, or `scope=team` are rejected. Manager receives read-only team reporting and still cannot create, update, revoke, or otherwise mutate Manual Verified ABORT. Team filtering is composed server-side with all other filters and pagination using a set-based stable-ID subquery; an inactive or empty team returns zero rows instead of falling back to global scope. Nickname rename cascades display snapshots without changing identity.

## 7. Billing Principal `expected 0.0000%` root cause

The previous flow mixed three incompatible ideas: mutable/current source state, legacy manual Table C reconciliation, and client rows that could carry both a manually supplied percentage and OSP Closed amount. Missing or stale baseline evidence could be normalized as zero, while same-date/client bindings made comparisons dependent on calendar context. That allowed a valid masterlisting baseline to surface as an apparent `expected 0.0000%` mismatch.

The fix removes those alternate authorities. Both primary tables now consume one immutable Saved Target TT OSP snapshot. Missing baseline evidence is an integrity error, while a verified source value of zero remains a genuine zero. Client OSP is derived from the saved baseline and the submitted percentage; it is never accepted as client input.

## 8. Saved Target TT OSP baseline fix

Creating a Saved Target snapshots the canonical `Billing Principal (OSP)` value from the selected Saved masterlisting rows into revision-scoped source rows. It does not substitute `Total OSB`. Every revision has a complete D3, D4, D5, and D6 scope; ALL is derived. Target percentages and Target OSP are stored against the immutable per-aging baseline, and source-scope hashes/integrity checks prevent an unrelated or later import from filling a gap.

Unticking or replacing an active Saved source does not rewrite an existing target. Migration 0056 repairs only baselines with immutable source-row evidence and deliberately leaves evidence-free legacy gaps for controlled rebuild instead of manufacturing RM0.

## 9. Table A calculation architecture

Table A is the System result. For D3-D6 and derived ALL it reports TT OSP, Target %, Target OSP, OSP Closed, Result %, target variance, and account count. Its calendar, daily movement, and account drill-down remain System-only views.

Calculation joins revision-scoped canonical obligations to verified Collection events. An automatic threshold-crossing ABORT or a valid Manual Verified ABORT can close one obligation, using the effective settlement date and the target's snapshotted Billing Principal OSP exactly once. Pre-threshold CP amounts do not manufacture OSP closure; automatic ABORT supersedes earlier manual evidence; later events cannot retroactively close an earlier as-of date. Integer/fixed-point money and percentage arithmetic avoids floating-point drift.

## 10. Table B percentage-only architecture

Table B is the Client result and is independent of POOL, Collection records, and the Table A calendar. Its only editable business values are D3-D6 Result percentages. The API accepts a complete percentage snapshot plus expected revision metadata; it does not accept Client OSP Closed or ALL.

For each aging, the server calculates `Client OSP Closed = immutable TT OSP × Result % / 100`. ALL OSP is summed, and ALL Result % is weighted from total Client OSP over total TT OSP. The submission date and actor are audit metadata, not a calendar join key. Table B has no account drill-down and cannot mutate Table A.

## 11. Latest TOTAL comparison logic

The comparison pairs the latest applicable System ALL result with the latest complete Client D3-D6 submission for the same target revision. Each side retains its own date, OSP Closed, and Result %. The displayed delta is percentage points. It does not require equal dates and does not relabel the latest Client result when an operator browses an older Table A calendar day.

## 12. Table C removal and deprecation

`BillingPrincipalTableC.tsx` was removed, Table C mutation UI and active HTTP behavior were removed, and all V9 calculations/exports exclude it. The old reconciliation tables are retained only as append-only historical audit evidence so migration or audit history is not destroyed. Schema comments explicitly mark them deprecated and zero-contribution. Backup compatibility remains able to preserve legacy evidence without restoring it as an active Billing authority.

## 13. Cross-module effective-status to OSP integration

Collection exposes automatic status, effective source, effective date, and manual state separately. Billing consumes the same canonical cycle/obligation identity and reconciliation rules. A valid manual POOL closes an otherwise-open obligation only when System Collection plus POOL reaches TOTAL DUE and no automatic ABORT already owns closure. Edit, delete, void, source-authority change, or revocation revalidates/removes stale manual qualification. Automatic settlement always wins precedence, and each target obligation contributes its snapshotted OSP at most once.

General Search uses the same source/effective distinction, including for minimal purge history, so the UI does not rewrite historical automatic status when manual evidence was the effective source.

## 14. Database migrations, indexes, and constraints

- `0055_collection_manual_verified_settlement.sql`: atomic manual-state columns and CHECK constraint; one-active-settlement-per-cycle unique index; evidence-deduplication unique index; active-date index; legacy Billing deprecation comments.
- `0056_collection_osp_v9_baseline_integrity.sql`: evidence-backed TT OSP/Target OSP repair; Client OSP recalculation from the shared baseline; legacy Table C audit-only comments.
- `0057_collection_purge_canonical_history.sql`: canonical obligation retained in minimal purge history and ordered partial history index.
- `0058_collection_team_stable_nickname_ids.sql`: stable nickname UUID backfill with fail-fast validation, foreign keys, and leader/member uniqueness indexes.
- `0059_collection_purge_manual_settlement_history.sql`: automatic and manual/POOL evidence retained in purge history.
- `0060_collection_osp_v9_complete_aging_scope.sql`: canonical D3-D6 revision scope and CHECK constraint.
- `0061_collection_v9_history_lookup_indexes.sql`: ordered active-obligation and manual-audit partial indexes.

Drizzle schema, journal, runtime bootstrap compatibility, backup/restore datasets, and the rollback governance manifest were updated together. Fresh-database integration passed 22/22 tests, schema validation passed, and the rollback manifest covers 61/61 migrations.

## 15. Security audit

- Manual settlement mutation is superuser-only; history/report reads follow existing report RBAC.
- Team reporting is superuser/manager only; manager remains read-only; admin/user forged scope is denied.
- Canonical source identity, target id/revision id, and row ownership are revalidated server-side to prevent IDOR.
- Full Card No is produced only after exact governed-row and blind-index verification; logging remains redacted.
- History lookup uses bounded authenticated ciphertext and exact server resolution rather than exposed identifiers.
- Money, date, reason, note, reference, confirmation, paging, and percentage inputs are bounded and fail closed.
- Record/cycle locking, optimistic versions, idempotency keys, unique indexes, and append-only audits cover replay and concurrency.
- Both new database JSON read paths use `safeJsonParse` with explicit byte/depth/key/string limits.
- Export requests remain single-concurrency and globally rate limited. The default per-user window permits the three advertised data operations (CSV, XLSX, and one shared PNG/PDF dataset), and export calls do not automatically retry a 429.
- Secret scan, repository hygiene, dependency audit, security suite, production sourcemap policy, and response/parser contracts all passed. Dependency audit reported no moderate-or-higher vulnerability.

## 16. Performance and query-plan findings

The bounded QA probe verified all six expected V9 indexes and reported no sequential relation scans in the sampled plans. Latest final-run execution times were:

| Workload | Rows in QA sample | Execution |
| --- | ---: | ---: |
| General Search active history page | 0 | 0.084 ms |
| General Search purged history page | 0 | 0.091 ms |
| Manual settlement audit history | 0 | 0.089 ms |
| Team Leader Collection page | 0 | 1.066 ms |
| Table A System dataset | 0 | 0.301 ms |
| Table B latest complete snapshot | 4 | 0.668 ms |

Billing calculation inputs are explicitly capped at 100,000 target source rows and 250,000 payment rows, with narrower drill-down/export limits. Export detail is capped at 10,000 rows and an estimated 16 MB.

These numbers prove query shape and index use only on the isolated, sparse QA database. They are not a production-scale latency claim. Production/staging must retain EXPLAIN/baseline and representative-volume load checks as a deployment gate.

## 17. Memory and resource review

Search history is lazy and paginated; large Billing datasets, drill-downs, and exports are bounded by operation. API requests carry abort signals, replaced/unmounted UI work is cancelled, and stale result guards prevent cross-target/team updates. PNG and PDF reuse one governed JSON dataset rather than loading it twice. Excel, capture, and PDF libraries stay lazy-loaded; object URLs, canvases, workbook references, listeners, timers, and temporary downloads are released. Backend transactions release locks/connections through structured completion paths, audit JSON is bounded, backup data remains chunked, and timeout tests now wait on actual signals rather than wall-clock scheduling assumptions.

## 18. Responsive UI/UX review

View Collection exposes clear automatic/effective badges, a separate POOL reconciliation panel, evidence/history, full card, and Team Leader controls without presenting an uncontrolled CP/ABORT dropdown. General Search history has loading, retry, empty, summary, pagination, historical, and POOL-specific states. Billing renders exactly Table A and Table B as primary tables, separates System/calendar styling from Client submission styling, and presents the latest comparison independently.

Automated layout checks covered desktop, mobile, compact height, browser zoom boundaries, and enlarged text. Wide operational tables use bounded horizontal scrolling instead of clipping. Controls have accessible names, native semantics, keyboard behavior, visible focus, and live status/error handling. Visual and axe-based accessibility gates passed.

## 19. PNG, PDF, and Excel export verification

The real Chromium smoke downloaded XLSX, PNG, and PDF and verified their file extensions and binary signatures (`PK`, PNG magic bytes, and `%PDF`). It also asserted that PNG and PDF caused exactly one governed visual-dataset request.

The XLSX unit test parses the produced workbook through SheetJS and verifies real numeric/date cells, formula-injection protection, authorized full Card No, and these sheets: `Summary`, `Table A System`, `Table B Client`, `Latest Comparison`, `Daily Movement`, and `OSP Closed Detail`. No Table C/reconciliation sheet exists. The extra sheets support the two primary result tables; they are not additional Billing result tables.

Collection export likewise keeps user Collection and POOL in separate columns.

## 20. Exact test commands and results

All commands below completed with exit code 0 on the final code unless otherwise stated:

| Command | Final result |
| --- | --- |
| `npm test` | Full configured local regression passed. |
| `npm run typecheck` | TypeScript passed. |
| `npm run lint` | Client and server ESLint passed. |
| `npm run build` | 4,411 modules built; production sourcemaps: 0. |
| `npm run verify:bundle-budgets` | Every generated asset stayed within its raw/gzip budget. |
| `npm run audit:dependencies` | No moderate-or-higher vulnerability. |
| `npm run verify:secrets` | Passed. |
| `npm run verify:repo-hygiene` | Passed. |
| `npm run db:check` | Drizzle schema check passed. |
| `npm run verify:db-migration-rollback` | 61/61 migrations covered. |
| `npm run test:db-integration` | 22/22 passed on PostgreSQL. |
| `npm run verify:server-json-parsing-contract` | 701 server source files inspected; passed. |
| `npm run perf:collection:v9` | Six expected indexes; zero sequential relations in sampled plans. |
| `npm run test:security` | 10 parser/TLS contract tests plus 246 security tests passed. |
| `npm run test:coverage:gate` | 317 tests passed; 86.77% statements/lines, 73.54% branches, 80.88% functions. |
| `npm run release:verify:local` | Complete release gate passed; artifacts in `artifacts/v9-final-release-2`. |

The final release run included 22 database integration, 330 script, 327 HTTP/runtime, 520 service, 289 repository, 451 route, 85 WebSocket, and 12 intelligence tests, in addition to its contract/client/auth batches. It built the production bundle, checked bundle budgets, started the real server, passed preflight, visual and accessibility contracts, then completed one browser smoke attempt. Browser phase timings included Manual Verified ABORT 5.235 s, Billing V9 6.462 s, receipt flow 29.949 s, backup restore 4.053 s, and logout 4.117 s. The DR drill created, exported/verified, and deleted its temporary backup. Final monitor snapshot had 0 HTTP 429s and 0 error rate; its one warning was the expected aggregate runtime-alert warning.

The four explicitly scoped V9 QA databases created during implementation were existence-checked against an exact allowlist, drained, dropped, and then verified absent after all database-dependent checks completed. No other database was targeted.

No success claim depends on an undocumented hand-click-only check. The browser workflows are reproducible automation with screenshots/layout JSON retained in the release artifact directory.

Defects found during final validation were fixed before the passing run: export workflow rate-limit/retry mismatch, two scheduler/base64 test nondeterminisms, and two raw server JSON parsers rejected by the release contract.

## 21. Important changed files and their purpose

### Database and shared contracts

- `drizzle/0055...0061*.sql`, `drizzle/meta/_journal.json`: V9 state, integrity, history, team identity, aging scope, and indexes.
- `shared/schema-postgres-collection.ts`, `shared/schema-postgres-core.ts`, `shared/schema-postgres.ts`: PostgreSQL schema models.
- `shared/api-contracts.ts`, `shared/error-codes.ts`: strict V9 request/response and controlled error contracts.
- `server/storage-postgres-collection-types.ts`, `server/storage-postgres-collection-contracts.ts`, `server/storage-postgres-contracts.ts`, `server/storage/postgres/postgres-collection-storage.ts`: storage interfaces and composition wiring.

### Manual settlement, Collection, Card No, and team scope

- `server/repositories/collection-manual-settlement-repository-utils.ts`: locked write/revoke/read, validation facts, bounded audit decoding, and immutable audit entries.
- `server/services/collection/collection-manual-settlement-operations.ts`, `server/routes/collection/collection-manual-settlement-routes.ts`: superuser workflow and HTTP surface.
- `server/repositories/collection-settlement-repository-utils.ts`, `server/lib/collection-osp-reconciliation.ts`: automatic/manual precedence and exact settlement arithmetic.
- `server/repositories/collection-record-{read,mutation,purge,query-filter,query-shared,query,source-account}-utils.ts`: effective fields, authority recheck, purge history, stable team filters, and full-card hydration.
- `server/services/collection/collection-record-list-read-operations.ts`, `collection-record-update-operations.ts`, `collection-record-delete-operations.ts`, `collection-team-scope.ts`, and `collection-record.service.ts`: authorization and business orchestration.
- `server/repositories/collection-admin-group-*.ts`, `collection-nickname-*.ts`, `collection-staff-nickname-mutation-*.ts`, `server/services/collection/collection-admin.service.ts`, `server/routes/collection/collection-admin-routes.ts`: stable nickname identities and team administration/reporting.
- `client/src/pages/collection-records/CollectionManualSettlementPanel.tsx`, `EditCollectionRecordDialog.tsx`, table/dialog/filter/controller hooks, and Collection API/type files: truthful POOL UI, full Card No, Team Leader filtering, state reset/cancellation, and pagination.
- `client/src/pages/collection-records/export.ts`: separate Collection/POOL export truth and formula safety.

### General Search

- `server/services/search-collection-history-key.ts`: bounded authenticated opaque history key.
- `server/repositories/search.repository.ts`, `search-repository-types.ts`: exact canonical full-history union, summary, ordering, and paging.
- `server/services/search.service.ts`, `search-collection-status-utils.ts`, `server/controllers/search.controller.ts`, `server/routes/search.routes.ts`: authorization, lazy history orchestration, and bounded endpoint.
- `client/src/pages/general-search/GeneralSearchCollectionHistory.tsx`, `GeneralSearchRecordDialog.tsx`, `collection-status.ts`, `useGeneralSearchController.ts`, and `client/src/lib/api/search.ts`: full-history presentation and safe lifecycle.

### Billing Principal

- `server/repositories/collection-osp-v7-repository-utils.ts`: immutable baseline snapshot, bounded System calculation, manual-effective settlement integration, Client persistence, latest comparison, drill-down, and legacy isolation.
- `server/services/collection/collection-osp-v7-operations.ts`: strict inputs, percentage-only Client save, derivation, and governed CSV/XLSX/JSON export.
- `server/services/collection/collection-osp-v7-export-guard.ts`: concurrency and workflow-sized rate guard.
- `server/routes/collection/collection-billing-principal-v7-routes.ts`: two-table target/revision/client/export API; legacy reconciliation routes removed.
- `client/src/lib/api/collection-billing-principal.ts`: validated two-table API and non-retrying export requests.
- `client/src/pages/collection/BillingPrincipalSavedTargetWorkspace.tsx`, `BillingPrincipalSavedTargetShell.tsx`, `BillingPrincipalInsights.tsx`, `BillingPrincipalTargetDialog.tsx`, report/export utilities: two-table UI, immutable-baseline messaging, calendar/drill-down, comparison, and exports.
- `client/src/pages/collection/BillingPrincipalTableC.tsx`: deleted from active UI.

### Durability and release evidence

- `server/repositories/backups-*collection*.ts` and restore dataset/write utilities: POOL/manual/team/Billing snapshot backup compatibility and exact restore ordering.
- `scripts/ui-smoke.mjs`, `ui-visual-contract.mjs`, `ui-accessibility-contract.mjs`, smoke wrappers and their contract tests: real merged workflow, responsive/a11y coverage, downloads, and cleanup.
- `scripts/perf-collection-v9.mjs`, `scripts/tests/perf-collection-v9-contract.test.mjs`: read-only bounded EXPLAIN probe.
- `scripts/release-readiness-local.mjs`, `package.json`, migration rollback manifest, and operational UI matrix: V9 gates wired into normal release verification.
- New and updated tests under `client/src/**/tests`, `server/services/tests`, `server/repositories/tests`, `server/routes/tests`, and `scripts/tests`: arithmetic, RBAC/IDOR, race/idempotency, paging/isolation, export, migration, UI, and release regressions.

## 22. Remaining risks and deployment notes

- The local performance probe proves bounded query design and index selection on sparse QA data, not production-volume latency. Run it plus representative load tests against a sanitized staging copy before production promotion.
- Team scope reflects current active group membership because the repository has no historical membership-effective-date model. Historical “who belonged to which team on that date” reporting would require a separate temporal membership design.
- Legacy Table C data remains intentionally audit-only. Do not delete it until retention/legal owners approve a separate irreversible migration.
- Migrations 0055-0061 must follow the documented backup, checkout, migration-lock, and forward-only deployment process. Verify production PII-key readiness and take a restorable backup first.
- Generated release artifacts and SBOMs are local evidence and are ignored runtime outputs, not source to commit.

No known functional, security, accessibility, build, migration, or tested resource regression remains in the verified scope.
