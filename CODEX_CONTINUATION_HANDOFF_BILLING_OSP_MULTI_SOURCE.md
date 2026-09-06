# Billing OSP multi-source continuation handoff

Status: **COMPLETE**. Updated 2026-09-07. Implemented and locally verified; not committed, pushed or deployed. Treat repository state as authoritative.

## 1. Permanent goal

**GOAL: Fix only Billing Principal (OSP) Create Target so that after a superuser selects a Leader, Configured Saved Source supports selecting, validating, persisting, reading, and reloading multiple eligible configured Saved files for that target, while preserving existing single-source targets, authorization, leader/source eligibility, all Billing OSP calculations, all Collection behavior, and all unrelated system behavior. Continue autonomously until this exact feature is complete, tested, build-verified, and ready to continue/deploy.**

## 2. Original user requirement

Support multiple eligible configured Saved files after selecting the assigned account in Create Target. The user confirmed implementation, tests/build and continuation notes on 2026-09-07. Full source specification: `C:\Users\Administrator\Downloads\CODEX_GPT_6_ASTRA_ULTRA_BILLING_OSP_MULTI_CONFIGURED_SAVED_SOURCES_CONTINUATION_READY.md`.

## 3. Git state

Branch `main`, HEAD `330336364ea6bd4349b43ff839a6d4cbc34e048b`, unchanged during implementation. Initial working tree clean, nothing staged, no unrelated pre-existing changes. Current scope is six modified tracked files and three untracked files listed below; nothing staged. No commit/push requested for this implementation. Inspect `git status --short` when resuming; do not discard changes.

## 4. Root cause

`BillingPrincipalSavedTargetDialog.tsx` stored a singular `source`, displayed a replacing single select, and previewed `[source.id]`. Preview/create API, service, database and target serialization already support arrays of 1–5 sources. This is a real frontend selection/state bottleneck, not a missing database relationship.

## 5. Changed files / ownership

- `client/src/pages/collection/BillingPrincipalSavedTargetDialog.tsx`: replaces the singular-state bottleneck with selected-source array, add/remove list, five-source cap, duplicate prevention, account-change clearing and current-selection preview fence. Complete; client tests, browser and independent review passed. No remaining implementation work.
- `client/src/pages/collection/BillingPrincipalSavedTargetSources.test.ts` (new): focused selection/preview/clearing/frozen-edit regressions to protect the new state and existing edit behavior. Complete, passed; no remaining work.
- `client/src/pages/collection/BillingPrincipalV7Api.test.ts`: multi-source preview/create payload and create/get/list deserialization test to prevent silent first-source collapse. Complete, passed; no remaining work.
- `CODEX_CONTINUATION_HANDOFF_BILLING_OSP_MULTI_SOURCE.md` (new): required scope, architecture, evidence and continuation/final report. Complete; no remaining implementation work.
- `server/services/tests/collection-osp-v7-operations.test.ts`: three tests for full source arrays/duplicate normalization, input bounds/roles and atomic invalid-set propagation/frozen source edits. Complete; full backend regression passed.
- `server/repositories/tests/collection-osp-v7-postgres.integration.test.ts`: six real PostgreSQL subcases with exact example source names and assigned admin `SW.BUKHARI_924`; three-source persisted/read/list/downstream, legacy single source, PK duplicate protection, invalid source rejection, third-association rollback, assignment/RBAC. Complete; regression passed.
- `scripts/lib/billing-osp-multi-source-qa.mjs` (new): real three-source browser fixture, selected list/remove/search/admin clearing/payload/read/reload/immutable edit and downstream RM600/30% => RM180 assertions; dark narrow layout and edit draft preservation. Complete, final browser run passed; no remaining work.
- `scripts/billing-osp-v3-smoke.mjs`: integrates new scenario with OSP QA and isolated multi-source-only mode to make verification repeatable. Syntax/script tests/focused browser passed; no remaining implementation work.
- `scripts/collection-save-access-qa-local.mjs`: adds `--osp-multi-source` to existing guarded disposable DB/browser harness, skipping irrelevant restart fixture in focused mode. Complete, passed; no remaining implementation work.

