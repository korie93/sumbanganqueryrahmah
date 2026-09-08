# Billing Principal (OSP) daily System Calendar movement - completion handoff

Status: **COMPLETE**, verified 2026-09-09. No feature work remains. This document preserves the implementation and verification state for a future account/session. No commit, push or deployment has been authorized/performed for this feature.

Specification: `C:/Users/Administrator/Downloads/CODEX_GPT_6_ASTRA_ULTRA_BILLING_OSP_DAILY_SYSTEM_CALENDAR_MOVEMENT_EXPORT.md`, read in full and explicitly approved by the user.

## 1. Permanent goal

Add correct, auditable daily D3/D4/D5/D6 Result % and OSP Closed plus monetary-weighted TOTAL to Billing Principal (OSP) System Calendar and existing exports. Preserve canonical contribution/effective-date semantics, cumulative Table A, target-minus-closed balance, multiple source validity, System As Of, assignment and private Table B ownership. Complete backend, responsive UI, exports, regression/visual/accessibility/performance checks, build and final scope audit. This goal is achieved; do not recreate it or repeat implementation.

## 2. Original requirement and scope lock

Daily aging result = qualifying closed on that date / shared Target OSP x 100. TOTAL = sum(closed) / sum(shared targets) x 100, never an average. Desktop and mobile360-430 must show all four rows, TOTAL and usable drilldown, with quiet zero days, readable values and coherent light/dark themes. Existing CSV/XLSX/PNG/PDF must contain the canonical values.

No changes to Table A cumulative denominator (TT OSP), source validity/System As Of, ABORT/CP/manual eligibility, duplicate rules, private Table B, unrelated pages, dependencies or schema.

## 3. Repository state

- Workspace: `C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah`; Windows PowerShell, Node24, PostgreSQL17 and local Chrome.
- Branch `main`, HEAD `fd98d068abe71dcca83ccaa709804411cbb07150`. The prior smoke transport fix was already committed/pushed before this feature.
- Started clean. Final feature state: 16 modified tracked and seven new untracked files, all task-owned; nothing staged. Actual `git status --short` remains authoritative.
- No unrelated changes were discarded. No secrets or environment files added to the diff.
- No live test/server handles remain. All final browser harnesses stopped their managed servers and removed only their generated disposable databases.
- Add `C:/Program Files/nodejs` to PATH if needed. Never print .env/credentials or run fixture writes against the application/production database.

## 4. Authoritative architecture

Existing `osp_effective_accounts` CTE remains unchanged: target assignment/version predicates, governed selected source windows, factual ABORT CP plus active verified manual settlement, receipt/account-cycle deduplication and canonical effective closure date.

The calendar query now groups that CTE by effective closure date AND aging. The repository attaches `dailyMovement: { rows: D3..D6, all: ALL }` to every valid day through the new exact-money helper. Each row carries targetOsp, ospClosed, resultPercentage and closedAccountCount. The legacy flat fields and their cumulative aging filter remain intact; daily rows always include all four buckets.

Calendar uses the established full current reporting validity independently of historical Table A As Of. Existing current effective-state semantics can attribute a later valid manual confirmation to an earlier threshold date. Daily sums reconcile to period-end Table A under the same effective state, not an invented immutable event ledger.

Collection daily/monthly rollups lack the necessary Billing OSP semantics and were not reused. At most 366 x 4 aggregate rows; no raw-account client loading, per-day request or N+1 query.

## 5. Formulas and precision

- Daily aging: exact daily closed / shared aging Target OSP x 100.
- Daily TOTAL: summed closed / summed targets x 100.
- Existing BigInt cents and four-decimal percentage helpers; presentation rounding only after calculation.
- Zero target uses established 0.0000 convention, displayed0.00%; legitimate closed money or zero-OSP account counts remain visible.
- Acceptance RM300/RM30,000 =1.00%; unequal-target fixture yields1.8333%, not2.5000% arithmetic average.
- Cumulative Table A remains closed / TT OSP x100; balance remains Target OSP - cumulative closed.
- CSV exact decimals; numeric OOXML stores exact decimal strings. Excel itself has a15-significant-digit calculation limit, explicitly retained in metadata; use CSV for exact large-number interchange.

## 6. Files changed and status

All entries are complete and verified. Relative client names use their listed directories.

