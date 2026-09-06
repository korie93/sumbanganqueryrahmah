# Billing Principal OSP retrospective reporting — verification report

Status: **COMPLETE — implementation and local verification.** This is not a production deployment or GitHub release-run approval.

This report records the current implementation and inspected evidence for the request in `C:\Users\Administrator\.codex\attachments\c85393df-f1ee-4b32-9ad0-5735cf0fee65\pasted-text.txt`. The implementation started from clean `main` at `5cd5898dcd960ffc66d9f5581e6deef5e892c25f`. Changes remain uncommitted; this request does not authorize commit/push. Production data has not been repaired or rewritten by this work.

The continuation record is [BILLING_OSP_RETROACTIVE_PROGRESS.md](BILLING_OSP_RETROACTIVE_PROGRESS.md). Its earlier checkpoints are historical; the final command evidence below supersedes those intermediate statuses.

## Root cause

The canonical business date was already PostgreSQL `collection_records.payment_date`, a `DATE`. The real save/matching path persisted and matched the legitimate Payment Date. `created_at` remains an audit timestamp and a deterministic tie-break between otherwise eligible facts, not the retrospective report cutoff.

The reproduced OSP failure was a stale reporting domain: the effective OSP SQL, target metadata and frontend used the immutable target revision's saved period. A later change to Saved → COLLECTION SOURCE validity did not replace that reporting period. A target initially snapshotted for September 1–30 therefore omitted an August 27 payment even after its source's live validity became August 12–September 10.

The exact repository reproduction uses staff `SW.ABU_324`, actual Payment Date `2026-08-27`, and an audit entry timestamp on `2026-09-06`. Before the fix the stale-window case returned `0.00` instead of the account's `8000.00` OSP. The initial RED result was recorded in the progress log; the current passing regression is executable in `collection-osp-v7-postgres.integration.test.ts`. It saves through the real collection repository, then fixes only the synthetic fixture's audit timestamp. No production Payment Date rewrite is needed.

The broader audit found two separate generic collection-rollup races:

- Concurrent transactions could aggregate before either upsert was protected, losing one daily/monthly total. The PostgreSQL race fixture reproduced one record/RM200 instead of two records/RM300.
- An old refresh worker could complete or fail a claimed queue row after a newer enqueue/claim, deleting or modifying that newer work.

OSP System Result reads canonical collection/manual facts through its effective SQL; it does **not** read the generic collection amount rollup tables. Correcting OSP's live domain and correcting generic rollup concurrency are therefore distinct fixes, not a claim that a daily amount table stores OSP Closed.

## Date and source architecture

The governed flow is: collection form/API → canonical Payment Date and source matching → persisted collection/settlement facts → effective OSP SQL with live per-source bounds → overview/calendar/exact-day drilldown/export. Generic daily/monthly amount rollups are refreshed separately from the affected canonical payment-date slices.

`activeRevision.reportingWindow` now exposes live `from`, `to`, a deterministic opaque `version`, `sourceValidityVerified`, and up to five source entries with their own dates and configuration status. Saved revision dates, source snapshots, customer detail and TT OSP baseline remain immutable historical provenance. Export metadata distinguishes the current reporting period from the saved snapshot period.

For configured sources, `collection_source_configs.valid_from` and `valid_to` are authoritative and inclusive. Payments and manual settlement evidence must be inside their own source's interval. Disabled configuration retains its dates for historical reporting; disabling future matching does not erase historical results.

Multi-source targets remain supported. The existing explicit equal-validity-at-creation rule is retained. If configured periods diverge after creation, the visible domain is the earliest start through latest end, but one source cannot borrow another source's wider validity. A legitimate contribution inside its source's bounds remains part of later cumulative As Of totals; a payment outside its own source bounds is excluded.

A genuinely missing legacy configuration uses the immutable saved period as an explicitly unverified fallback. The API and UI expose that condition; it is not silently described as current verified configuration. Invalid/partial source dates fail in a controlled way.

The reporting fingerprint changes for source-bound changes even if the shared target version and outer multi-source envelope are unchanged. Repository reads and expensive export generation recheck authorization, target version and reporting fingerprint before releasing their results. Source assignment conflict checks also use live source bounds, preventing a source-period edit from creating a competing assigned-admin claim.

### System As Of and calendar

All business date inputs are strict canonical `YYYY-MM-DD` values, including leap-day and impossible-date validation. Malaysian business today is computed in `Asia/Kuala_Lumpur`; the default is `clamp(today, liveFrom, liveTo)`. Calendar date arithmetic uses explicit date-only/UTC operations rather than locale-dependent midnight conversions.

Frontend min/max, selected As Of, visible month, day dialog and exported headings use the same live reporting resolver. Target/source changes revalidate the selection; an invalid previous date is clamped before making the next report request. The server independently rejects out-of-range As Of/from/to/drilldown/export dates. HTML date constraints are not authorization or validation boundaries.