## 6. Database / migration state

Existing normalized `collection_osp_target_sources` keyed to target revision, with PRIMARY KEY `(target_revision_id, source_import_id)`, revision FK, snapshot composite FK and source-import lookup index (`drizzle/0054_collection_osp_reconciliation_persistence.sql`). Existing create transaction validates the full set and inserts all associations. No new migration/backfill needed, none created or run. Disposable test databases ran the existing migration chain only; no production migration or data changes. Existing source snapshots remain immutable. No remaining DB work.

## 7. Frontend state

Native `#osp-configured-source` is an add-one control; a bounded removable selected list is the actual multi-selection state (no Ctrl/Cmd multi-select gesture needed). Search/pagination do not replace selected options. Changing assigned admin clears create selections and source search/page and reloads current options; edit retains frozen sources and unsaved percentages. Preview covers every selected ID; save disabled while absent/stale/loading/error. Existing styling/dark tokens retained. Actual three-source browser run and 390px dark screenshot passed; no remaining UI issues identified within scope.

## 8. Backend state

Existing contract `sourceImportIds: string[]`, 1–5 configured compatible enabled non-deleted sources, same configured validity within 366 days, bounded 100,000 rows. Existing duplicate convention normalizes duplicates. Active admin required; any source overlapping another admin's active assignment rejects atomically. Superuser-only creation unchanged. Options are currently globally configured sources, not a separate Leader-filtered mapping; do not invent broader/narrower mappings. Reads serialize all source snapshots, direct effective query resolves all source associations. Source editing is not supported, so exact-set source editing is not applicable.

Trace: `BillingPrincipalSavedTargetDialog` -> `collection-billing-principal.ts` preview/create -> `collection-billing-principal-v7-routes.ts` authentication/permission/idempotency -> `collection-osp-v7-operations.ts` -> `collection-osp-source-scope-repository-utils.ts` batch validation + `collection-osp-v7-repository-utils.ts` transaction/persistence/all-source read -> existing `collection-osp-effective-query.ts` all-source resolution. No production API/backend/shared/schema file changed, no new dependency or N+1 query introduced. The PostgreSQL regression explicitly asserts one batch configured-source validation query. Existing create inserts remain bounded by the existing five-source limit.

## 9. Test status

Passed initial focused client run: 20/20, no failures/skips:

`node --import tsx --test client/src/pages/collection/BillingPrincipalSavedTargetSources.test.ts client/src/pages/collection/BillingPrincipalSavedTargetValidation.test.ts client/src/pages/collection/BillingPrincipalV7Api.test.ts`

Backend focused run: 10/10 passed; complete related backend files: 50/50 passed, zero skips, 43.8s (`artifacts/multi-source-backend-regression.log`).

`node --import tsx --test --test-concurrency=1 server/services/tests/collection-osp-v7-operations.test.ts server/repositories/tests/collection-osp-v7-postgres.integration.test.ts server/routes/tests/collection-billing-principal-v7-routes.integration.test.ts`

Disposable fixtures only, `PG_HOST=127.0.0.1`, `PG_PORT=5432`. Real rollback test injected a third-association INSERT failure and confirmed zero residual target/revision/source/snapshot/aging/audit changes. Initial test-only type issues (`.at`, `Error.cause`, inferred empty array) were corrected to the existing ES2020 contract; final typecheck passed. An initial browser assertion waited for an unnecessary account-change options response; it was corrected to await initial edit loading, then assert changing account keeps the loaded baseline/draft. Final fixture rerun passed. No unresolved failures.

