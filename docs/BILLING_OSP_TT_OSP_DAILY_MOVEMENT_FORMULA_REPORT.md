# Billing OSP: TT OSP daily movement correction

Baseline: `main` at `c3b9c556df9dc0300d92f995a3c748d8014ac1e1`. Verification date: 2026-09-09. Implementation is local and uncommitted; no deployment is claimed.

## 1. Root cause

The previous daily helper explicitly used the shared Target OSP denominator, and its tests/UI/export documentation reinforced that formula. Cumulative Table A already used TT OSP correctly. A separate legacy calendar daily field subtracted already-rounded cumulative percentages, which could introduce a 0.0001 percentage-point rounding discrepancy.

## 2. Old daily formula

`daily qualifying System OSP Closed / Target OSP x 100`. ALL divided the combined closed amount by combined Target OSP. This was target achievement, not the requested daily contribution to TT OSP Result.

## 3. Correct authoritative formula

`daily qualifying System OSP Closed / TT OSP x 100`, independently for D3-D6. ALL uses `sum(daily closed) / sum(TT OSP) x 100`; no averaging and no relative growth from yesterday. Both calendar daily fields now use the direct ratio. Zero denominators retain `0.0000`; amounts/counts are not discarded. The client displays signed percentage-point contributions such as `+1.00%`.

## 4. TT OSP source of truth

`collection_osp_target_aging_rows.total_osp_baseline`, exposed as the report dataset's `agingRows[].totalOsp`, is the same immutable revision baseline used by Table A. Existing target creation derives it from the deduplicated authoritative snapshots across all selected configured Saved sources. Existing baseline integrity checks compare it with snapshot sums. No first-source shortcut, dynamic re-baselining or new snapshot model was introduced.

## 5. Calculation / precision verification

The canonical helper retains BigInt sen arithmetic and the established four-decimal percentage result. It does not pass through JavaScript floating-point money. `ospRequiredForOnePercent` exposes TT OSP / 100 as an exact four-decimal RM string, rounded to sen only for UI/image/PDF display. This explanatory amount is never used as a denominator.

| Aging | TT OSP | Exact OSP for +1% | Display |
| --- | ---: | ---: | ---: |
| D3 | 1,908,183.36 | 19,081.8336 | RM19,081.83 |
| D4 | 1,219,740.60 | 12,197.4060 | RM12,197.41 |
| D5 | 1,392,703.35 | 13,927.0335 | RM13,927.03 |
| D6 | 1,234,657.25 | 12,346.5725 | RM12,346.57 |
| ALL | 5,755,284.56 | 57,552.8456 | RM57,552.85 |

All supplied 0.5/1/2/5/10% D3 fixtures and 1% D4/D5/D6/ALL fixtures pass. Tests prove exact sub-sen mathematical ratios with equally scaled BigInt units and separately exercise actual stored-sen inputs, preserving the repository's `NUMERIC(16,2)` money contract. Unequal 1/2/3/4% movements with TT OSP 100,000/50,000/40,000/10,000 yield ALL 1.8000%, not the arithmetic mean 2.5000%. TT OSP 1,000,000 / Target OSP 300,000 / Closed 10,000 yields 1.0000%, never 3.3333%. Large-value and tiny-denominator tests verify exact sums and no premature rounding.

## 6. System Calendar changes

Day cards retain the existing responsive layout and show aligned Aging / Movement % / OSP closed, with signed values and a clear TT OSP percentage-point legend. A collapsed five-row TT OSP/OSP-for-+1% table gives context without crowding each day. Month navigation, quiet dates, account drilldown, cumulative footer and System As Of remain intact. The cumulative aging filter does not remove the all-aging daily data.

## 7. Export changes

CSV/XLSX retain eleven daily columns, rename the percentage headers to Daily Movement Percentage, and add a separate five-row TT OSP basis section/sheet. CSV preserves exact decimal text and injection protection. XLSX preserves numeric OOXML decimal values, percentage/money display formats, widths and autofilter; the 1%-OSP basis retains four decimals. Existing Excel 15-significant-digit limitations remain documented; CSV is the exact-text interchange format. No new freeze-header or styling engine was added.

PNG/PDF use the existing dedicated report renderer, not a mobile screenshot. They add a separate readable TT OSP basis section with a bold TOTAL row, corrected metadata, signed daily movement and unchanged eleven-column width. Daily headers repeat across pages. A full 366-day dataset remains complete in 68 bounded report pages. All formats consume canonical daily values rather than recalculate them in the browser. Missing TT basis fields fail the client contract; CSV/XLSX additionally reject missing, invalid or changing fixed bases.