The calendar returns all days inside the reporting interval, including zero days; the exact scenario is 30 days, August 12 through September 10. Exact-day drilldown uses the same effective SQL and counts as the calendar. Current collection/source events, focus, visibility and the explicit Refresh action revalidate target/source metadata. Same-owner dirty drafts defer adoption until safe; changed authenticated ownership clears the old private workspace instead of carrying its draft into another account.

An existing documented engineering limit of 366 days remains for calendar/export operations. Longer live configuration dates are retained as authoritative metadata, but those report operations return an explicit controlled error; the implementation does not silently truncate the calendar. This is a genuine supported-range limitation to disclose, not proof of arbitrary-length calendar support.

## Historical rollups, mutation lifecycle and repair

Save uses the canonical payment-date slice. Existing updates already carry both old and new slices; the corrected refresh path now acquires all affected collector/month keys in deterministic order before aggregating or upserting. A daily refresh also touches monthly totals, so locking only each day would not protect simultaneous writes on different days of the same month.

Transaction-scoped advisory locks serialize each affected `(month, creator login, staff nickname)` and coordinate with a full rebuild using a shared/exclusive rebuild lock. Queue claims retain `FOR UPDATE SKIP LOCKED`; completion/failure requires a matching claim token derived from the claimed timestamp and attempt count. Re-enqueued/newly claimed work survives an old worker's completion or failure.

Retention purge refreshes only the actually deleted records' slices. It no longer erases all pre-cutoff daily totals and queued rows, which could include retained active manual anchors or concurrent historical saves. Backup rollup finalization and the existing full rebuild preserve pending queue generations; replay of an already rebuilt slice is harmless.

Real PostgreSQL tests verify date, amount, nickname, deletion, manual verification/revocation, settlement recalculation, repeated refresh and source validity. Final gap tests also move a payment's canonical account/source/date/nickname and verify both old/new settlement cycles and historical daily/monthly slices, including retry/revert. The encrypted full-backup fixture now contains an August 27 CP + ABORT payment pair entered September 6; a fresh restore preserves canonical dates/classification, live-vs-snapshot validity, As Of/calendar/drilldown, rebuilt rollups and private owners. Repeated restore does not duplicate payments or overwrite newer private results, and a deliberately invalid restore rolls the entire transaction back. The two complete fixture files passed 16/16 tests with no skips.

### Safe optional bounded repair

OSP historical results become correct on fresh reads of existing canonical records after deployment; no OSP backfill or baseline reset is required for the stale-domain defect. If generic historical collection amount rollups are independently stale, the existing authenticated internal route supports an explicit bounded repair:

`POST /internal/rollup-refresh/rebuild`

```json
{
  "mode": "bounded",
  "from": "2026-08-12",
  "to": "2026-09-10",
  "createdByLogin": "EXACT_EXISTING_CREATOR_LOGIN",
  "collectionStaffNickname": "EXACT_EXISTING_STAFF_NICKNAME",
  "dryRun": true,
  "maxSlices": 100
}
```

Use the deployment's normal authenticated mutation/CSRF mechanism. The route requires superuser and existing monitor access. The creator login and staff nickname are exact scope values, not owner selectors for private Billing data. Do not paste credentials into the payload, logs or documentation.

1. Start with an explicit bounded payload and `dryRun: true` (also the default when omitted). Dates must be ordered, strict and cover at most 366 days; `maxSlices` must be 1–366 and defaults to 100. Unknown fields and ambiguous scopes are rejected.
2. Inspect `sliceCount`, `affectedMonths`, `before` and `after`. Candidate days include canonical records, existing daily rollups and queued slices so stale-only rows are discoverable. An oversized scope is rejected before writes.
3. Only after reviewing the intended scope, submit the same bounded request with `dryRun: false`. It rebuilds derived totals from canonical records in a transaction and leaves canonical payments untouched.
4. Verify the returned counts and amounts, inspect the request/completion audit events, and repeat a dry run. Repeating the executed repair is idempotent. Pending queue generations are preserved.

Monthly counts/amounts cover the whole affected collector/month, whereas canonical/daily counts in the response cover the requested date interval. They need not be equal for a partial-month repair. Compare like scopes, and verify the whole affected month separately if necessary.

**Do not send an empty body for this procedure.** The existing empty-body full-rebuild behavior is preserved for compatibility and is not the bounded/dry-run workflow. No repair runs automatically during deployment, and no production repair has been executed here.

Audit action names are `COLLECTION_ROLLUP_REBUILD_REQUESTED` and, for bounded completion, `COLLECTION_ROLLUP_BOUNDED_REPAIR_COMPLETED`.

## Business rules and authorization

