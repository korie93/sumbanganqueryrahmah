# Viewer date filters — continuation handoff

User selected recommendation 2 and explicitly requested a goal on 29 October 2026. **Status: implementation and focused QA complete.** The Viewer now supports calendar-date filters, preserving all prior uncommitted numeric filtering, numeric ordering and searchable filter-column work.

Base HEAD: `de45961f6693add3f601f6f9df0c67388c0b969a` on `main`. No commit, push or deployment is authorized for this feature or the earlier uncommitted features yet. Check `git status` and preserve existing changes before continuing.

Contract: `dateBefore`, `dateAfter`, `dateBetween` use existing `value` and optional `valueTo` fields. Bounds are valid canonical `YYYY-MM-DD` calendar dates in years 0001–9999. Before/After are strict; Between includes both endpoints, including a single-day range. Imported cells accept ISO dates, compact `YYYYMMDD` strings/eight-digit integers, and day-first `D/M/YYYY` or `D-M-YYYY` with matching separators. ASCII surrounding whitespace is trimmed; dates are bounded to 32 characters. Invalid calendar dates, empty/non-scalar cells, mixed separators, two-digit years, timestamps and Excel serial numbers are excluded rather than guessed. Comparisons do not depend on browser/server timezone.

English controls: **Before date**, **After date**, **Between dates**, distinct from numeric Between. Use native date fields with explicit labels and inline guidance, responsive at 320px+. Incomplete/invalid ranges remain local and inactive. Upper bounds must participate in query identity, retry, page/selection reset, chips and all-results export. SQL must guard dirty values before every cast and apply date predicates to the full authorized dataset before pagination, retaining existing numeric order and import lifecycle checks.

Ownership: backend agent owns shared date/filter contracts and server code/tests; frontend agent owns client code/tests; browser/review agent owns `tests/visual/viewer-date-filters.spec.ts` and independent source review. Root owns docs, test registration and all runtime execution. Agents must not execute target code.

Execution boundary: never execute repository/npm/test/build/browser code on Windows. Use existing WSL `SQR-Audit` bwrap/cgroup sandbox only: read-only source/toolchain, empty allowlisted environment, synthetic data, isolated loopback/no external network or installs, 1 CPU, 768 MiB/no swap, 128 tasks, 180 s wall/120 s aggregate CPU, 256 MiB scratch and bounded outputs. Heavy checks run sequentially under the VM's 1.5 GiB cap. Native Node 24, Vite/Rolldown, TypeScript, Chromium and disposable PostgreSQL are already available. Never substitute a compiler or browser.

Previous final source/control references: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/viewer-filter-column-search-20261029/05`; source `/opt/sqr-audit/source-viewer-filter-column-search-05`, manifest `82224e198c31da7c07e38e3cd2355bc10d0e2d59da00f3d6648df85557109847`. New immutable snapshots and QA evidence go under `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/viewer-date-filters-20261029`. Preserve old proofs and failed attempts.

## Implementation

- `shared/common/import-data-dates.ts`: shared calendar parser, strict bound validation and date comparison. `import-data-filters.ts` extends the existing contract and shares numeric/date range detection.
- `server/repositories/viewer-date-filter.ts`: parameterized SQL with guarded scalar/calendar parsing. `search.repository.ts` integrates full-dataset predicates with existing counts, search, numeric ordering and keyset pagination. Service and controller validate known columns and date bounds before data access.
- `client/src/pages/viewer/ViewerFilterRow.tsx`: labelled native date controls, inline errors and supported-format guidance, stacked date bounds on narrow screens. Filter state, retry keys, chips and CSV exports retain both endpoints. Switching operator families clears incompatible drafts.
- Dedicated shared/SQL, API, client and native browser tests cover strict comparisons, inclusive leap-day ranges, dirty imported values, unknown/hostile columns, upper-bound changes, cursor/selection resets, export ordering and keyboard/320px layout. The real PostgreSQL case is registered in `scripts/test-auth-recovery-isolated.mjs`.
- Behavior and parsing limits are documented in `docs/viewer-date-filters.md`. No database migration or dependency change is needed.

## Verified evidence

Immutable source: `/opt/sqr-audit/source-viewer-date-filters-01`, **3,822 files**. Manifest SHA-256: `173475acfc2609120a0ee693a1cc82aca3d5e4ff7379111b1b6c81d45d2aa0fb`.

Evidence directory: `C:/Users/Administrator/security-audit-skill/sumbanganqueryrahmah/viewer-date-filters-20261029/01`. `FINAL_VALIDATION.json` records proof hashes, exact current source hashes, the feature delta, resource limits and cleanup. Runtime source matches the final working tree except this documentation-only handoff update.

- **218 client/shared/API-serialization tests passed**, with no failures or skips.
- **88 backend/repository/service/API tests passed**, with no failures or skips.
- **3 real disposable PostgreSQL scenarios passed**: date filters, numeric filters and import lifecycle. Calendar cases use independent expected metadata, including leap centuries, native JSON numeric lexical variants, dirty values, a restricted search subset, full counts and ascending/descending keyset exports.
- **14 native Chromium/Playwright cases passed** against the actual production frontend build: 3 new date cases and 11 existing Viewer column-search, numeric filter/sort, text filter, export and retry cases. Browser API fixtures are synthetic; backend SQL/API checks run separately above.
- ESLint passed for changed TypeScript/TSX. Strict semantic TypeScript checks passed for **41 client/shared roots and 16 server/shared roots**, including `exactOptionalPropertyTypes`.
- Actual Vite/Rolldown frontend build, bundle-budget and sourcemap gates passed; 469 frontend files were served in the isolated browser checks. The existing nonfatal PostCSS `from`-option warning remains.
- Final cleanup confirmed **zero active audit cgroups, scratch mounts or target-user processes**. `SQR-Audit` was terminated after all checks.

These are focused synthetic checks, not a complete CI run, full-repository TypeScript check or full visual suite. Production was not contacted. All code and tests remain uncommitted, together with the earlier Viewer improvements. No commit, push or deployment has been performed.

## Continue from another account

Read this file, the three earlier Viewer handoffs and `FINAL_VALIDATION.json`; inspect `git status` before making changes. The requested date-filter work is complete. Commit/push only when the user requests it. If code changes further, create a new immutable sandbox snapshot and run the affected checks rather than reusing these proofs for changed code.
