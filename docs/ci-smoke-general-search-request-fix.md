# CI UI smoke — General Search request lifecycle and candidate planning

Date: 2026-10-19. Source: `db29f84be88d27d4c5e33630d01f9bcfe10a58fb`.

## Observed failure

[CI run 39198721942](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/39198721942), job `smoke-ui`, failed at **Run UI smoke**, phase **Collection Manual Verified ABORT V9 UI flow**. The test waited 15 seconds for the General Search badge `Collection direkodkan`.

The failed-job log, screenshot and network trace were inspected. Manual verification and audit history had succeeded. At failure, General Search still displayed `Searching...`; two identical first-query requests were pending. Nearby analytics and cleanup requests completed successfully. This was not evidence that saving Collection failed, nor a recurrence of the earlier password-layout gate.

## Bounded corrections

- The first explicit search set `searched=true`, which triggered the refresh effect and immediately aborted/repeated that same request. The effect now skips only the initial false-to-true transition. Later query, filter, mode and page-size refreshes, pagination, cancellation and stale-response protection remain.
- Clearing/resetting a pending search now releases its loading state. The obsolete request cannot clear it through `finally`, because its request ID has already been invalidated.
- The collection-status candidates CTE now has a parameterized limit equal to the already-bounded serialized candidate count. It cannot discard any supplied candidate and does not alter matching, visibility scopes, encryption, ordering or returned fields. Empty/unauthorized candidates still issue no query.
- Smoke now arms the exact same-origin GET response before entering the fixture query. It requires HTTP 200, the exact fixture account and the expected Collection status, then retains the existing visible badge assertion. HTTP failures, invalid JSON, absent/wrong data and response timeouts remain failures. No retry, skipped assertion, timeout increase or rate-limit change was added.

## Evidence and limitations

- Actual React/Chromium lifecycle probe: before, first submit sent two requests and aborted the first; after, it sent one non-aborted request. Live query, page size, pagination, stale response, reset, clear, advanced filters/logic, mode transition and unmount checks passed. Probe: ignored `artifacts/general-search-request-proof.mjs`.
- Disposable PostgreSQL planner probe on fresh tables: original one-candidate estimated cost 184203.25 / rows 100; exact candidate limit cost 1842.03 / rows 1. The local PostgreSQL reports JIT enabled but LLVM unavailable. This supports Linux JIT compilation as a contributor, but the failed runner's internal compilation timing was not captured, so it is not claimed as a proven sole cause.
- Persistent PostgreSQL regression checks plan cardinality and unchanged results for one/two candidates before table statistics, not machine-dependent execution times. Repository regression also covers multiple/capped 200 candidates, parameterization and empty/denied scopes. These passed 7/7 PostgreSQL and 30/30 repository/Card tests (`artifacts/search-status-cardinality-validation.log`).
- General Search client tests passed 59/59; smoke response and neighboring contracts passed 41/41. The complete script suite passed with 694 tests plus 63 TypeScript tests; one pre-existing test was skipped. Final script verification used a clean child environment, a verified absent dotenv path and an unreachable test-only database endpoint (`artifacts/ui-smoke-search-fix-script-tests-isolated.log`). Earlier broad attempts were rejected by local environment validation and are not counted as passes.
- Full built-app disposable smoke passed after the frontend/request-assertion changes, including Manual ABORT, General Search history, Billing exports, receipt create/replace/remove, backup and logout (`artifacts/ui-smoke-search-fix-verified.log`). Final combined verification including the SQL change is recorded below.

All database/browser work used owned loopback synthetic fixtures. Their validated temporary app/database directories were removed after shutdown; no production data, uploads, receipts or real accounts were changed. Downloaded CI ZIP/trace archives were also removed after analysis; sanitized failure summaries and screenshots remain locally. No commit, push, remote workflow rerun or deployment is included in this task. Remote CI success must be verified after the patch is pushed.

## Final combined verification

- TypeScript passed after correcting the test mocks' explicit query types, mock return cast and project-compatible array indexing (`artifacts/ui-smoke-search-fix-typecheck-final.log`). Scoped ESLint passed (`artifacts/ui-smoke-search-fix-lint.log`).
- Final production build passed, including status assets, CSP and zero production sourcemaps (`artifacts/ui-smoke-search-fix-build-final.log`).
- The full UI smoke ran against that final build and a newly created PostgreSQL cluster: **17/17 phases passed, exit 0** (`artifacts/ui-smoke-search-fix-final-smoke.log`). This retains real Manual ABORT verification/revocation/history, exact General Search status/history, Billing XLSX/PNG/PDF, receipt create/replace/remove, backup/restore and logout assertions.
- The runner confirmed app shutdown, PostgreSQL stop and removal of its validated temporary directory. Sanitized server log: `artifacts/frontend-redesign/baseline-nKBTKd/server.log`.
- `node --check` for both smoke files and `git diff --check` passed. No remote-green claim is made: the patch remains uncommitted and unpushed.
