# View Rekod Collection — compact/full and recovery continuation

Updated: 2026-10-11 (Asia/Singapore)

Status: FEATURE PUBLISHED as `7919060d12b1e57526325704938ad5f697164ac2` on `main`. Follow-up CI smoke compatibility fix is COMPLETE and verified locally; user authorized its commit and push on 2026-10-11. Confirm publication from Git history and remote state. Deployment remains out of scope.

## Current goal and authorization

User approved these three proposals: desktop Ringkas/Lengkap views, neutral amount colors, and useful empty-state actions. User then explicitly requested a completion goal and a durable handoff for continuation with another account. Implementation and local verification are complete; the follow-up "tolong commit dan push" authorizes publishing these changes. Deployment and production access are not authorized by that request. Read AGENTS.md, this file and current Git status/diff before continuing. Do not read `.env` or credentials. Preserve unrelated changes; use apply_patch.

Starting branch: clean `main` after `cdb0cfac` (previous timer-ownership CI fix already pushed). No backend/database/dependency or shared UI primitive changes intended.

## Implemented

- `CollectionRecordsTable` owns ephemeral compact/full presentation state; desktop starts Ringkas, accessible pressed buttons switch to Lengkap. No persistence, query parameters, export or API changes. Mode survives responsive switches and data reloads within the mounted table.
- Desktop compact has eight columns (seven read-only): number, customer, Account/Card together, amount, payment date, receipt, nickname, permission-gated actions. Complete mode retains original 18 columns. Authorized identifiers remain complete (including leading zeros and supplied masked values). Amount foreground is neutral on desktop/mobile. Compact wrapping and narrow-container sticky treatment are scoped to records CSS.
- New `CollectionRecordsEmptyState` offers clear-search/reset-filter only when relevant and wired; no destructive operation. Page uses existing search setter/debounce and reset handler. Includes date/nickname/team/source/aging/classification filters, excluding sorting and pagination. Keeps focus meaningful when recovery controls disappear.
- A small query-state failure flag distinguishes failure with no available rows from an actual empty result; existing toast stays, failed empty view offers retry. No error payload is newly exposed. Existing rows remain on refresh failure.
- Browser testing exposed an existing unconditional skip-next-fetch marker affecting the new retry/clear-search actions. Suppression is now keyed to the exact normalized filter snapshot (including deferred search), consumed once, and reset is captured after clearing filter refs. A later different search cannot be swallowed. Validation, permissions, API contracts and cache rules remain unchanged.
- Component tests updated/added, script table contract explicitly checks complete/compact; browser fixture and regressions expanded in `tests/visual/collection-polish.spec.ts`.

## Verified local evidence (2026-10-11)

- `npm run typecheck`: exit 0 (`artifacts/records-view-typecheck.log`).
- `npm run lint:client`: exit 0 (`artifacts/records-view-lint.log`).
- `npm run test:client`: 1,910 passed across two batches, no failures/skips (`artifacts/records-view-client.log`).
- `npm run test:scripts`: final exit 0; 655 MJS tests passed, 1 platform-conditional skip; 63 TS script tests passed (`artifacts/records-view-scripts-final.log`). An intermediate concurrent run timed out in the unchanged synthetic OTLP telemetry test; the complete rerun after other suites finished passed without modifying that test or its timeout.
- Explicit component suite: 19/19 passed (`artifacts/records-view-components-native.log`), using `node --import ./scripts/lib/register-client-css-test-loader.mjs --import tsx --test client/src/pages/collection-records/CollectionRecordsTable.test.tsx client/src/pages/collection-records/tests/collection-records-empty-state.test.ts`. The client runner discovers `.test.ts` only; this command also verifies `.test.tsx`. Direct TSX without the CSS loader is unsuitable here.
- `node scripts/run-client-build.mjs`: exit 0 after the final runtime fix (`artifacts/records-view-build.log`).
- Synthetic built-browser suite: 70/70 passed (`artifacts/records-view-browser-final.log`), via `node scripts/test-visual-built.mjs --grep 'Collection record|Collection polish|Collection return|Collection inline|Collection edit|Collection unsaved' --workers=1`. Covers compact/full fields, desktop/tablet/mobile, light/dark, keyboard controls, read-only roles, action menus, receipt return, editing and unsaved draft protections, no document overflow, paging/filter preservation and recovery. Static loopback server only; APIs intercepted, no application server or database.
- Screenshot framing was then improved to await lazy filters and show the full row/card: 8/8 relevant cases passed again (`artifacts/records-view-visual-inspection.log`); no runtime code changed. Compact light/dark rows, mobile 320px card and full-mode sticky scroll screenshots were inspected. Account/Card strings remain complete and wrap without truncation; record Amount is neutral. Summary totals retain their existing styling intentionally.
- Existing Collection layout/role compatibility suite: 13/13 passed (`artifacts/records-view-layout-compat.log`), via `node scripts/test-visual-built.mjs --grep 'Collection layout polish' --workers=1`. Covers 320/390/768/1280/1920px in both themes and admin/user/manager permissions. Together the browser runs cover 83 distinct cases plus eight screenshot-framing reruns; no baseline replacements.
- Standalone strict TypeScript check of `tests/visual/collection-polish.spec.ts` passed (`artifacts/records-view-visual-typecheck.log`).
- Repo hygiene, secret scan, new-file secret guard and `git diff --check` passed. No dependency, server, database, shared primitive or baseline PNG changes.
- Independent read-only final review found no further actionable issues.