- `npm run test:client`: PASS **1,527/1,527**, two batches 1,028 + 499, zero skipped/failed (`artifacts/multi-source-client-tests.log`). Includes the final selection dependency regression; the initial focused 20 tests are a subset, not extra independent test counts.
- `npm run test:scripts`: PASS **384/384**, batches 333 + 51, zero skipped/failed (`artifacts/multi-source-script-tests.log`).
- `node scripts/collection-save-access-qa-local.mjs --osp-multi-source`: PASS, exit 0 (`artifacts/multi-source-browser-final.log`). Actual final fixture: `artifacts/collection-save-access-1788738197143_364931/`; `qa-result.json` exit 0 and `osp-v3-results.json` success true/pageErrors empty. Selected desktop, dark/narrow and reloaded screenshots retained. Guarded disposable database removed on completion.
- `node scripts/collection-save-access-qa-local.mjs --ui-smoke`: PASS, exit 0 (`artifacts/multi-source-ui-smoke.log`). Fixture `artifacts/collection-save-access-1788738254831_d355a4/qa-result.json`: exit 0. Login/navigation/themes, Collection mutations/stale conflict, manual ABORT, existing one-source Billing create plus XLSX/PNG/PDF, receipt, backup restore and logout all pass. Guarded disposable database removed; no production data touched.

Relevant passing non-browser regression total: **1,961 tests** (1,527 client + 384 scripts + 50 backend). This is a relevant regression selection, not a claim that the full `npm test` or every unrelated large performance fixture was rerun.

## 10. Build status

- Lint PASS (`npm run lint`, `artifacts/multi-source-lint.log`).
- Build PASS (`npm run build`, `artifacts/multi-source-build.log`): current production code, CSP hashes verified, zero production source maps. Non-failing Vite plugin-timing advisory only. Release manifest correctly identifies dirty source based on baseline `330336364ea6`.
- Final typecheck PASS (`npm run typecheck`, `artifacts/multi-source-typecheck-final.log`).
- Client/script/relevant backend, real multi-source browser and existing full UI smoke PASS as detailed above.
- `npm run verify:secrets`, `npm run verify:repo-hygiene`, `npm run verify:db-schema-governance`, `npm run verify:bundle-budgets`: PASS (`artifacts/multi-source-repository-checks.log`). Existing governance roadmap entry for audit migration ledger is informational and unchanged.

## 11. Exact next actions

1. Read AGENTS.md; inspect branch/HEAD/diff and preserve all current work.
2. No implementation or required local verification remains. Confirm this completed handoff still matches current code; resume only new requested work or newly observed regressions.
3. Final smoke and final diff audit are recorded below; do not restart finished work merely because the account/session changed.
4. On a later explicit commit/push request, re-check current diff, stage exactly the nine scoped files, use existing secret guards and push the selected branch without force. Never commit `.env`, credentials, build output or local artifacts.
5. Deploy through the existing release process only when separately authorized. No task-specific migration/backfill/repair required. Build from the final committed revision so its manifest no longer represents dirty source.
6. On another account, verify actual branch/HEAD and files against this handoff. Do not assume an old handoff overrides newer work. Node PATH on this Windows workspace: `C:\Program Files\nodejs`.

## 12. Do not repeat

No need to redesign backend or create another relationship table. Do not restart the prior completed retrospective-payment task. Root cause, actual three-source persistence/rollback, complete client/script/relevant backend tests, build and dark/narrow browser verification are complete. Do not repeat those investigations without a new change or contradictory evidence. Rerun relevant final checks if another session changes the files before declaring its own completion.

## 13. Scope lock

Do not fix unrelated issues. Preserve Billing formulas, dates/System As Of/calendar, Collection, Table B privacy, RBAC and existing source eligibility. Keep existing five-source/same-validity limits.

## 14. Completion checklist

- [x] Root cause identified.
- [x] Configured Saved Source is a true multi-select.
- [x] Multiple selected source IDs are sent by frontend.
- [x] Backend accepts an array/list.
- [x] Backend validates every selected source.
- [x] Leader/source eligibility remains enforced under the existing active-admin/assignment contract.
- [x] Target persists multiple sources correctly.
- [x] Create is atomic.
- [x] Duplicate association is prevented.
- [x] Existing single-source targets remain compatible.
- [x] Target read paths return all sources.
- [x] Existing edit path supports exact set replacement if applicable: N/A, existing sources are immutable and remain so.
- [x] Directly affected downstream source resolver does not collapse to first source.
- [x] Authorization remains unchanged.
- [x] Billing formulas remain unchanged.
- [x] Date behavior remains unchanged.
- [x] Table B privacy remains unchanged.
- [x] Focused tests added/updated.
- [x] Relevant regression tests pass.
- [x] Typecheck passes.
- [x] Lint passes where applicable.
- [x] Build passes.
- [x] Migration requirement verified: no migration/backfill needed.
- [x] Final diff reviewed.
- [x] No unrelated changes overwritten.
- [x] No unrelated issue intentionally fixed.