| File | Purpose / change |
| --- | --- |
| `server/lib/collection-osp-daily-movement.ts` (new) | Exact shared-target daily aging/TOTAL aggregation, quiet dates, zero denominator handling. |
| `server/lib/tests/collection-osp-daily-movement.test.ts` (new) | Acceptance, weighted totals, fractional percentages, exact large money, valid/effective dates, zero values/counts, missing configuration. |
| `server/storage-postgres-collection-types.ts` | Shared daily movement type and required calendar property. |
| `server/repositories/collection-osp-effective-query.ts` | Group canonical eligible closures by effective date and aging. |
| `server/repositories/collection-osp-v7-repository-utils.ts` | Attach daily metrics and sum grouped movements for unchanged cumulative series. |
| `server/repositories/tests/collection-osp-effective-query.postgres.test.ts` | Four real PostgreSQL tests including daily/period-end reconciliation, multi-source/dedupe/CP/backdated behavior, filtering, and denied access. |
| `server/services/collection/collection-osp-v7-operations.ts` | Daily CSV/XLSX section, numeric formatting, explanatory metadata, fail-closed validation of complete daily buckets. |
| `server/services/tests/collection-osp-v7-operations.test.ts` | Export content, weighted values, numeric XML/exact CSV decimals, missing/repeated bucket rejection, freshness/privacy regression. |
| `client/src/lib/api/collection-billing-principal.ts` | Required daily API types/schema with four ordered distinct buckets. |
| `client/src/pages/collection/BillingPrincipalV7Api.test.ts` | Valid daily contract and rejection of absent/repeated bucket data. |
| `client/src/pages/collection/BillingPrincipalCalendarDayCard.tsx` (new) | Responsive daily aging rows, prominent TOTAL, separate cumulative footer, semantic accessible button. |
| `client/src/pages/collection/BillingPrincipalCalendarDayCard.test.ts` (new) | Canonical daily text/cumulative distinction, quiet days, semantic states. |
| `client/src/pages/collection/BillingPrincipalInsights.tsx` | Responsive chronological one/two/three-column daily cards, formula context; retained month navigation, drilldown, export authorization. |
| `client/src/pages/collection/billing-principal-v7-test-fixture.ts` | Complete daily movement fixture for API/render/export tests. |
| `client/src/pages/collection/billing-principal-visual-export.ts` | Dedicated eleven-column daily PNG/PDF report section, wrapped metadata/cells, numeric alignment, larger daily typography and emphasized TOTAL. |
| `client/src/pages/collection/billing-principal-visual-export.test.ts` | Canonical daily export fields, pagination, alignment and shared report behavior. |
| `scripts/billing-osp-v3-smoke.mjs` | Real daily API/export assertions, no-refetch month navigation, desktop/mobile screenshots, daily render stress invocation. |
| `scripts/lib/billing-osp-daily-render-qa.mjs` (new) | Bounded disposable render-only stress for four active aging buckets, huge exact money, long metadata, PNG/PDF cell bounds and scoped axe checks; final execution passed. |
| `scripts/lib/ui-operational-contract-matrix.mjs` | Updated calendar readiness contract for the new responsive presentation. |
| `scripts/tests/ui-operational-contract-matrix.test.mjs` | Matching contract expectations. |
| `tests/visual/billing-readiness.spec.ts` | Updated calendar readiness assertions for daily movement layout. |
| `CODEX_CONTINUATION_HANDOFF_BILLING_OSP_DAILY_SYSTEM_CALENDAR_MOVEMENT.md` (new) | This continuation state and remaining acceptance work. |
| `docs/BILLING_OSP_DAILY_SYSTEM_CALENDAR_MOVEMENT_REPORT.md` (new) | Complete nineteen-section evidence report and acceptance matrix. |

## 7. Database / migration / deployment

No migration, new table/index/rollup, dependency change or historical data rewrite. None applied. Frontend and backend must be deployed together because the client requires the new daily API property. No deployment/commit/push performed.

## 8. UI status

Complete: responsive chronological one/two/three-column cards; aligned daily aging percentage/money and emphasized TOTAL; target/As Of/validity context; separate cumulative footer/aging selector; zero/activity/selected/As Of states; semantic buttons/focus; existing month controls and account drilldown retained.

Actual light/dark360/390/430/1440 checks pass. Large amounts retain every digit by wrapping at very narrow widths. Long source/target metadata does not cause page overflow. Final screenshots directly inspected; no mobile screenshot is used as the export layout.

## 9. Export status

Complete: CSV/XLSX and PNG/PDF add the eleven-column system daily aging section with canonical values. Existing cumulative and explicitly caller-private combined report sections retained; the added daily section contains only shared system metrics. Fresh actor/assignment/version/source-validity guards remain in place.

XLSX numeric cells, useful widths/formats and autofilter; no unsupported freeze-header/dependency added. PNG/PDF dedicated report canvas uses larger daily typography, deliberate two-line headers, bold TOTAL, wrapped metadata/cells, twelve rows per page and repeated headers. All366 dates fit within67 combined report pages. Final actual eleven-page PDF opened in Chrome on page9 and visually inspected; screenshot `artifacts/osp-daily-pdf-viewer.png`.

## 10. Tests and results

All final commands exited0 unless they are separately noted as historical failed QA development attempts.

