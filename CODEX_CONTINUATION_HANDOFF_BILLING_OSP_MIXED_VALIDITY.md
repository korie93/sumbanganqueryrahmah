# Billing OSP mixed source validity — continuation and verification

Status: **COMPLETE**, 2026-09-07. Locally implemented and verified; not committed, pushed or deployed. Actual repository state is authoritative.

## Goal and user requirement

Fix Billing Principal OSP Create Target so multiple eligible configured Saved sources with different configured validity periods can preview shared Table A, set targets, save atomically and reload successfully. Determine and implement coherent multi-source reporting bounds while respecting each source's own validity and existing formula, authorization, source assignment, private Table B, Collection and single-source behavior. Verify focused client/service/PostgreSQL/browser regressions, typecheck/lint/build and final scope audit; maintain repository continuation handoff until complete.

The user's current request explicitly removes the previous same-validity limitation: adding File B after File A must not remove Table A and block save merely because their configured dates differ. This supersedes the same-validity scope lock in the completed earlier multi-source handoff. No commit/push or production deployment has been requested for this new change.

## Git baseline and scope

Initial clean `main` at `07bcc6b09b65f9cb65c53b143de53ea43bb96e80`. HEAD unchanged; six modified tracked files, two new files listed below, nothing staged. No unrelated pre-existing changes. Preserve all subsequent work. Only change source-period aggregation, its explanatory UI copy and directly relevant regressions. No schema/migration/backfill/dependency changes are needed. Database schema, formulas, Collection, RBAC and private Table B production files remain unchanged.

## Root cause and behavior

`loadCollectionOspConfiguredSourceScope` required every source to have identical `valid_from` and `valid_to`. Both preview and create call it, so selecting a second otherwise eligible source caused the exact reported error before rendering the aggregate baseline.

Use the earliest source start and latest source end, matching the existing live reporting-window union in `collection-osp-reporting-window.ts` and effective SQL. Validate every source's actual ordered business dates. Keep 1–5 sources, 100,000 rows and the existing maximum 366 inclusive days for the combined reporting range. Distinct, overlapping and nested valid periods are allowed. Each source retains its own validity; automatic payments and manual evidence remain bounded by that source's dates in unchanged effective SQL. Do not widen individual source configs or alter factual ABORT/CP/canonical-account formulas.

## Files changed

- `server/repositories/collection-osp-source-scope-repository-utils.ts`: strict date validation for each source, min/max union instead of equality, explicit combined-range cap message; existing shared helper fixes both preview/create atomically.
- `client/src/pages/collection/BillingPrincipalSavedTargetDialog.tsx`: replace obsolete identical-validity instruction with different-period support and combined-range/individual-payment validity explanation. Existing multi-selection/state/save fencing remains unchanged.
- `server/repositories/tests/collection-osp-source-validity.test.ts` (new): equal/overlapping/nested/disjoint/ordering/single cases, exact 366 versus 367 days including leap year, invalid individual dates and source/row bounds.
- `server/repositories/tests/collection-osp-v7-postgres.integration.test.ts`: real initial mixed-period 3-source preview/create/read/list/calendar/As Of/own-source payment exclusion and combined-range rejection; fourth source with repeated account/cycle proves unchanged canonical deduplication; replace obsolete same-validity rejection expectations with overlong-union checks.
- `client/src/pages/collection/BillingPrincipalSavedTargetSources.test.ts`: mixed-period selection/preview and corrected UI copy regressions.
- `scripts/lib/billing-osp-multi-source-qa.mjs`: existing real browser flow now uses Sep1–30, Aug12–Sep10 and Sep15–Oct5; asserts selected union on each add/remove and Aug12–Oct5 persisted union with individual dates, keeping existing save/reload/TT600/30% target180/dark-narrow/edit-draft checks. Final additional assertion checks entered 25% survives File B and derives RM75 from combined TT300.
- `CODEX_CONTINUATION_HANDOFF_BILLING_OSP_MULTI_SOURCE.md`: two-line historical pointer to this newly authorized follow-up; prevents old same-validity scope lock being mistaken for the latest requirement.
- `CODEX_CONTINUATION_HANDOFF_BILLING_OSP_MIXED_VALIDITY.md` (new): this continuation/evidence/scope report.

## Evidence so far