Strict page-count verification exposed a related PNG completeness defect: a fast burst of 12 separate blob downloads could deliver only 9-10 files in Chrome. A local isolated diagnostic reproduced 10/12 without spacing and 12/12 with 150ms spacing. PNG export now waits 150ms before each page; cancellation and a fresh authenticated-owner check still run after that wait and before download. No browser permission/security flag is bypassed. The new timer regression checks waiting and cancellation; real browser QA requires all twelve normal and stress PNG pages rather than accepting any nonzero number of downloads.

## 8. Backend / SQL / rollup changes

One small canonical helper now uses the supplied `totalOsp`; the repository already supplied all necessary fields. Only the legacy daily ratio line changed in the repository. The response adds `totalOsp` and `ospRequiredForOnePercent` while retaining `targetOsp`. Effective-account SQL, grouped daily query, number of requests/queries, rollups and storage schema are unchanged. No N+1 or raw-account browser aggregation was added.

## 9. Eligibility / deduplication / reconciliation

The real PostgreSQL effective-query tests verify factual ABORT CP, manual verified settlement, ordinary CP exclusion, canonical effective/payment dates, historical As Of semantics, duplicate/account protection, selected-source/nickname boundaries and source-specific validity. Daily closed amounts and unrounded percentage-point contributions reconcile with period-end Table A under the existing effective-state model. Separate target achievement and target-minus-closed Balance remain unchanged. No immutable event-ledger semantics were invented.

## 10. Files changed

- `server/lib/collection-osp-daily-movement.ts`: corrected denominator and exact 1%-OSP metadata.
- `server/storage-postgres-collection-types.ts`: additional canonical response fields.
- `server/repositories/collection-osp-v7-repository-utils.ts`: direct legacy daily TT ratio only.
- `server/services/collection/collection-osp-v7-operations.ts`: export basis/labels and validation.
- `client/src/lib/api/collection-billing-principal.ts`: required API fields/schema.
- `client/src/pages/collection/BillingPrincipalCalendarDayCard.tsx`, `BillingPrincipalInsights.tsx`, `billing-principal-report-utils.ts`, `billing-principal-visual-export.ts`: formatting, explanation/basis and visual exports.
- Corresponding helper/calendar/PostgreSQL/service/client tests and `billing-principal-v7-test-fixture.ts`: corrected expectations and regressions.
- `scripts/billing-osp-v3-smoke.mjs`, `scripts/lib/billing-osp-daily-render-qa.mjs`: runtime/API/XLSX parity and acceptance/stress browser checks.
- This report, the new continuation handoff, and short superseded-formula notices in the prior report/handoff.

## 11. Tests added / updated

Acceptance matrix covers exact mathematical and stored-sen fixtures, weighted ALL, wrong Target OSP, zero TT OSP, huge values, tiny denominators, independent target changes, missing configuration and rounded-cumulative subtraction drift. API/card/export tests cover required basis, signed values, unchanged A/B amounts, exact CSV/XLSX cell contents, complete buckets and export pagination. Existing real PostgreSQL tests now assert daily TT basis equals Table A and daily/export/filter/cumulative parity. Browser fixtures verify current API values and actual downloads, plus test-only authorized render stress.

## 12. Commands and results

| Verification | Result | Evidence |
| --- | --- | --- |
| `npm run test:client` | 1,540 pass; 0 fail/skip | `artifacts/osp-tt-client-all.log` |
| Focused helper/calendar/source/service and real PostgreSQL tests | 64 pass; 0 fail/skip | `artifacts/osp-tt-server-regression.log` |
| `npm run test:services` | 595 pass; 0 fail/skip | `artifacts/osp-tt-test-services.log` |
| `npm run test:routes` | 469 pass; 0 fail/skip | `artifacts/osp-tt-test-routes.log` |
| `npm run test:scripts` | 400 pass; 0 fail/skip | `artifacts/osp-tt-test-scripts.log` |
| `npm run typecheck` / `npm run lint` | PASS | `artifacts/osp-tt-typecheck.log`, `osp-tt-lint.log` |
| `npm run build` / `npm run verify:bundle-budgets` | PASS; no production sourcemaps | `artifacts/osp-tt-build.log`, `osp-tt-verify-bundle-budgets.log` |
| Visual/card/PNG pacing focused tests after final fix | 13 pass; 0 fail/skip | `artifacts/osp-tt-png-pacing-tests.log` |
| Final `typecheck` / `lint` / `build` / bundle budgets after pacing fix | PASS | `artifacts/osp-tt-final-*.log` |
| `node scripts/collection-save-access-qa-local.mjs --osp-v3` | Final strict run PASS, exit 0; all 12 PNG pages, PDF/XLSX, stress, privacy and restart | `artifacts/osp-tt-browser-final.log`, `artifacts/collection-save-access-1788928707756_561dbb/qa-result.json` |