- A valid date does not create an OSP closure. CP-only records remain excluded. Factual automatic ABORT CP and active manual verified ABORT CP/POOL continue to use their established due/cycle/evidence rules.
- Automatic and manual evidence remain a union for a logical account, not two closures. Later payments, repeated settlement calculation, retry and repeated rollup refresh do not duplicate OSP Closed.
- Table A keeps `Balance OSP = Target OSP − System OSP Closed`, including ALL totals and signed/negative balances. The baseline is not recalculated from a changed live date range.
- Superuser/manager retain existing permitted access; admin access is constrained to assigned targets. Unassigned admins cannot enumerate/read/calendar/drilldown/export another target. Ordinary collection users do not gain Billing access by saving a payment.
- Table B was touched only where shared refresh/export/save lifecycle needed additional protection. Private ownership remains derived from the authenticated server actor. The optional `X-Billing-Viewer-Id` header is a freshness precondition, never an owner selector, and is checked before idempotent mutation replay. A changed cookie cannot save the previous account's dirty draft as the new owner.
- Export final checks reject changed owner/target/source validity. Existing forgery, three-owner isolation and assignment revocation tests remain applicable.

## Evidence index

“PostgreSQL” below means executed against guarded disposable local PostgreSQL databases, not mocked SQL. “Service/route” tests use their repository's fixtures/mocks unless explicitly identified otherwise. “Browser phase passed” is narrower than a complete browser command passing.

| Evidence | Source and inspected result |
| --- | --- |
| E1 — exact PostgreSQL reporting | `server/repositories/tests/collection-osp-v7-postgres.integration.test.ts`: six new `retroactive OSP ...` cases cover stale snapshot, fresh exact payment, multi-source divergence, manual POOL/privacy, in-flight validity changes/legacy fallback and competing admin claims. Included in `artifacts/retro-test-repositories.log`, 333 passed, zero skips. |
| E2 — real rollup races/repair | `server/repositories/tests/collection-record-rollup-retroactive.postgres.test.ts`: simultaneous same-day and same-month writes, old/new dates/nickname, deletion/replay, claim fencing, bounded repair, rebuild concurrency and backup-finalizer queue retention. Included in the same 333-test repository run. |
| E3 — service/date contracts | `server/lib/tests/collection-osp-reporting-window.test.ts`, `server/services/tests/collection-osp-v7-operations.test.ts`, `server/services/tests/collection-business-date.test.ts`: strict dates, MYT defaults, all API bounds, live/snapshot export metadata, post-generation freshness and controlled oversized-range errors. Full services stage: 565 passed, zero skips. |
| E4 — frontend contracts | Client date-domain/owner/API/Insights/export/source-event tests, included in `artifacts/retro-test-client.log`: 1041 plus 482 passed, zero skips. Helper/source-shape tests alone do not prove mounted browser lifecycle. |
| E5 — direct HTTP/security | `collection-billing-principal-v7-routes.integration.test.ts`, `system.routes.integration.test.ts`, service owner-forgery tests and CORS tests; route stage 469, HTTP stage 327, auth stage 126 passed, zero skips. Bounded-repair route coverage uses stubbed operations; E2 proves actual SQL repair. |
| E6 — exact browser/application restart | `scripts/lib/billing-osp-retrospective-qa.mjs` integrated into the real `--osp-v3` harness before/after application restart. `artifacts/retro-browser-osp-v3-final.log` completed with exit 0: all 12 phases passed, including exact Aug27/Sep6 save, historical rolls, As Of/calendar/detail/export, direct RBAC, source shrink/restore, draft-safe clamp, cookie-switch protection, actual application restart, resource cleanup and no-download/no-Blob owner-race assertions. `artifacts/collection-save-access-1788707982641_0b472d/qa-result.json` records exit 0; generated database cleanup is confirmed in the log. |
| E7 — existing business regressions | PostgreSQL V3/V9 target/private-owner/exact-day/manual-POOL cases and differential effective-query suite in the 333-test run preserve CP/ABORT/POOL/deduplication, formulas, frozen detail, assignment and privacy. Browser retest also passed three-owner exports and reassignment phases before its later assertion failure. |
| E8 — performance | Repository run includes real `EXPLAIN ANALYZE` over 100,000 eligible identities producing a 10-row SQL page; measured 52,002.271ms on this local fixture. A separate 10,000-target assignment plan used the assignment index, returned bounded metadata in 0.133ms and retained three fixed queries. These prove SQL scoping/query behavior, not a production latency SLA. |
| E9 — quality gates | Post-addition typecheck and full lint passed in `artifacts/retro-typecheck-final.log` and `artifacts/retro-lint-final-verified.log`. Production build, secret scan, repository hygiene, schema governance and bundle-budget logs passed. No migration/schema file appears in this task's diff. |
| E10 — final real PostgreSQL gaps | `artifacts/retro-final-pg-gaps-focused.log`: 3/3 passed; `artifacts/retro-final-pg-gaps-full.log`: both complete fixture files, 16/16 passed, zero skips. Actual canonical identity/source/date/nickname moves, exact same-day September 6 collection, and encrypted full backup/restore with historical payments, rollups, private owners, idempotency and rollback. |
| E11 — complete general UI smoke | `artifacts/retro-browser-ui-smoke.log`: every smoke phase completed, including real collection/manual/Billing/receipt/backup-restore/logout flows; `artifacts/collection-save-access-1788708287223_46c68c/qa-result.json` records exit 0. Exact disposable database removed, artifacts retained. |