- RED reproduction: `artifacts/mixed-validity-reproduction.log`, real PostgreSQL initial second-source preview fails with exact old `Selected sources must have the same configured validity, within 366 days.`
- GREEN same targeted test: `artifacts/mixed-validity-focused.log`, 1/1 pass, no skips; final expanded duplicate-account version also passed (`artifacts/mixed-validity-focused-final.log`). Actual 3 source relationships persist/reload with union Aug12–Sep10; distinct accounts TT24,000/target12,000; excluded historical out-of-own-window records contribute zero; after removing those isolated historical test records, valid payments produce three closures on correct dates. Calendar has all 30 days, including a zero gap day. Earlier As Of contains only eligible evidence. Four source associations with a repeated trusted account still yield three canonical accounts and TT24,000, not TT32,000.
- Isolated fixture corrections: actual Collection authorization correctly rejected out-of-source writes, so test now proves that rejection then simulates historic records under temporarily expanded fixture configs before restoring own bounds. Historical invalid closure records are removed before the independent valid-payment phase so existing factual ABORT semantics are not misrepresented. Calendar assertion uses the existing `systemOspClosedToday` field. No production rule weakened.
- Unit/client focused run: 7/7 pass, no skips. `node --import tsx --test server/repositories/tests/collection-osp-source-validity.test.ts client/src/pages/collection/BillingPrincipalSavedTargetSources.test.ts`.
- Actual mixed-period browser PASS, exit 0 (`artifacts/mixed-validity-browser.log`), fixture `artifacts/collection-save-access-1788743929495_3435d8/qa-result.json`, `osp-v3-results.json` success true with empty pageErrors. Three different periods, preview on each add/remove, entered shared targets, real save/read/list/reload/edit and stable assignment behavior pass. Desktop screenshot visually inspected: all individual dates and combined Aug12–Oct5 plus TT600/30% => RM180 visible. Narrow dark layout assertions pass. Final extra File-A-percentage/File-B-addition assertion also PASS (`artifacts/mixed-validity-browser-final.log`): 25% entered under File A is retained under A+B and renders Target OSP RM75 from combined TT300. Final fixture `artifacts/collection-save-access-1788744110245_394f9f/qa-result.json` exit 0, `osp-v3-results.json` success true/pageErrors empty; guarded DB removed after completion.

## Verification commands and results

All commands run from the workspace; all database mutations confined to generated guarded local fixtures. No credentials/artifacts/build outputs are part of the diff.

- `npm run test:client`: PASS **1,528/1,528** (1,029 + 499), no skips/failures; `artifacts/mixed-validity-client-tests.log`.
- `npm run test:scripts`: PASS **384/384** (333 + 51), no skips/failures; `artifacts/mixed-validity-script-tests.log`.
- `node --import tsx --test --test-concurrency=1 server/repositories/tests/collection-osp-source-validity.test.ts server/repositories/tests/collection-osp-source-precision.test.ts server/repositories/tests/collection-osp-v7-postgres.integration.test.ts server/repositories/tests/collection-osp-effective-query.postgres.test.ts server/services/tests/collection-osp-v7-operations.test.ts server/routes/tests/collection-billing-principal-v7-routes.integration.test.ts`: PASS **58/58**, no skips/failures; final expanded-test repetition also PASS (`artifacts/mixed-validity-backend-final.log`, 112.1 seconds under concurrent verification).
- `npm run typecheck`: PASS final expanded test version, `artifacts/mixed-validity-typecheck-final.log`.
- `npm run lint`: PASS, `artifacts/mixed-validity-lint.log`.
- `npm run build`: PASS, `artifacts/mixed-validity-build.log`; CSP verification and zero production source maps pass. Normal non-failing Vite plugin-timing advisory only. Manifest correctly reports dirty source based on baseline `07bcc6b09b65`.
- `node scripts/collection-save-access-qa-local.mjs --osp-multi-source`: PASS final extra draft assertion run as above.
- `node scripts/collection-save-access-qa-local.mjs --ui-smoke`: PASS exit 0, `artifacts/mixed-validity-ui-smoke.log`; fixture `artifacts/collection-save-access-1788744000718_16c692/qa-result.json` confirms success. Full login/navigation/themes/Collection mutation/manual ABORT/existing single-source Billing+XLSX/PNG/PDF/receipt/backup restore/logout flow passes. Guarded fixture DB removed; artifacts retained.
- `node scripts/verify-secret-scan.mjs`, `node scripts/verify-repo-hygiene.mjs`, `node scripts/verify-db-schema-governance.mjs`, `node scripts/verify-client-bundle-budgets.mjs`: PASS (`artifacts/mixed-validity-repository-checks.log`). Existing migration-ledger roadmap message is informational, not a new failure.
- `git diff --check` and browser `node --check` PASS. Existing CRLF normalization notices are not errors.

Relevant regression total is **1,970** non-browser tests (1,528 + 384 + 58); focused subset repetitions are not counted again. This is not a claim that every unrelated test or large 100k performance fixture was rerun.