Focused command: `node --import dotenv/config --import tsx --test server/lib/tests/collection-osp-daily-movement.test.ts server/repositories/tests/collection-osp-v7-calendar.test.ts server/repositories/tests/collection-osp-source-validity.test.ts server/repositories/tests/collection-osp-source-precision.test.ts server/repositories/tests/collection-osp-effective-query.postgres.test.ts server/services/tests/collection-osp-v7-operations.test.ts`. Counts overlap; they are not unique coverage totals.

## 13. Visual verification

The initial complete TT OSP run (`artifacts/collection-save-access-1788925640626_d2ace2`) passed desktop/mobile 360/390/430/1440px light/dark layouts, expanded basis, exact acceptance amounts, large currency, long metadata, downloads, scoped accessibility, permission/owner transitions and restart. Directly inspected acceptance cards/basis (D3 RM19,081.83, +1.00%; correct ALL basis RM5,755,284.56 and OSP-for-+1% RM57,552.85), stress basis and daily PNG pages. Extreme amounts wrap inside their cells, ordinary amounts remain aligned. The sum of individually sen-rounded 1% aging closures is RM57,552.84, correctly retained as the daily ALL amount; it still displays +1.00%, while exact combined OSP-for-+1% displays RM57,552.85.

The stress evidence records six daily canvases, 2,110 text calls, zero cell/canvas bounds violations and zero serious/critical accessibility violations at 390px in both themes. The actual PDF was opened separately in Chrome: `%PDF-1.3`, 12 pages, terminal `%%EOF`, 1,258,011 bytes. Viewer pages 9-12 confirm TT basis, active day, repeated headers and final dates without overlap/clipping; screenshots are `artifacts/osp-tt-pdf-page9.png` through `page12.png`.

The final strict browser rerun with the paced build completed successfully at `artifacts/collection-save-access-1788928707756_561dbb` (exit 0). All twelve normal PNG pages were downloaded for each of the three owners and both repeated resource cycles; all twelve stress PNG pages also arrived. PDF/XLSX parity, cancellation, source validity, reassignment, owner switching, actual restart and resource cleanup passed. Direct inspection of the final normal daily PNG page 10, expanded TT basis and mobile stress card confirms complete, readable values. Final stress evidence again shows six daily canvases, 2,110 text calls, no canvas/cell bounds violations and no serious/critical accessibility violations. The disposable database was removed; screenshots and reports remain in ignored artifacts.

## 14. Typecheck / lint / build

All passed on the final implementation, including PNG pacing. Build identifier: `sqr-1.0.0-c3b9c556df9d-20260909T040834Z` (dirty source). The source-map and bundle-budget gates passed. No compiler/linter/security threshold was relaxed.

## 15. Migration / deployment

No migration, dependency update, financial data rewrite or production operation. Deploy frontend and backend together because the client requires the added TT basis fields. Daily percentages intentionally change; Target %, Target OSP, cumulative Result, Balance and private inputs do not. Existing QA creates only uniquely named disposable local databases and cleans them up with guarded existing routines. Publishing/deployment requires a separate user request.

## 16. Scope audit

Independent read-only reviews found no actionable production defect, including after PNG pacing. Actual diff confirms no canonical eligibility SQL, role guard, source validity, System As Of, Target/Balance/private Table B logic, route or unrelated page change. Dependency audit, repository hygiene, tracked and changed-file secret checks and `git diff --check` passed. No compiler/security gate was weakened. The PNG completeness correction is part of the requested daily export verification, not an unrelated redesign.

Acceptance matrix: items 1-9 (supplied monetary/percentage fixtures) are covered by daily-helper exact/stored-sen cases; 10 (weighted ALL), 11 (wrong Target denominator) and 12 (zero) have explicit helper and export regressions; 13-17 (Payment Date, CP/ABORT eligibility, duplicate protection, multiple sources) are covered by real PostgreSQL and authenticated browser fixtures; 18 (cumulative reconciliation) is asserted against period-end Table A; 19 (screen/export parity) is covered by API, CSV/XLSX tests and actual PNG/PDF/browser evidence; 20 (existing Table A) is covered by unchanged formulas, reference reconciliation and A/B preservation tests.

## 17. Final verdict

COMPLETE

All applicable requirements are verified locally. No commit, push, remote CI success or production deployment is claimed.
