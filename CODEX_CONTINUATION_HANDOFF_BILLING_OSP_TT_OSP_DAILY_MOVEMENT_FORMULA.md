# Billing OSP TT OSP Daily Movement: continuation handoff

Status: COMPLETE, locally verified 2026-09-09. Full evidence and the seventeen-section final report: [TT OSP engineering report](docs/BILLING_OSP_TT_OSP_DAILY_MOVEMENT_FORMULA_REPORT.md). No commit/push/deployment performed.

## 1. Permanent goal

Correct D3/D4/D5/D6 and ALL daily movement to qualifying daily System OSP Closed / authoritative TT OSP x 100. Keep screen and CSV/XLSX/PNG/PDF exports consistent. Preserve cumulative results, Target %, Target OSP, Balance OSP, System As Of, Payment Date, eligibility/deduplication, multi-source validity, authorization and private Table B. Complete focused/regression tests, desktop/mobile visual/export checks, typecheck, lint, build and final scope audit. No commit/push/deploy unless separately requested.

## 2. Original requirement

User confirmed implementation of `CODEX_GPT_6_ASTRA_ULTRA_BILLING_OSP_TT_OSP_DAILY_MOVEMENT_FORMULA_CALENDAR_EXPORT.md` on 2026-09-09. Daily movement is percentage-point movement relative to TT OSP, not progress toward Target OSP or relative growth from yesterday. ALL is sum(closed) / sum(TT OSP), never the arithmetic mean of aging percentages. Zero TT OSP follows existing `0.0000` semantics.

## 3. Repository state

Starting branch `main`, clean at `c3b9c556df9dc0300d92f995a3c748d8014ac1e1`. Current implementation is uncommitted. `git status` and the actual code are authoritative; do not discard user changes. Node is available at `C:\Program Files\nodejs`; add it to the process PATH for commands. This machine has limited RAM: run heavy suites/build/browser QA sequentially.

## 4. Root cause / formula drift

`server/lib/collection-osp-daily-movement.ts` used each shared `targetOsp` as denominator, including summed ALL; the previous acceptance test explicitly enforced that wrong denominator. `resultRows` in the repository already uses `totalOsp` correctly for cumulative Table A. The legacy calendar daily percentage field subtracted rounded cumulative percentages; only that daily field is being switched to the direct daily ratio to remove rounding drift.

## 5. Authoritative TT OSP source

The existing revision dataset's `agingRows[].totalOsp`, also used by Table A. The calendar already passes the complete aging configuration to its helper. No new source query, rollup, snapshot strategy or SQL eligibility path is needed. Money inputs remain exact BigInt sen following the repository's two-decimal money contract. `ospRequiredForOnePercent` preserves TT OSP / 100 as an exact four-decimal RM string; it is explanatory, not an intermediate denominator.

## 6. Files / ownership during implementation

- Backend: daily helper, storage response type, small repository daily-ratio correction, daily/calendar/PostgreSQL tests.
- Client: Billing API type/schema, fixture/tests, daily card and explanatory text, visual export and tests.
- Service export: existing CSV/XLSX operation and focused tests.
- Root: browser OSP smoke/render QA, handoff and final report, integrated verification.

## 7. Backend status

Implemented. Daily rows/all retain `targetOsp` and add required `totalOsp` and `ospRequiredForOnePercent`. Percentage remains the existing four-decimal string. The legacy daily percentage field now uses the direct ratio. Effective-account SQL, cumulative/Balance formulas and authorization are unchanged.

## 8. Frontend / calendar status

Implemented. Signed daily movement, TT OSP explanatory wording and a collapsed five-row TT OSP/OSP-for-+1% basis table; no unrelated redesign. Schema requires the canonical TT basis fields. Full client suite passed 1,540 tests (1,034 + 506), no failures/skips.

## 9. Export status

Implemented. Eleven daily columns retained; separate five-row TT OSP basis section/sheet avoids widening daily tables. CSV keeps exact text; XLSX retains numeric money/percentage cells. Visual export uses a dedicated report canvas and the same API values. Private Table B remains caller-owned. Service export regressions are included in the 64-test integrated pass.

## 10. Test status

Verified `artifacts/osp-tt-client-all.log`: 1,540 pass, 0 fail/skip. Verified `artifacts/osp-tt-server-regression.log`: 64 pass, 0 fail/skip, including four real PostgreSQL effective-query cases. Broad services 595, routes 469, scripts 400 tests passed. Typecheck/lint/build/budgets passed. Initial browser run `artifacts/osp-tt-browser.log` exited 0 and verified TT OSP acceptance, responsive layout, actual exports, privacy and restart; actual PDF pages 9-12 were inspected and fit correctly.

Stricter PNG completeness subsequently exposed a real browser burst limit: normal report could trigger 12 downloads but receive only 9-10. `artifacts/osp-tt-browser-completeness.log` records that resolved regression, not a formula failure. An isolated Chrome diagnostic confirms 12 immediate blob clicks deliver 10 files; 150ms spacing delivers all 12. PNG export now waits 150ms before each file, retaining cancellation and the fresh owner check after the wait. Thirteen focused visual/card/pacing tests pass. Final typecheck/lint/build/budgets passed. The strict final browser run `artifacts/osp-tt-browser-final.log` passed with exit 0 and all 12 normal/stress PNG pages, PDF/XLSX, responsive TT acceptance, zero canvas/accessibility violations, permission/owner checks, cancellation, resource cleanup and actual restart. Final evidence directory: `artifacts/collection-save-access-1788928707756_561dbb`. All three disposable browser test databases were removed by the guarded harness; artifacts remain.

## 11. Build status

Final build `sqr-1.0.0-c3b9c556df9d-20260909T040834Z` passed after the PNG pacing correction and was used by the successful strict browser run. Evidence: `artifacts/osp-tt-final-{typecheck,lint,build,verify-bundle-budgets}.log`.

## 12. Migration status

No migration or dependency change intended. Deploy backend and frontend together; existing financial data is not rewritten. QA may create and clean up uniquely named disposable local databases using existing guarded harnesses.

## 13. Exact next actions

No implementation or verification work remains. If the user requests publication, inspect the current diff, run the staged secret guard, then commit/push only these task changes. Do not automatically deploy. Current local evidence does not imply remote CI has run. Re-run only checks affected by subsequent edits or changed external dependency advisories.

## 14. Do not repeat / scope constraints

Do not redo the completed dependency CI patch or prior daily-calendar architecture. Do not globally replace Target OSP: Target tracking, Balance and private Table B still need it. Do not relax the money parser, source validity, permissions or export guards. Do not invent an event ledger or change effective-state reconciliation. The earlier daily-calendar report is historical and describes the superseded Target OSP daily formula, not this correction.

## 15. Definition of done

- [x] Root cause and authoritative TT OSP source identified.
- [x] D3/D4/D5/D6/ALL, 1%-OSP metadata, weighted/zero/precision fixtures verified.
- [x] No active daily movement path uses Target OSP or rounded cumulative subtraction.
- [x] Payment Date, eligibility, deduplication, multi-source and cumulative reconciliation verified.
- [x] Calendar desktop/mobile and exact acceptance display verified.
- [x] CSV/XLSX/PNG/PDF TT basis and screen/export parity verified.
- [x] Target %, Target OSP, Balance, System As Of and Table B/privacy preserved.
- [x] Focused/relevant regression tests, typecheck, lint and build pass.
- [x] Final scope/security audit complete, no unrelated edits.

Status: COMPLETE.