## Required 22-test matrix

| # | Required scenario | Current authoritative evidence |
| --- | --- | --- |
| 1 | Backdated save appears August 27 | E1 stale/fresh repository saves; E6 real API save and calendar/drilldown phase. |
| 2 | As Of August 26 excludes | E1 fresh test iterates all stated As Of values; E6 report helper. |
| 3 | As Of August 27 includes | E1 fresh/stale cases; E6 report helper. |
| 4 | Later As Of September 6 includes | E1 fresh case; E6 report helper (also September 1 and 10). |
| 5 | `created_at` does not control attribution | E1 fresh case varies three audit timestamps around MYT day boundaries with unchanged Payment Date and report results. |
| 6 | Valid From August 12 is inclusive | E1 actual update/save/report/rollup loop; E3 service acceptance of both bounds. |
| 7 | Valid Until September 10 is inclusive | E1 actual update/report/rollup loop; E3 inclusive API bounds. |
| 8 | August 11 outside source excluded | E1 source-save authorization rejection and per-source effective-query bounds; E3 API rejection. |
| 9 | September 11 outside source excluded | E1 single-source save rejection and multi-source contraction excluding existing out-of-own-source payment. |
| 10 | As Of bounds accepted/rejected | E1, E3 and E6 direct out-of-range/invalid-date API calls. |
| 11 | Calendar exactly August 12–September 10 | E1 30-day first/last assertions; E6 API/browser calendar. |
| 12 | Zero-activity valid date retained | E1 August 26 and full length assertions; E6 first-day zero and September 6 zero closure assertions. |
| 13 | Historical August 27 rollup refreshed | E1 canonical daily/monthly SQL reads; E2; E6 persisted SQL checks. |
| 14 | Date edit refreshes old and new | E1 update loop includes August 27→28 and cross-month moves, verifying only current daily/monthly slices; E2 nickname/date edits. |
| 15 | Retry/backfill/update no duplicate | E1 repeated settlement+rollup recalculation and later records; E2 queue/rebuild/idempotent repair; E7 single logical closure union. |
| 16 | CP does not become OSP Closed | E1 amount downgrade to CP and manual/automatic cases; E6 separate CP-only account excluded. |
| 17 | Legitimate ABORT CP still counts | E1 exact historical automatic closure; E6 detail classification `ABORT_CP`; E7. |
| 18 | Assigned admin only; ordinary user denied | E1 manual/privacy and competing-claim tests; E5 routes; E6 real sessions/direct endpoints. |
| 19 | Table B actor isolation | E1/E7 three-owner persistent private values; E3 forgery rejection; E5 viewer precondition; E6 cookie-switch phase. |
| 20 | MYT/date-only correctness | E1 explicit PostgreSQL MYT timezone with differing audit timestamps; E3/E4 day-boundary/leap tests. |
| 21 | Normal same-day payment still works | E10 explicitly saves Payment Date September 6 and audit entry September 6; verifies CP→ABORT, same-day OSP/calendar/rollup and earlier As Of exclusion. E3 also validates same-day Collection dates. |
| 22 | Source validity edit refreshes report without corrupting records | E1 shrink/extend and byte-equivalent snapshot/canonical row assertions; multi-source/freshness cases; E6 same-version live edit, dirty draft clamp, restoration and restart. |

## Mandatory 24-assertion acceptance map

| # | Acceptance assertion | Evidence / qualification |
| --- | --- | --- |
| 1 | Payment Date persists August 27 | E1 and E6 query the real canonical row. |
| 2 | September 6 entry remains audit timestamp | E1/E6 fix only synthetic fixture audit time after the real save, then independently verify it. |
| 3 | System Result attributes to August 27 | E1 As Of results and exact-day effective closure; E6. |
| 4 | August 27 calendar contribution | E1/E6. |
| 5 | Calendar begins August 12 | E1/E6 first-day assertions. |
| 6 | Calendar ends September 10 | E1/E6 last-day assertions. |
| 7 | As Of cannot precede August 12 | E3/E4 constraints and E6 direct HTTP 400. |
| 8 | As Of cannot exceed September 10 | E3/E4 constraints and E6 direct HTTP 400. |
| 9 | August 26 excludes | E1/E6. |
| 10 | August 27 includes | E1/E6. |
| 11 | September 6 includes | E1/E6. |
| 12 | September 10 includes | E1/E6. |
| 13 | August 27 historical rollup correct | E1/E2/E6 canonical-vs-derived SQL totals. |
| 14 | September 6 entry does not create September 6 OSP movement | E1/E6 zero daily closure assertions. |
| 15 | No duplicate closure | E1/E2/E7. |
| 16 | ABORT CP preserved | E1/E6/E7. |
| 17 | CP exclusion preserved | E1/E6/E7. |
| 18 | POOL semantics preserved | E1 manual dated evidence, revoke/automatic union and E7 existing 150+350=500 due/8000 OSP case. |
| 19 | Table A formulas preserved | E1/E6 signed balance assertions; E3/E7 formula/export tests. |
| 20 | Table B privacy preserved | E1/E5/E6/E7/E10; full browser owner/export race and full encrypted restore preserve private ownership. |
| 21 | Authorization preserved | E1/E5/E6/E7, including independent direct drilldown/export denial. |
| 22 | Page refresh same result | E6 reload/report reassertions passed within the retrospective browser phase. |
| 23 | Actual application restart same persisted result | E6 real process restart and fresh-login phase passed; this is stronger than E1's independent reopened connection. |
| 24 | Export/report consistency | E1 export dataset, E3 all-format freshness/metadata, E6 JSON and three-owner real XLSX/PNG/PDF downloads. Complete browser command, including the final owner-race assertions, passed with exit 0. |