| Check | Final result | Evidence |
| --- | --- | --- |
| Full client suite | 1,535 pass, 0 fail/skip (1,029+506 batches) | `artifacts/osp-daily-client-all.log` |
| Latest focused card/API/visual client | 20 pass, 0 fail/skip | `artifacts/osp-daily-final-client-focused.log` |
| Full services | 581 pass, 0 fail/skip | `artifacts/osp-daily-final-test-services.log` |
| Full routes | 469 pass, 0 fail/skip | `artifacts/osp-daily-final-test-routes.log` |
| Full scripts | 396 pass, 0 fail/skip (345+51) | `artifacts/osp-daily-final-test-scripts.log` |
| Expanded daily/helper/PG/service/calendar/source regression | 49 pass, 0 fail/skip, including four real PostgreSQL tests | `artifacts/osp-daily-server-regression.log` |
| 100,000-account PG performance | 1 pass, no skip; calendar7queries/2.327s, overview12/2.250s, detail7/2.724s, export18/3.299s; retained heap0.0MiB | `artifacts/osp-daily-performance.log` |
| Chromium readiness selector cases | 10 pass | `artifacts/osp-daily-final-readiness.log` |
| Final full OSP browser + actual restart | Pass, including real actor/export/reassignment/backdating/mixed-source/resource tests and new stress | `artifacts/collection-save-access-1788908886235_c4c8b6/qa-result.json` |
| Full UI smoke | Pass incl receipt/save, manual ABORT, Billing/export, backup/restore and logout | `artifacts/collection-save-access-1788909151170_4f5d2b/qa-result.json` |
| Full visual contract | Pass | `artifacts/collection-save-access-1788909212300_0f7585/qa-result.json` |
| Public/authenticated a11y contract | Pass | `artifacts/collection-save-access-1788909256747_4233f3/qa-result.json` |

Command spellings and detailed acceptance evidence are in [the final report](docs/BILLING_OSP_DAILY_SYSTEM_CALENDAR_MOVEMENT_REPORT.md). Focused/broad suites overlap; counts are not unique coverage.

Final OSP stress evidence: `artifacts/collection-save-access-1788908886235_c4c8b6/daily-stress-evidence.json`: four active aging buckets, huge exact money, long metadata, sixteen metadata/card screenshots, actual PNG/PDF downloads, six daily canvases/2,030 text calls, zero bounds violations, zero serious/critical axe violations in light/dark390. The fixture first fetches real authorized GETs and clones only render data; identity/version/validity/private values remain protected. Hooks are restored and real data reloaded before continuing.

## 11. Build / final audit

Final `npm run typecheck`, `npm run lint`, `npm run build`, `npm run verify:bundle-budgets` pass. Build `sqr-1.0.0-fd98d068abe7-20260908T225224Z` (dirty source); production sourcemap gate passes with zero maps. Logs: `artifacts/osp-daily-final-{typecheck,lint,build,verify-bundle-budgets}.log`.

Production code did not change after this successful build. Subsequent changes are QA robustness/documentation only. Changed-file secret guard, repository hygiene and `git diff --check` pass. Root and independent read-only review found no actionable money/date/privacy/scope defect.

## 12. Exact next actions

No remaining implementation work. Await a new explicit request before commit/push or deployment. If asked to publish: inspect current status, preserve any new user work, stage only intended feature files, run the staged secret guard, commit and push the user's branch, then report actual results. Do not include .env or ignored QA artifacts. Remote CI has not run on this uncommitted feature and is not claimed green.

## 13. Do not repeat / resolved test issues

- Do not rerun implementation, full client or100k performance merely because an account/session changes.
- A test fixture mistakenly inserted two factual ABORTs in one cycle. The DB correctly rejected it; the later event is now legitimate CP. Do not loosen the sole-ABORT constraint.
- New tests were adjusted to the project's ES library/XLSX declarations; no compiler settings changed.
- Stress axe injection uses the automation runtime, not a DOM script sink, so CSP/Trusted Types remain enabled.
- Additional stress exports wait for the existing four/user/minute window; no rate-limit bypass.
- Stress route handlers drain before unregistration. Removing interception while a response was in flight caused an already-handled cleanup error; resolved and final suite passes.
- SQL identity order differs from fixture insertion order. Smoke now checks full PII for all12 identities across both10/2 pages, not an assumption that fixture0 is on page1.
- Earlier failing QA attempts are superseded by the final clean run above. All their generated databases were removed. Do not diagnose them as current application failures.

## 14. Definition of done

- [x] Daily D3-D6 Result % and OSP Closed; exact weighted TOTAL and zero-safe handling.
- [x] Canonical effective date; ABORT/manual/CP/source/cycle/duplicate semantics preserved.
- [x] Multiple governed source windows, Calendar validity and System As Of unchanged.
- [x] Daily/period-end reconciliation and unchanged Table A cumulative denominator/balance.
- [x] Desktop/mobile360-430, all four active, zeros, long values/names and light/dark verified.
- [x] Semantic buttons, focus states, month navigation and existing daily drilldown retained.
- [x] All existing export formats carry canonical daily values; numeric/exact CSV/XLSX, pagination and actual PNG/PDF visually verified.
- [x] Actor assignment, private Table B and fresh export authorization/version/validity protected.
- [x] Focused/unit/integration/regression/performance, browser/restart, visual and a11y pass.
- [x] Typecheck/lint/build/bundle, migration assessment, final diff and secret/hygiene checks pass.
- [x] No unrelated work overwritten; no dependency/migration/deploy/commit/push.
- [x] All nineteen final report sections and twenty acceptance items documented.

## 15. Final verdict

COMPLETE
