# Billing Principal (OSP): daily System Calendar movement

> Historical implementation report. Its Target OSP-based daily formula and acceptance values are superseded by the TT OSP correction tracked in [the TT OSP handoff](../CODEX_CONTINUATION_HANDOFF_BILLING_OSP_TT_OSP_DAILY_MOVEMENT_FORMULA.md). The current daily denominator is TT OSP; Target OSP remains the basis for target achievement and Balance OSP.

Verification date: 2026-09-09. Scope: the approved daily calendar and existing exports specification. Source baseline: `main` at `fd98d068abe71dcca83ccaa709804411cbb07150`; feature changes are uncommitted. Implementation and local verification are complete.

## 1. Architecture / root design

One authoritative path supplies both screen and export:

`governed source snapshots + eligible payments/manual settlement -> osp_effective_accounts -> grouped effective date/aging -> exact dailyMovement -> API / UI / exports`.

The existing effective-account SQL is unchanged. The calendar query groups its contributions by date and aging, instead of date alone. A small money-safe helper adds complete D3-D6 rows and weighted ALL to each valid date. Existing cumulative fields remain available. Raw account data is not fetched by the browser to calculate daily results.

## 2. Daily Result formula

For each aging: `daily qualifying OSP Closed / shared Target OSP x 100`. RM300 / RM30,000 returns `1.0000` in the API and displays `1.00%`. Existing BigInt cents and four-decimal percentage helpers calculate before presentation rounding. Zero denominators use the established `0.0000` convention; legitimate closed amounts/account counts are not discarded.

## 3. TOTAL weighted formula

`sum(D3-D6 daily OSP Closed) / sum(D3-D6 shared Target OSP) x 100`. Percentages are never averaged. Unequal targets of RM30,000/15,000/10,000/5,000 with closed RM300/300/300/200 yield **1.8333%**, not the arithmetic average **2.5000%**. Individual and summed money remain exact beyond JavaScript's safe integer range.

## 4. Effective date logic

Daily rows use canonical `effective_closure_date`, not insertion/update timestamps, current date or browser date. Existing current effective-state semantics remain: valid later manual verification may confirm an earlier qualifying threshold date. This is not an immutable event ledger. The calendar retains the full current configured reporting domain independently of historical Table A System As Of. Integration tests reconcile those semantics with period-end Table A and exact-day detail.

## 5. Eligibility / deduplication preservation

Unchanged canonical SQL retains factual ABORT CP, active verified manual settlement, CP exclusion, logical account/cycle identity, receipt duplicate exclusion, selected-source evidence and individual validity windows. Multiple sources are not collapsed to the first. The PostgreSQL suite compares SQL with the existing BigInt reference reconciliation over manual, nickname, source and effective-date boundaries. Later CP payments in another selected source do not add a second closure. The database's sole factual ABORT-per-cycle constraint remains intact.

## 6. Backend / SQL / rollups

The day query now returns `date`, `aging_bucket`, summed OSP and account count. Maximum populated aggregates are 366 x 4. The repository attaches required `dailyMovement.rows` and `dailyMovement.all`; legacy cumulative aging filtering remains separate and cannot remove daily D4-D6 rows. Overview/Table A cumulative formulas and balance calculations were not changed.

No new table, index, migration or cache is needed. Existing Collection daily/monthly rollups lack the complete Billing OSP eligibility model and were not misused. The 100,000-account fixture passed with 7 calendar statements (2.327s), 12 overview statements (2.250s), 7 detail statements (2.724s), and 18 export statements (3.299s). Query counts remain bounded; repeated detail reads retained 0.0 MiB after explicit GC. These local fixture timings are not a production SLA. The separate instrumented EXPLAIN took 50.9s.

## 7. System Calendar UI

The tiny seven-column grid is replaced only within System Calendar by chronological day cards: date, aligned D3-D6 daily percentage/closed amounts, emphasized TOTAL, quieter zero days and a separate cumulative footer. Shared target name, System As Of and reporting validity remain visible. Formula help distinguishes daily/shared-target percentages from cumulative/TT-OSP percentages. Previous/next month and the month input are retained; month navigation does not refetch each date. The cumulative-aging selector is explicitly labeled. Existing date drilldown and account pagination are retained.

## 8. Mobile / accessibility

Cards use one column on narrow screens, two at medium widths and three on desktop. Currency is text with tabular alignment and safe wrapping. Existing design tokens support light/dark themes. Day controls remain native buttons with accessible date/count/amount names, focus rings, selected state and System As Of state; activity is not conveyed by color alone. Actual browser checks passed at 360/390/430/1440 CSS px in both themes, including all-four-active large values, long metadata and scoped axe checks (section 14).

## 9. Exports