## Validation commands and current results

On this Windows host Node was added to PATH for commands with `$env:Path = 'C:\Program Files\nodejs;' + $env:Path`. Real database suites/harnesses used explicit loopback `PG_HOST=127.0.0.1`, `PG_PORT=5432` and isolated disposable databases; credentials were not printed. Full test stages ran serially because of host memory constraints. `npm test` was not invoked as one monolithic command: its constituent stages were executed and inspected separately.

| Exact relevant command | Inspected result / log |
| --- | --- |
| `node --import tsx --test --test-name-pattern='retroactive OSP stale snapshot' server/repositories/tests/collection-osp-v7-postgres.integration.test.ts` | Initial RED: actual 0 vs expected 8000 before implementation; recorded in progress. Subsequent E1 full suite is green. |
| `node --import tsx --test server/services/tests/collection-osp-v7-operations.test.ts server/repositories/tests/collection-osp-v7-calendar.test.ts` | 21 passed, zero skips; `artifacts/retro-osp-service-initial.log`. Superseded by expanded full stages. |
| `npm run test:client` | 1041 + 482 passed, zero skips; `artifacts/retro-test-client.log`. |
| `npm run test:scripts` | 333 + 51 passed, zero skips; `artifacts/retro-test-scripts.log`. |
| `npm run test:contracts` | 124 passed, zero skips; `artifacts/retro-test-contracts.log`. |
| `npm run test:auth` | 126 passed, zero skips; `artifacts/retro-test-auth.log`. |
| `npm run test:http` | 327 passed, zero skips; `artifacts/retro-test-http.log`. |
| `npm run test:services` | 565 passed, zero skips; `artifacts/retro-test-services.log`. |
| `npx tsx --test --test-concurrency=1 server/repositories/tests/*.test.ts` | 333 passed, zero skips, including PostgreSQL performance/functional fixtures; `artifacts/retro-test-repositories.log`. |
| `npm run test:routes` | 469 passed, zero skips; `artifacts/retro-test-routes.log`. |
| `npm run test:ws` | 85 passed, zero skips; `artifacts/retro-test-ws.log`. |
| `npm run test:intelligence` | 12 passed, zero skips; `artifacts/retro-test-intelligence.log`. |
| `npm run typecheck` | Passed after final test additions; `artifacts/retro-typecheck-final.log` (earlier implementation pass in `artifacts/retro-typecheck.log`). |
| `npm run lint` | PASS, full client/server lint after final additions, exit 0; `artifacts/retro-lint-final-verified.log`. |
| `npm run build` | Passed production build and sourcemap gate; `artifacts/retro-build.log`. Build manifest identifies dirty source based on the baseline commit, not a new committed release. |
| `npm run verify:bundle-budgets` | Passed current generated asset budgets; `artifacts/retro-verify-bundle-budgets.log`. |
| `npm run verify:repo-hygiene` | Passed; `artifacts/retro-verify-repo-hygiene.log`. |
| `npm run verify:secrets` | Passed; `artifacts/retro-verify-secrets.log`. |
| `npm run verify:db-schema-governance` | Passed classification/delete-action checks; `artifacts/retro-verify-db-schema-governance.log`. Existing hybrid migration-ledger human-review note is unrelated and unchanged. |
| `node scripts/collection-save-access-qa-local.mjs --osp-v3` | Final PASS, exit 0, all 12 phases, in `artifacts/retro-browser-osp-v3-final.log`. Earlier attempts exposed missing required IC in the synthetic fixture and a single-copy owner-error assertion; both test issues were corrected while preserving real validation and all privacy/no-download assertions. |
| `node scripts/collection-save-access-qa-local.mjs --ui-smoke` | PASS, exit 0; `artifacts/retro-browser-ui-smoke.log` and E11 result JSON. |
| `node --import tsx --test --test-concurrency=1 server/repositories/tests/collection-osp-v7-postgres.integration.test.ts server/repositories/tests/backups-osp-v3-postgres.integration.test.ts` | Final full fixture files PASS, 16/16, zero skips; `artifacts/retro-final-pg-gaps-full.log`. |
| `node --import tsx --test server/http/tests/cors.test.ts client/src/lib/billing-principal-owner.test.ts client/src/lib/billing-principal-date-domain.test.ts client/src/pages/collection/BillingPrincipalV7Api.test.ts server/services/tests/collection-business-date.test.ts` | PASS, 31/31, zero skips; `artifacts/retro-final-owner-date.log`. |
| `node --import tsx --test server/lib/tests/collection-osp-reporting-window.test.ts server/services/tests/collection-business-date.test.ts client/src/lib/billing-principal-date-domain.test.ts client/src/pages/collection/BillingPrincipalInsights.test.ts` with `$env:TZ='America/Los_Angeles'` | PASS, 20/20, zero skips; `artifacts/retro-timezone-final.log`. MYT business-day boundaries remain stable even under a different host timezone. |
| `git diff --check`; `git diff --stat`; `git status --short`; `git log --oneline -15`; `git check-ignore .env` | Reviewed; no whitespace error, 54 task paths documented exactly, `.env` ignored, original baseline/history intact, no commit/push. |