## Continuation / exact next actions

1. Inspect actual git state and preserve edits; do not restart finished investigation.
2. No implementation or required local verification remains; the expanded backend and final browser runs both completed successfully. Do not restart these investigations merely because the account changed.
3. If a later session changes relevant code, rerun the matching tests/build and inspect its own final results. This handoff cannot override newer actual repository state.
4. On a later explicit commit/push request, inspect and stage exactly these eight paths, use existing secret guards and normal non-force push. Build the eventual authorized commit for an accurate release manifest and run the existing release process; no task-specific migration or production data repair is required.
5. Commit/push/deploy only on a separate explicit request. Use this handoff for account/session continuation; old completed multi-source handoff is historical and does not override this new requirement.

Environment: PowerShell, add `C:\Program Files\nodejs` to PATH. For PostgreSQL tests set `PG_HOST=127.0.0.1`, `PG_PORT=5432`; credentials loaded internally by existing fixtures, never print `.env`. Host is memory-constrained: no parallel large build/typecheck/100k fixture. Subagents hit account usage limits; root continued locally and their work did not modify files. Do not assume unavailable agents are still running.

## Checklist

- [x] Exact error reproduced before production change.
- [x] Each source validated and bounded union derived for preview and create.
- [x] Mixed/overlap/disjoint sources persist/reload and report all sources.
- [x] Existing own-source payment validity enforced.
- [x] UI instructions match supported behavior.
- [x] Same-validity/single-source unit behavior preserved.
- [x] Relevant regression suite and final expanded backend repetition pass.
- [x] Final typecheck/lint/build pass.
- [x] Actual mixed-period browser, existing single-source smoke and final additional draft assertion pass.
- [x] Final scope/security audit and handoff complete.

## Completion evidence and final scope audit

| Requirement / invariant | Final evidence |
| --- | --- |
| Add File B with different dates without losing shared targets | Real browser File A Sep1–30 + B Aug12–Sep10 retains entered 25%, renders TT300/Target75; C Sep15–Oct5 expands union and TT600/Target180 saves. |
| All selected sources persist and reload | Real PostgreSQL + browser POST/create/detail/list/reload/edit assertions retain all three IDs and individual reporting windows. Existing normalized relationship/transaction reused, no migration. |
| Combined period is coherent | Unit equal/overlap/nested/disjoint/order cases; PG Aug12–Sep10 calendar 30 days including zero gap day; browser Aug12–Oct5 persisted bounds. Strict actual dates validated per source; exactly 366 inclusive days passes, 367 fails even for individually short sources. |
| Every payment respects its own source | New out-of-source writes remain rejected; historical out-of-own-window evidence contributes zero even inside union. Valid dates give three closures on their correct dates; earlier As Of only contains eligible evidence. Existing manual-source bounds unchanged and effective-query/manual regressions pass. |
| No altered formulas / duplicate-account inflation | Four differently configured source associations with a repeated account remain three canonical accounts TT24,000; target percentages and factual ABORT/CP/POOL logic unchanged. |
| Security and atomicity | Existing batch enabled/compatible/non-deleted source validation, active admin/superuser and cross-admin source locks/predicates unchanged; full relevant PG/service/routes tests pass, including injected third-association rollback, invalid-set rejection, duplicate PK and private-owner/IDOR checks. |
| Single-source / existing reports remain usable | Single/equal date unit cases and existing real UI smoke create/Billing exports/manual ABORT/Collection receipt/backup restore/logout all pass; private and historical repository regressions pass. |
| Quality and continuation | Typecheck/lint/build, client/script/backend tests, repository security/schema/bundle checks and final diff-check pass. This handoff lists exact files, environment, results and later authorized steps. |

Final diff: eight paths, two production files (one small backend validator/union change and two UI-copy changes), three test files, one browser fixture script and two handoff documents. No Collection, formulas, effective-query, reporting-window resolver, private-table service, routes/RBAC, database schema, dependency, global CSS or unrelated production file modified. No unresolved test failures. No unrelated work overwritten, secrets or generated artifacts included. Search confirms no production same-validity equality requirement remains in this create path. Earlier handoff's limitation is explicitly superseded, not silently reused.

Residual limits: at most five eligible files, aggregate at most 100,000 rows and combined calendar range at most 366 inclusive days remain explicit. This task removes identical-date requirements, not those existing resource bounds. Existing missing-config legacy fallback and immutable source editing behavior are unchanged. No claim of remote CI success or production deployment is made.

No production deployment or migration performed. No unrelated bug intentionally fixed.

Final verdict: COMPLETE.
