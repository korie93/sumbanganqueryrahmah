# Billing OSP retrospective payment repair — implementation progress

Status: COMPLETE — see [BILLING_OSP_RETROACTIVE_VERIFICATION.md](BILLING_OSP_RETROACTIVE_VERIFICATION.md) for the final evidence and handoff. Earlier checkpoints below are retained as historical implementation notes.

## Request and safety boundary

Full request: `C:\Users\Administrator\.codex\attachments\c85393df-f1ee-4b32-9ad0-5735cf0fee65\pasted-text.txt`.
Active goal covers historical Payment Date attribution, live Saved Collection Source validity, System As Of, calendar/drilldown/exports, old/new daily/monthly rollups, concurrency, bounded repair, RBAC, Table B privacy, and every acceptance/Definition of Done item in that request.

Started from clean `main` at `5cd5898dcd960ffc66d9f5581e6deef5e892c25f` (previous release-readiness fix already pushed). Current changes are this task's uncommitted implementation. No commit/push requested for this task. Do not reset the worktree. Do not read secrets into logs or modify production data. Mutating database tests use guarded disposable local PostgreSQL databases.

## Root cause established

Canonical persisted business date is already `collection_records.payment_date` (PostgreSQL DATE); creation time is audit/tie-break information. Collection matching uses the Payment Date and configured source validity. Save/update/delete already identify historical payment-date slices, not merely today's slice.

OSP's effective query and reporting metadata used the frozen target revision period, however. Editing the Saved Collection Source validity left an existing target reporting its old period. Exact regression: snapshot September 1–30, live source August 12–September 10, SW.ABU_324 payment August 27 entered September 6. Before the fix the qualifying account returned OSP `0.00` instead of `8000.00`. A real repository save reproduces this; no Payment Date rewrite is needed.

The parallel rollup audit additionally reproduced lost collection totals under concurrent saves: aggregate-before-upsert without locking the affected collector/month, and queue completion deleting a newer enqueue generation. These are separate generic collection rollup defects; OSP calculates from canonical records, not these rollup tables.

## Implementation contract

- Keep snapshot baseline, revision period and snapshot provenance immutable.
- Resolve optional `activeRevision.reportingWindow` from current source configuration: `from`, `to`, opaque `version`, `sourceValidityVerified`, and bounded per-source date entries.
- Source-config edits change the reporting fingerprint even when target version is unchanged. Revalidate after expensive reads/exports.
- Disabled source configuration retains historical reporting dates. Genuinely missing legacy configuration uses an explicitly unverified saved-period fallback.
- Preserve existing equal-validity-at-target-creation contract and multi-source support. If existing sources diverge after edits, calendar uses the union envelope and each source's payments/manual dates remain bounded by that source's own validity.
- Date-only ISO validation, inclusive bounds, MYT today clamped to live validity. Direct API validation is authoritative.
- UI adopts changed source metadata without losing private drafts, clamps As Of, refreshes reports, closes stale drilldowns and checks export freshness.
- Rollup changes use transactional locks and queue-generation fencing. Existing internal rebuild route gains an explicit bounded, dry-run-by-default, audited mode; no automatic production repair.
- No migration added so far; audit remains part of final verification.

## Work ownership / resume map

- Root: backend reporting helper/types, effective SQL, target metadata/freshness, source-assignment conflict logic, report service bounds/export metadata, helper/service tests, whole-tree verification and final audit/report.
- `retro_frontend_audit`: client date resolver/API schemas, Billing workspace/insights/calendar/export lifecycle and focused tests; extending browser acceptance/restart verification.
- `retro_reproduction_audit`: `server/repositories/tests/collection-osp-v7-postgres.integration.test.ts`, exact payment reproduction, source changes, multisource, privacy, manual/CP/ABORT, persistence and concurrent freshness tests.
- `retro_payment_rollup_audit`: historical rollup locking, refresh queue fencing, bounded repair helper/internal route and integration/unit tests; Collection validation MYT date.

## Evidence collected (not final suite results)