The completed staged test runs total **3,948 passing tests, zero failures and zero skips**. The subsequently expanded PostgreSQL files passed 16/16, and final owner/date/CORS checks passed 31/31; these overlap the main suite and must not be added as distinct tests. All later application/source test changes are covered by these targeted reruns. Both complete browser harnesses passed against the current application build.

## Every changed or created file and purpose

Inventory reconciled with `git status --short`. No dependency manifest, lockfile, `.env`, migration or production data file is changed.

| File | Purpose |
| --- | --- |
| `client/src/lib/api/collection-billing-principal.ts` | Live reporting-window DTO/schema, strict business dates and optional owner-freshness header for private saves. |
| `client/src/lib/api/collection-source-configs.ts` | Emit successful source-config change notifications for live report refresh. |
| `client/src/lib/api/collection-source-configs.test.ts` | Verify source mutation notification and API behavior. |
| `client/src/lib/billing-principal-date-domain.ts` (new) | Shared frontend live/fallback date domain, strict validation, MYT default, clamp and metadata fingerprint comparison. |
| `client/src/lib/billing-principal-date-domain.test.ts` (new) | Boundary, leap/date-only, MYT, multi-source metadata and legacy fallback contracts. |
| `client/src/lib/billing-principal-owner.ts` (new) | Explicit workspace-owner freshness assertion and typed account-change error. |
| `client/src/lib/billing-principal-owner.test.ts` (new) | Missing/changed owner rejection and same-owner acceptance. |
| `client/src/pages/collection/BillingPrincipalDayDialog.tsx` | Authoritative live date bounds and stale/invalid drilldown prevention. |
| `client/src/pages/collection/BillingPrincipalInsights.tsx` | Live calendar range/month state, date-only grid arithmetic and source/owner-aware export final checks. |
| `client/src/pages/collection/BillingPrincipalInsights.test.ts` | Calendar/date behavior and export validity-fingerprint authorization regressions. |
| `client/src/pages/collection/BillingPrincipalSavedTargetDialog.tsx` | Display current reporting period rather than stale snapshot dates. |
| `client/src/pages/collection/BillingPrincipalSavedTargetShell.tsx` | Revalidate target/source/data events, preserve safe same-owner drafts, clear changed-owner workspace and surface current/fallback period. |
| `client/src/pages/collection/BillingPrincipalSavedTargetWorkspace.tsx` | MYT-clamped As Of, live refresh, direct date constraints and owner-bound private-save preflight. |
| `client/src/pages/collection/BillingPrincipalV7Api.test.ts` | Reporting-window API shape, strict date parsing and owner-freshness request tests. |
| `client/src/pages/collection/billing-principal-visual-export.ts` | Render authoritative live validity in visual exports. |
| `client/src/pages/collection/billing-principal-visual-export.test.ts` | Assert current source period appears instead of stale saved period. |
| `scripts/billing-osp-v3-smoke.mjs` | Integrate retrospective scenario and real restart checks; recognize specific safe owner-race rejection copies without removing privacy/no-download assertions. |
| `scripts/lib/billing-osp-retrospective-qa.mjs` (new) | Guarded synthetic Aug27/Sep6 API/browser/SQL fixture, source edits, drafts, owner switches, exports, reload and restart verification. |
| `server/http/cors.ts` | Allow the explicit Billing viewer-freshness request header under existing origin/auth policy. |
| `server/http/tests/cors.test.ts` | Verify allowed browser origins can send the private-save viewer precondition. |
| `server/internal/local-server-route-registration.ts` | Forward optional bounded repair input through existing internal route wiring. |
| `server/lib/collection-osp-reporting-window.ts` (new) | Canonical server live-source resolver/fingerprint, legacy fallback, strict business dates and MYT defaults. |
| `server/lib/tests/collection-osp-reporting-window.test.ts` (new) | Resolver validity, fingerprint, source-count/identity, legacy and timezone tests. |
| `server/repositories/backups-restore-collection-write-utils.ts` | Preserve concurrently enqueued refresh generations after rollup finalization; narrow its executor contract. |
| `server/repositories/collection-osp-effective-query.ts` | Materialized live source windows and own-source bounds for system payments/manual settlement evidence while retaining closure logic. |
| `server/repositories/collection-osp-source-scope-repository-utils.ts` | Enforce conflicting assigned-admin source claims against current source validity. |
| `server/repositories/collection-osp-v7-repository-utils.ts` | Hydrate live metadata, enforce date domain/freshness and preserve consistent overview/calendar/drilldown/export/legacy audit reads. |
| `server/repositories/collection-record-purge-repository-utils.ts` | Rebuild actually deleted historical slices while preserving retained anchors/concurrent queue entries. |
| `server/repositories/collection-record-rollup-queue-utils.ts` | Claim-token fencing for queue completion/failure; injectable executors for real transactional tests. |
| `server/repositories/collection-record-rollup-refresh-utils.ts` | Sorted collector/month transaction locks, protected daily/monthly aggregates and full-rebuild coordination. |
| `server/repositories/collection-record-rollup-repair-utils.ts` (new) | Strict exact-scope dry-run-first bounded repair, limits and before/after canonical/derived counts. |
| `server/repositories/tests/collection-osp-effective-query.postgres.test.ts` | Give differential fixtures real source validity and verify own-source eligibility against the independent oracle. |
| `server/repositories/tests/backups-osp-v3-postgres.integration.test.ts` | Full encrypted backup/restore of backdated CP/ABORT payments, live source validity, rebuilt historical rollups, private owners, repeated restore and rollback. |
| `server/repositories/tests/collection-osp-v7-postgres.integration.test.ts` | Exact backdated reproduction plus live validity, multi-source, manual/CP/ABORT, rollup mutation, privacy and freshness regressions. |
| `server/repositories/tests/collection-record-purge-repository-utils.test.ts` | Prevent broad pre-cutoff rollup/queue erasure; verify affected-slice refresh. |
| `server/repositories/tests/collection-record-rollup-utils.test.ts` | Lock and queue claim/completion SQL contracts. |
| `server/repositories/tests/collection-record-rollup-repair-utils.test.ts` (new) | Reject broad/ambiguous repair input and verify safe defaults/limits. |
| `server/repositories/tests/collection-record-rollup-retroactive.postgres.test.ts` (new) | Real concurrent totals, historical edit/delete/replay, queue fencing, bounded repair and restore-finalizer queue tests. |
| `server/repositories/tests/postgres-fixture-cleanup.ts` | Extend the guarded temporary-database name allowlist to the new rollup fixture prefix. |
| `server/repositories/tests/postgres-fixture-cleanup.test.ts` | Verify the new prefix remains within strict disposable-database cleanup validation. |
| `server/routes/collection.validation.ts` | Validate Collection “today” against Malaysia's business date instead of UTC day. |
| `server/routes/collection/collection-billing-principal-v7-routes.ts` | Reject changed viewer preconditions before private-save idempotency replay. |
| `server/routes/system-rollup-routes.ts` | Validate optional bounded repair requests and audit request/completion under existing superuser/monitor gates. |
| `server/routes/system-route-context.ts` | Type the optional bounded input through the route context. |
| `server/routes/tests/collection-billing-principal-v7-routes.integration.test.ts` | Direct header/session mismatch and idempotent-replay privacy regressions. |
| `server/routes/tests/system.routes.integration.test.ts` | Bounded route authorization, validation, dry-run default and audit response tests. |
| `server/services/collection-rollup-operations.service.ts` | Dispatch explicit bounded repairs transactionally; preserve queued generations during existing full rebuild. |
| `server/services/collection-rollup-refresh-queue.service.ts` | Run claimed historical aggregate refresh inside a transaction that holds its locks. |
| `server/services/collection/collection-osp-v7-operations.ts` | Enforce live date dimensions/defaults, export freshness/metadata and current-window post-save comparison. |
| `server/services/tests/collection-osp-v7-operations.test.ts` | Service/API bounds, both inclusive endpoints, live export metadata, in-flight change rejection and period-limit regressions. |
| `server/services/tests/collection-business-date.test.ts` (new) | MYT collection same-day/future-date boundary validation. |
| `server/storage-postgres-collection-types.ts` | Add the live reporting-window type separately from immutable revision provenance. |
| `docs/BILLING_OSP_RETROACTIVE_PROGRESS.md` (new) | Persistent goal, root-cause, safety, ownership and continuation checkpoint record. |
| `docs/BILLING_OSP_RETROACTIVE_VERIFICATION.md` (new) | This evidence-mapped verification and final handoff report. |