All existing formats are retained: CSV API, XLSX UI/API, and browser PNG/PDF. A separate system daily section contains eleven columns: date plus daily percentage/OSP Closed pairs for D3, D4, D5, D6 and TOTAL. Values come directly from the canonical API dataset. Existing metadata, cumulative sections and caller-owned combined private report sections are retained.

CSV preserves exact decimal text and spreadsheet formula protection. XLSX writes numeric OOXML decimal cells, two-decimal percentage/money display formats, 31-character data column widths and an autofilter. The exporter has no existing supported freeze-header pattern, so none was introduced. Excel's 15-significant-digit calculation limit remains explicitly documented in report metadata; use CSV for exact large-number interchange.

PNG/PDF use a dedicated wide report canvas, not a mobile screenshot. Daily columns use larger typography, deliberate two-line headers, bold TOTAL, wrapped long metadata/money, twelve rows per page and repeated headers. A 366-day report remains complete within the existing page bound (67 combined report pages). PDF fits each report canvas within landscape A4 margins. Final direct artifact inspection is tracked below.

## 10. Authorization / privacy

No route guard or role scope was broadened. Calendar/repository reads retain assignment and target-version predicates. API exports retain authorization/version/source-validity rechecks after expensive generation; browser exports retain fresh authenticated-owner checks before download. Tests reject unrelated admins, forged owners, stale assignments and changing validity.

The existing exporter is explicitly a combined shared A plus the caller's own private B report. That behavior is retained. The new System Calendar and daily export section contain only shared system data: no other owner's private targets/results, raw account identities or receipt evidence. Table B formulas and storage were not changed.

## 11. Files changed