- RED reproduction: `node --import tsx --test --test-name-pattern='retroactive OSP stale snapshot' server/repositories/tests/collection-osp-v7-postgres.integration.test.ts` — one failure, actual OSP 0 vs expected 8000 before wiring fix.
- Initial focused GREEN: `node --import tsx --test --test-name-pattern='retroactive OSP' server/repositories/tests/collection-osp-v7-postgres.integration.test.ts` — 2 passed, no skips; subsequent expanded run 5 passed, no skips (~15.8 seconds), further coverage in progress.
- `node --import tsx --test server/services/tests/collection-osp-v7-operations.test.ts server/repositories/tests/collection-osp-v7-calendar.test.ts` — 21 passed, no skips; `artifacts/retro-osp-service-initial.log`.
- Client scoped tests reported 39/39 passed by responsible agent; final commands/logs still to consolidate.
- Rollup PostgreSQL same-day/same-month race tests reported 3/3 passed by responsible agent; expanded queue/repair coverage in progress.

## Remaining completion gates

### Final closure checkpoint (supersedes historical pending notes below)

- All implementation gates verified; independent diff audit found no blockers.
- Main staged suite: 3,948 passed, zero skips/failures. Final expanded PostgreSQL files: 16/16 passed (including real identity/source moves, same-day payment and encrypted payment backup/restore). Alternate-host timezone run: 20/20 passed. Final owner/date/CORS run: 31/31 passed.
- Final typecheck and full lint passed after all code/test additions; production build passed against the current application implementation.
- Entire OSP V3 browser harness passed all 12 phases, real application restart and owner/export races, exit 0 (`artifacts/retro-browser-osp-v3-final.log`). Entire general UI smoke passed, exit 0 (`artifacts/retro-browser-ui-smoke.log`). Both generated databases were removed safely; artifacts retained.
- Root reconciled all 54 changed/new paths with the final report inventory; no mismatch. Diff whitespace, secret scan, repo hygiene, schema governance and bundle budgets passed. No migration, dependency change or production repair/write.
- Work remains uncommitted/unpushed as requested for this task. Follow the final report's deployment/optional bounded repair instructions; do not execute an empty-body global rebuild as a substitute for dry run.
- No pending implementation or verification work remains for this goal. Existing 366-day support limit and explicitly unverified legacy-config fallback are disclosed in the report.

### Latest checkpoint

- Main helper/service tests expanded: 26/26 passed, no skips (`artifacts/retro-osp-helper-service.log`). Includes all API date dimensions, export same-version freshness, live-vs-snapshot metadata and post-save comparison using refreshed validity.
- Full owned OSP PostgreSQL integration file: 13/13 passed, no skips (~26.9s). Focused differential + retrospective tests: 9/9 passed, no skips (~33.1s). Independent differential fixture now has real source config; manual evidence outside its source's validity is correctly excluded, not merely hidden from daily movement. Both legacy internal reconciliation readers also enforce own-source payment bounds.
- Retention purge now refreshes actual deleted slices only (retained active manual anchors preserved). Backup finalization preserves concurrent queued generations. Follow-up PG/purge/backup tests: 18/18 passed, no skips.
- Same-account target/source refresh must not retain another account's draft. Shell owner checks and pre-save owner validation added; `X-Billing-Viewer-Id` is an optional server-checked precondition, never an owner selector, checked before idempotent replay. HTTP/CORS focused tests: 17/17 passed, no skips (`artifacts/retro-viewer-precondition.log`). Client owner tests and browser cookie-switch scenarios added.
- Full lint passed once (`artifacts/retro-lint.log`); rerun after final owner/date changes remains required.
- Two typecheck iterations found test-only signature/library issues; corrected (`.at`, optional undefined, execute-only backup finalizer contract). Final successful typecheck still required.
- Full test stages running serially: client 482/482, contracts 124/124, auth 126/126 passed; scripts and HTTP stages passed too, their multipart counts still to consolidate. Services/repositories/routes/ws/intelligence remain to inspect/run.
- Browser module `scripts/lib/billing-osp-retrospective-qa.mjs` added to existing `--osp-v3` before/after application restart. Syntax checked, actual run pending fresh build. Command: `node scripts/collection-save-access-qa-local.mjs --osp-v3`.
- Existing documented Billing scope is at most 366 days (`docs/BILLING_OSP_V3_ENGINEERING_REPORT.md`, engineering limits). Source config permits longer ranges, so oversized live windows retain authoritative dates but calendar/export produce explicit controlled errors; no silent truncation. Focused service test covers this established limit; UI already shows the API error. Ordinary supported windows are unaffected.