## Database, migration and deployment

No migration is currently required or added: canonical Payment Dates are already correct PostgreSQL `DATE` values; source validity and relevant facts/indexes already exist. The fix changes queries, metadata, transaction locking, queue fencing and frontend state. No applied migration is edited and no target, baseline, source configuration or user reset is part of this task.

Deploy matching newly built frontend and backend assets using the repository's normal release process. Keep existing session/PII encryption configuration unchanged. No special data command is required for the OSP stale-period correction. Use the optional bounded repair only after evidence shows stale generic collection rollups for an exact scope; begin with dry run. This report does not authorize an empty-body global rebuild.

Disposable PostgreSQL fixtures and both final browser harnesses cleaned up their exact generated databases after use. Artifact logs/screenshots are local synthetic verification evidence, not committed customer data. No production performance/repair operation was performed. GitHub CI has not run these uncommitted changes; this is not a claim that a remote release check is green.

## Completed Definition of Done audit

| Required item | Final evidence |
| --- | --- |
| Exact root cause identified | Reproduced stale revision window, 0 vs expected 8000; effective SQL/live configuration audit. |
| Historical/backdated behavior fixed | E1/E6/E10 canonical saves, source edits, browser reload and restart. |
| Payment Date canonical | E1/E6/E10 independently inspect stored DATE and daily movement. |
| `created_at` audit-only | E1 varying audit timestamps and E6/E10 fixed late audit entries leave attribution unchanged. |
| Valid From authoritative | E1/E3/E6 live metadata and inclusive bounds. |
| Valid Until authoritative | E1/E3/E6 live metadata and inclusive bounds. |
| Calendar follows source | E1/E6 exact 30-day window, zero days, live shrink/restore. |
| System As Of follows source | E3/E4/E6 shared min/max/default/clamp. |
| Backend enforces As Of | E1/E3/E5/E6 direct invalid requests denied. |
| Inclusive boundaries | E1 real payment edits and E3 both accepted endpoints. |
| Historical rollup refresh | E1/E2/E6/E10 daily and monthly canonical totals. |
| Edit refreshes old/new dates | E1/E2/E10 actual mutation and cross-month/canonical-identity tests. |
| Existing stale history addressed safely | Fresh live reads require no OSP backfill; E2 bounded dry-run/repair counts, idempotency and exact-scope isolation. |
| No duplicate OSP | E1/E2/E7/E10 retry, later payments, manual/automatic union and repeated restore. |
| ABORT CP preserved | E1/E6/E7/E10 factual threshold and closure tests. |
| CP excluded | E1/E6/E7/E10 amount downgrade, separate CP account and restore. |
| RBAC preserved | E1/E5/E6 direct ordinary-user/unassigned-admin denial. |
| Admin assignment secure | E1/E5/E6 competing source claim, reassignment and in-flight checks. |
| Table B isolated | E1/E5/E6/E10 owner-derived storage, forged-owner denial, dirty-cookie switch, export race and encrypted restore. |
| MYT/date-only verified | E1 database timezone and final E3/E4 alternate-host timezone run, 20/20. |
| Focused regression tests added | Inventory and E1–E5/E10; exact reproduction plus helper/service/PG/browser tests. |
| Relevant integrations pass | Main repository 333/333; final two expanded PG files 16/16; route 469/469; both real browser harnesses exit 0. |
| Typecheck passes | Final `artifacts/retro-typecheck-final.log`, exit 0. |
| Lint passes | Final `artifacts/retro-lint-final-verified.log`, exit 0. |
| Build passes | `artifacts/retro-build.log`, current application code built successfully; later additions only tests/docs/scripts. |
| Migration requirement audited | No schema/migration change needed; existing DATE/config/index structures used and fresh harness migrations pass. |
| No unrelated work overwritten | Started from clean recorded baseline; all 54 changed/new paths mapped to this task; no reset/revert. |
| Final diff self-reviewed | Root and independent read-only audit reviewed SQL, locks, source bounds, formulas, owner/privacy enforcement, repair, fixtures and artifact outputs; no blocking findings. |
| No unresolved in-scope TODO | All 22 scenarios and 24 acceptance assertions above have executed evidence; no pending implementation/test gate remains. |

The final inventory was programmatically compared with `git diff --name-only` plus `git ls-files --others --exclude-standard`: **54 changed/created paths, 54 documented paths, no mismatch**. `git diff --check` passed. Generated test artifacts remain ignored. No production data or external release state was mutated.

## Genuine deployment constraints

- Existing Billing calendar/export scope remains at most 366 days; a longer configured source interval produces a visible controlled error, not silent truncation. This change does not add arbitrary-length calendar support.
- Missing legacy source configuration retains an explicitly unverified saved-period fallback. Configure the source to obtain verified live bounds; do not fabricate historical validity.
- Performance evidence is from disposable local fixtures and is not a production latency SLA. Bounded repair locks affected collector-months; schedule any large approved administrative repair appropriately and inspect its counts.
- This work is not committed, pushed or deployed. Remote GitHub release readiness must run after an authorized commit/push; local passing evidence must not be presented as a remote CI result.

Final verdict: **COMPLETE**.