The complete file-by-file purpose list is in [the continuation handoff](../CODEX_CONTINUATION_HANDOFF_BILLING_OSP_DAILY_SYSTEM_CALENDAR_MOVEMENT.md#6-files-changed-and-status). Production changes are confined to the backend daily aggregate/helper/types/repository/export operation and client daily contract/card/Insights/report renderer. Other changes are focused tests, browser QA, the shared readiness selector and documentation.

## 12. Tests added / updated

Added eight exact daily-helper cases; card render tests; strict API ordered-bucket validation; daily visual section/pagination cases; PostgreSQL daily/cumulative/filter/export/access reconciliation; CSV/XLSX exact decimal, weighted value, numeric formatting and incomplete-data rejection cases. The authenticated OSP browser harness now checks daily rows against API/XLSX, all supported downloads, mobile/light/dark layout and month request counts. A guarded render-only stress module clones successful authorized GET responses for large values and long metadata while preserving private payloads and restoring all hooks.

## 13. Test commands and results

| Command / scope | Verified result | Local evidence |
| --- | --- | --- |
| `npm run test:client` | 1,535 pass, 0 fail/skip (1,029 + 506 batches) | `artifacts/osp-daily-client-all.log` |
| `npm run test:services` | 581 pass, 0 fail/skip | `artifacts/osp-daily-final-test-services.log` |
| `npm run test:routes` | 469 pass, 0 fail/skip | `artifacts/osp-daily-final-test-routes.log` |
| `npm run test:scripts` | 396 pass, 0 fail/skip (345 + 51) | `artifacts/osp-daily-final-test-scripts.log` |
| Focused daily/helper/PG/service/calendar/source tests, `node --import dotenv/config --import tsx --test` | 49 pass, 0 fail/skip, including four real PostgreSQL cases | `artifacts/osp-daily-server-regression.log` |
| `node --expose-gc --import tsx --test server/repositories/tests/collection-osp-v3-performance.postgres.test.ts` | 100,000-account test passes, no skip | `artifacts/osp-daily-performance.log` |
| Latest `node scripts/collection-save-access-qa-local.mjs --osp-v3` | All real browser, render stress, privacy, resource and restart checks pass; clean exit 0 | `artifacts/collection-save-access-1788908886235_c4c8b6/qa-result.json` |
| `npx playwright test tests/visual/billing-readiness.spec.ts --workers=1` | 10 pass | `artifacts/osp-daily-final-readiness.log` |
| Latest focused client card/API/visual tests, `node --import tsx --test` | 20 pass, 0 fail/skip | `artifacts/osp-daily-final-client-focused.log` |
| `node scripts/collection-save-access-qa-local.mjs --ui-smoke` | Complete CI UI smoke flow passes, exit 0 | `artifacts/collection-save-access-1788909151170_4f5d2b/qa-result.json` |
| `node scripts/collection-save-access-qa-local.mjs --visual-contract` | Full layout contract passes, exit 0 | `artifacts/collection-save-access-1788909212300_0f7585/qa-result.json` and `visual-layout/*.json` |
| `node scripts/collection-save-access-qa-local.mjs --a11y-contract` | Public/authenticated accessibility contract passes, exit 0 | `artifacts/collection-save-access-1788909256747_4233f3/qa-result.json` |

The expanded focused command includes `server/lib/tests/collection-osp-daily-movement.test.ts`, `server/repositories/tests/collection-osp-effective-query.postgres.test.ts`, `server/services/tests/collection-osp-v7-operations.test.ts`, and repository `collection-osp-v7-calendar`, `collection-osp-source-validity`, `collection-osp-source-precision` tests. There is overlap between focused and broad suites; counts should not be added as unique coverage.

## 14. Visual verification

Final OSP evidence directory: `artifacts/collection-save-access-1788908886235_c4c8b6`. Normal daily/API/XLSX/PNG/PDF, responsive layout, four-active-aging stress, long metadata, actual reassignment/owner switches, backdated payment/source validity, real server restart and resource cleanup all passed; the disposable database was removed. Directly inspected dark desktop1440, light mobile430 with huge values, mobile360/390 and long metadata in the earlier same-build stress images, and the final daily PNG page9. Valid zero dates remain visible and quiet. Extreme currency strings wrap at narrow widths without losing digits; normal amounts align on one line. The export header word split found during inspection was fixed with explicit two-line labels.

`daily-stress-evidence.json` records six rendered daily canvases, 2,030 text calls and **zero** canvas/cell-bounds violations. Scoped axe checks at mobile390 report **zero serious/critical violations** in both themes. The final actual PDF was opened in Chrome's viewer at page9/11: landscape A4, repeated headers, all daily rows/values within the page. Viewer screenshot: `artifacts/osp-daily-pdf-viewer.png`. PNG/PDF use the same verified report canvases; the artifact has a valid PDF signature, eleven pages and EOF.

QA corrections preserve production guards: installed axe executes through the automation runtime (CSP/Trusted Types remain enabled); the extra export cycle waits for the existing four/user/minute window; in-flight mock responses finish before interception removal. The smoke test also verifies every displayed account's full PII across both SQL pages instead of assuming fixture insertion order equals canonical identity ordering. These fixes change tests only, not business calculations, permissions or pagination.

## 15. Typecheck / lint / build

Final `npm run typecheck`, `npm run lint`, `npm run build`, `npm run verify:bundle-budgets` all pass. Build identifier: `sqr-1.0.0-fd98d068abe7-20260908T225224Z` (dirty source). Production sourcemap gate passes with zero maps. Local evidence is in `artifacts/osp-daily-final-{typecheck,lint,build,verify-bundle-budgets}.log`. Test-only ES array method/XLSX declaration compatibility errors were corrected and verified by the final typecheck and expanded 49-test regression; no compiler settings were weakened.

## 16. Migration / deployment notes

No migrations or dependency changes. No application/production database writes, deployment, commit or push were performed for this feature. Test databases are unique disposable local databases with exact-name cleanup guards. Frontend and backend must be deployed together because the client now requires the additional daily API field. Existing financial history is not rewritten.

## 17. Out-of-scope findings

No unrelated defect was intentionally changed. Excel's application precision limit is pre-existing and documented rather than hidden. No promise is made that local checks replace the remote CI pipeline or production verification; neither has been run on this uncommitted feature.

## 18. Scope and acceptance audit

| Required acceptance | Evidence |
| --- | --- |
| 1: RM300 / RM30,000 = 1% | Daily helper acceptance test |
| 2, 6: zeros and zero denominator | Helper, API/card/export tests |
| 3-5: all aging, closed total, weighted percentage | BigInt unequal-target/fractional tests and exact export tests |
| 7-11: business date, CP/ABORT/manual, duplicates, multiple sources | Four real PG differential/integration tests and authenticated OSP browser fixtures |
| 12-13: validity and daily/cumulative reconciliation | Source-validity and PG period-end/historical As Of tests |
| 14-15: desktop/mobile readable | Final real browser and light/dark360-430/1440 stress pass, screenshots inspected |
| 16-17: all daily export fields, canonical values | Service CSV/XLSX, visual section and actual download/API comparisons |
| 18: export formatting | Unit pagination, final PNG and actual PDF viewer inspection, zero canvas/cell clipping violations |
| 19: unauthorized daily read/export denied | Repository/service tests and real unrelated-admin/owner-switch checks |
| 20: cumulative Table A unchanged | Independent reference aggregation comparisons, unchanged canonical CTE and overview formulas |

Independent read-only code audit found no actionable defect in money/date/dedupe/cumulative/privacy changes. Final production and QA diffs were reviewed; changed-file secret guard, repository hygiene and `git diff --check` pass. All browser harnesses exited successfully and removed their disposable databases. No new routes, dependencies, migrations or unrelated page redesigns were introduced. Nothing is staged, committed, pushed or deployed for this feature.

## 19. Final verdict

COMPLETE

All applicable feature, formula, eligibility, reconciliation, authorization, responsive/export and local quality gates above are verified. Remote CI and deployment are not claimed; they require publishing/deployment authorization. The final code is ready for the user's separately requested commit/push workflow.