## 15. Required test matrix / acceptance evidence

| Required test | Current authoritative evidence |
| --- | --- |
| 1. Existing single source A | PostgreSQL single-target create/read/overview; existing full UI smoke Create Target still passes. |
| 2. Multiple sources A+B+C | Actual PostgreSQL test and real browser create assert every persisted relationship and all returned IDs. |
| 3. Duplicate A+A | Client excludes already selected options; service normalizes under existing convention; PostgreSQL primary-key insertion fails with 23505. |
| 4. A+invalid source | Missing/disabled/incompatible/deleted/different-validity cases reject complete set with unchanged row/audit counts; injected third INSERT rolls back first two. |
| 5. Ineligible source for Leader | Existing other-admin overlapping source assignment is rejected; invalid/non-admin/banned assignment is rejected. No new mapping assumed. |
| 6. Historical single target | Fixture existing single source with legacy calculation version still reads and resolves its own baseline/closure. |
| 7. Read target all sources | Real create/get/list/overview reporting-window metadata and browser reload/edit snapshots retain all three. |
| 8. Form payload all IDs | Browser inspects actual POST body; API wrapper unit test checks preview/create body arrays. |
| 9. Leader/account change | Browser selects two, switches assigned admin, sees list cleared/Save disabled, then reselects; frontend also resets search/page and reloads options. |
| 10. Existing source edit | Not applicable: no source editing existed. Frozen display includes all sources; backend rejects attempted source replacement. Unsaved percentage survives changing assignment. |
| 11. Authorization | Service rejects admin/manager/user create before storage; PostgreSQL checks active superuser and assignment/read restrictions; existing route regressions pass. |
| 12. Direct downstream resolution | Real PostgreSQL three unique source accounts total RM24,000 and three closed accounts; browser assigned-admin overview resolves RM600 and unchanged 30% => RM180. |

Mandatory example: PostgreSQL fixture uses the exact assigned-admin username `SW.BUKHARI_924` and all three specified display names. Browser uses those same three source names with an existing isolated QA admin. All dates come from explicit identical configured validity, not filenames. Acceptance items 1–12 are covered by the matrix; items 13–18 (formula/System As Of/calendar/Collection/roles/unrelated behavior unchanged) are proven by the production diff scope plus relevant regressions. The only modified production file is the Create/Edit Target dialog. Dark 390px selected-list screenshot was visually inspected and width assertions pass.

## 16. Final scope audit / deployment notes

Nine scoped paths inventoried in section 5: one production dialog, four automated test files, three browser QA scripts and this handoff. Six tracked modifications and three new files. No staged files, unrelated changes, secrets, dependencies, migrations, backend/API/schema/formula/date/Collection/Table B production modifications, debug code or broad reformatting. `git diff --check` passes; LF-to-CRLF Git notices are normal workspace line-ending notices.

Independent review found one task-introduced edit-draft reset from a too-broad effect dependency; it was corrected before final build, and final real-browser regression proves preservation. No outstanding blockers. Local test artifacts remain ignored. No GitHub CI result, production deployment or production migration is claimed. Existing release-readiness/deployment process should run on the eventual authorized commit; this task does not bypass it.

## Out-of-scope findings

No unrelated defect intentionally fixed. Existing global options versus Leader terminology and existing same-validity/five-source limits are documented above, not redesigned. Vite timing and database governance roadmap notices are unchanged informational output, not task failures.

## 17. Final verdict

COMPLETE