### Verification checkpoint after build

- `npm run typecheck` PASS (`artifacts/retro-typecheck.log`); `npm run build` PASS (`artifacts/retro-build.log`), including CSP and production-sourcemap gates. Build has dirty-source manifest deliberately because this task has not been committed.
- `npm run lint` PASS after final application changes (`artifacts/retro-lint-final.log`). New test-only additions still require final typecheck/lint repeat.
- `npm run verify:repo-hygiene`, `npm run verify:secrets`, `npm run verify:db-schema-governance`, `npm run verify:bundle-budgets` PASS; `.env` remains ignored. No migration/dependency changes.
- All normal test stages completed: client 1041+482, scripts 333+51, contracts 124, auth 126, HTTP 327, services 565, repositories 333, routes 469, WebSocket 85, intelligence 12 = 3,948 passing assertions/tests reported by the Node runners, zero skips/failures. Repository stage specifically used `npx tsx --test --test-concurrency=1 server/repositories/tests/*.test.ts`; other stages used their `npm run test:<stage>` scripts, not one literal `npm test` invocation.
- 100k performance fixture PASS (~109 seconds): calendar 7 statements / 2111ms, overview 12 / 2403ms, detail 7 / 2455ms, export 18 / 3233ms. EXPLAIN retained ten-row authorized materialization and ten indexed identity lookups; instrumented EXPLAIN ~52s comparable to earlier local baseline ~51s (not a production latency promise). Repeated detail retained heap delta ~0.3MiB without explicit GC. 10k-target assignment indexed lookup 0.133ms, three statements.
- Real browser exact backdated case, same-version validity edit/draft-safe clamp, owner replacement rejection and real application restart passed in `artifacts/retro-browser-osp-v3-retest.log`. Whole harness then failed an obsolete single-copy error assertion: live metadata correctly cleared the private UI with the new owner-changed message before the export handler's older generic message. Screenshot confirms safe cleared UI. Assertion now accepts only the two specific safe messages and preserves all no-download/no-Blob/private-data assertions.
- Final complete browser rerun is `artifacts/retro-browser-osp-v3-final.log`; inspect its terminal result before claiming success. Its fixture guards isolate fresh databases/uploads, and cleanup reports material deletion of only generated fixtures with artifacts retained.
- Supplemental owner/date/CORS tests PASS 31/31 (`artifacts/retro-final-owner-date.log`).
- Final gap audit added TESTS ONLY for actual canonical account/source/date/nickname mutation across old/new cycles, exact Sep6 normal current payment, and actual encrypted full backup/restore containing late-reported payments (not merely private targets). These additions await focused PG + final typecheck/lint verification.

Latest source edits are uncommitted and no migration has been added. Do not claim full completion until the terminal browser result, new PG cases and report inventory are verified.

1. Complete focused helper/service/repair/queue/source-assignment regression tests and inspect actual outputs.
2. Audit exact authoritative validity across all consumers, multi-source own bounds, live edit/dirty draft/error handling and legacy fallback. Review established 366-day report limits against source configuration.
3. Run relevant/full tests including PostgreSQL suites, 100k SQL performance/query-count tests, restore and private-owner security tests. Never claim skipped integration as passed.
4. Run typecheck, full lint, build and relevant release contract checks serially on this memory-constrained Windows host.
5. Browser proof for exact late payment, As Of/calendar/drilldown, validity edits, refresh and actual server restart; export consistency and role privacy. Build must reflect current changes.
6. Review every changed file/diff and no secrets/unrelated modifications; verify DB cleanup and migration requirement.
7. Produce final report mapping all 22 test scenarios, 24 acceptance assertions and Definition of Done to authoritative evidence, list every file/purpose and exact validation command/result, deployment/repair instructions and genuine risks.

Do not mark the goal COMPLETE while any required gate is unverified. Preserve this document as work progresses so another account/session can continue from the actual worktree.