Initial browser failures were resolved, not ignored: three dark assertions compared two different neutral foreground tokens and now assert the intended semantic token; mobile clear-search exposed the real stale suppression marker above. Retry followed by another search and clear-search is explicitly covered.

## Completion audit

| Requirement | Current evidence |
| --- | --- |
| Ringkas/Lengkap desktop views | Eight/seven versus original 18 columns; component assertions and browser mode/keyboard/resize checks pass. |
| Complete authorized identifiers and permissions | Leading-zero, missing and masked-value component cases; read-only desktop/mobile and per-row action cases pass. No API/security-policy changes. |
| Neutral record Amount | Explicit foreground token checked in browser and components in both modes; mobile regression passes. |
| Useful empty/error recovery | Seven unit cases plus browser clear-search preserving another filter, reset, mobile recovery, failed load/retry/next-search checks pass. |
| Existing filters, paging, export and data behavior | Browser mode-switch test preserves page, totals, search and export scope with no extra requests; mode state stays solely in the table. Export implementation, request contract and backend unchanged by diff review. Suppression fix only prevents dropping a different next filter request. |
| Responsive layout and action behavior | Browser geometry/no-overflow checks and screenshot inspection; existing receipt/edit/unsaved protections pass. |
| Portable continuation | This tracked-candidate handoff records scope, implementation, tests, caveats and publication boundary; no secrets. |

## Publication boundary / next action

The feature was committed and pushed as `7919060d12b1e57526325704938ad5f697164ac2`, with the remote verified. After the CI repair and local verification, the user explicitly requested "tolong commit dan push" on 2026-10-11. Publish only the six scoped smoke compatibility, regression and handoff files, then verify the remote commit. Do not deploy or access production without a fresh request. Local checks do not claim that GitHub CI has run the new fix.

## CI smoke follow-up (2026-10-11)

- Evidence: [CI run 38115731799](https://github.com/korie93/sumbanganqueryrahmah/actions/runs/38115731799), commit `7919060d12b1e57526325704938ad5f697164ac2`, `smoke-ui` job `114401009022`. Build/test, coverage, visual layout, Playwright snapshots and accessibility passed. `Run UI smoke` failed in `checkCollectionReceiptUiFlow`: the exact Saved source filename was not visible within 15 seconds. Lighthouse was skipped after that failure.
- Root cause: the receipt smoke still expected the Source File column in the default record view. The new default Ringkas intentionally omits that column; Lengkap retains it. This is a stale smoke assumption, not evidence of lost source linkage or a save failure.
- Fix: explicitly select `Paparan rekod` > `Lengkap` before the existing exact source-provenance assertion. Receipt view/edit/delete, permissions and all existing smoke phases remain intact. No longer timeout, retry bypass or skipped assertion was introduced.
- Regression: a VM test executes the actual receipt smoke sequence and requires full-view selection before source verification; it failed before the fix and passed afterward. Six built-browser mode cases additionally assert the source filename is absent in Ringkas and visible in Lengkap.
- Related audit: the standalone Card No browser harness also assumed the old full-table cell layout and empty-state wording. Its default current-build path now explicitly selects Lengkap, verifies the Card Number header, and requires the filtered empty-state heading. The documented, explicit `--expect-missing-card` old-build reproduction keeps its old selectors only in that mode; current verification has no automatic fallback. Exact Card No strings, totals, pagination and permission assertions are preserved.
- Scope: test scripts, regression assertions and this handoff only. No application, backend, database schema, dependency, CI workflow or visual baseline changes.

Verified locally on the fresh build:

- `npm run build`: passed (`artifacts/records-smoke-fix-build.log`); server and frontend rebuilt together.
- Full real-app UI smoke: passed every phase, including receipt, Billing XLSX/PNG/PDF, backup restore and logout. Command: `SQR_REDESIGN_SMOKE_ONLY=1 node scripts/test-frontend-redesign-isolated.mjs` (`artifacts/records-smoke-fix-real-smoke.log`). Fresh loopback PostgreSQL with synthetic records and generated credentials only.
- `node scripts/test-collection-card-no-isolated.mjs`: passed all 14 browser/API phase checks (`artifacts/records-smoke-fix-card.log`). Includes full-card precision, 50+1 pagination, filters, tampered/missing/historical data, mobile, logout and admin/user out-of-scope denial.
- Both real-app runners confirmed their processes stopped and removed only their temporary synthetic application/database directories. Existing local and production data, receipts and uploads were not used.
- Six focused compact/full browser cases passed in light/dark at 1366/1024/768px (`artifacts/records-smoke-fix-visual.log`); strict standalone TypeScript check of the browser spec passed.
- Focused smoke/Card harness tests, script syntax, repository hygiene, tracked secret scan and `git diff --check` passed.
- Complete `npm run test:scripts`: exit 0; 658 MJS tests passed with one existing platform-conditional skip, and all 63 TS script tests passed (`artifacts/records-smoke-fix-scripts.log`).
- Final changed-file secret guard and diff checks passed. Independent review confirmed the original assertions remain intact and identified the legacy reproduction compatibility caveat; the explicit mode split above resolves it without weakening current-build verification. The old historical build itself was not rerun.

Next: commit and push the authorized fix, then confirm local/remote alignment. All test/build sessions finished and both temporary database fixtures were cleaned up by their runners. GitHub CI still needs a new run after push; do not report it green based only on these local checks.

## Portable continuation

This file provides durable context when the same checkout is available to another account. Chat state, active goal state, credentials and tool permissions are not assumed to transfer. Inspect Git status rather than relying on old session/agent IDs. Local artifact logs are ignored and may not exist in another clone; repeat relevant tests if unavailable.
