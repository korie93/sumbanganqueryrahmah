# General Search width and height — continuation handoff

## Goal and scope

The user approved recommendations 1 and 2 on 2026-10-07 and requested a goal.
Goal: widen desktop General Search results with the existing 1480px
report preset, retain readable search controls, adapt table maximum height to
viewport space, and synchronize low-spec virtualization with measured geometry.
Implementation and local verification complete on 2026-10-08 (Asia/Singapore).
All scoped completion gates passed; no implementation work remains in this goal.

Do not expand into loading-state redesign or Import Column Mapping, which were
other recommendations but not the proposed first phase. Preserve existing search
requests, query matching, filters, permissions, exports, pagination and mobile
cards. No new packages, backend or schema changes. No commit, push or deployment
without separate authorization.

## Starting state

Workspace: `C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah`.
Baseline commit: `7e99b17a51b4a2dc86d54c28eececa142dce85c2`.
The dependency security/audit patch is already present, uncommitted and verified
under `CODEX_CONTINUATION_HANDOFF_DEPENDENCY_AUDIT_OCT07.md`. Preserve it; it is a
separate task, not part of this UI change. Never read or commit `.env` secrets.

## Implemented changes

- `GeneralSearch.tsx`: report-width frame, capped header, route-scoped CSS.
- `GeneralSearchDesktopControls.tsx`: preserve 1152px maximum control width.
- `general-search-layout.css`: content-driven viewport max-height between 10rem
  and 52rem, based on safe viewport height minus 26rem for surrounding controls.
  Page scrolling remains possible for expanded filters/zoom. No page-scroll
  listener that continually resizes the table while scrolling.
- `HorizontalScrollHint.tsx`: optional external ref for its existing scroll
  viewport; default behavior and one scroll owner preserved.
- `GeneralSearchResults.tsx` / `GeneralSearchDesktopResultsTable.tsx`: desktop
  virtualization colocated with actual viewport, row and sticky header measurements;
  ResizeObserver and resize fallback with cleanup; actual scroll resets on page
  data changes. Mobile list still receives all page results.
- `general-search-results-utils.ts`: measured geometry with safe defaults and
  clamped virtual windows after resize/result-count changes; unit coverage.
  Sticky header height reduces visible body height, not the body's scroll offset.
  Fractional spacer heights are retained and browser scroll anchoring is disabled
  only for the virtual table to prevent spacer-induced jumps.

## Verification on the current source

All test data is synthetic and local. The implementation/verification phase did
not access production SSH, production databases or account credentials, and did
not commit, push or deploy. See the separately authorized follow-up below.

- Full client test inventory: **1,821 passed**, zero failures/skips (419 files).
- Full script test inventory: **708 passed, 1 skipped**, zero failures (119 files).
  The existing optional HEAD Viewer hook diagnostic is gated by
  `SQR_REDESIGN_BASELINE_HOOK_PROBE=1`; it is not a product regression.
- Full TypeScript `--noEmit` and frontend ESLint: passed.
- Production build (client/server), system-status/CSP checks, sourcemap gate:
  passed. Build ID `sqr-1.0.0-7e99b17a51b4-20261007T225246Z`, source dirty as
  expected for an uncommitted patch; this is a local build, not a release.
- Bundle budgets, spacing/color token contracts, breakpoint contract, repository
  hygiene and secret scan: passed.
- Independent read-only review: no remaining blocker. No API, auth, export or
  data semantics changed. Shared horizontal-scroller defaults are unchanged.
- Final combined built-browser run: **39 passed in 3.3 minutes**, zero failures
  or skips (2026-10-07T22:56:27Z). It covers eight new
  General Search cases, 29 existing Collection/Billing/Monthly polish cases,
  and two existing authenticated-shell/dashboard/table-navigation checks.
- Final screenshots manually inspected: short light desktop, wide dark results
  and 320px light mobile. Controls/cards remained readable and bounded; the wide
  results table retained its own horizontal scroll and reachable pagination.
  Screenshot/HTML-report evidence is in `artifacts/playwright-test-results/` and
  `artifacts/playwright-report/`; no golden snapshot was changed.

Use serial low-concurrency heavy checks on this Windows machine. Existing ignored
artifact runner `artifacts/general-search-layout-verify.mjs` supports `client`,
`scripts`, `lint`, `typecheck`, `build`, `contracts` and `browser`. Each mode writes
`artifacts/general-search-layout-<mode>.log` and a timestamped `-result.json` on
success. Check exit status and timestamps; an old result file alone is not proof.
Client/script inventories are run in batches of at most 40 files, concurrency 2.
The same client inventory is used by the repository's regular client test script.

Windows sandbox tsx can fail at `os.userInfo`; esbuild may also need access to
ancestor-directory metadata. Approved outside-sandbox local verification passed.
An initial React 18 ref-nullability type error was fixed before the final checks.
The browser fixture now explicitly mocks existing superuser dashboard-prefetch
requests instead of weakening its unexpected-request guard. No real API fallback
or snapshot-baseline update was introduced.

## Regression evidence by requirement

| Requirement | Coverage |
| --- | --- |
| Wider results, readable controls | SSR report-width contract; browser compares 1366x600 and 1920x1080 in light/dark, verifies 1480px/1152px caps |
| Adaptive maximum, compact few-row results | CSS/source contract and built-browser geometry checks; short results retain natural height |
| Correct low-spec virtualization | Unit cases for fractional metrics, invalid defaults, stale offsets and visible-body coverage; browser scrolls middle/end, resizes both ways and enlarges text |
| Navigation and record details | Sticky header, horizontal first/last column, pagination, page-size reset, dialog selection and restored focus |
| Mobile and permission continuity | 320px/390px light/dark user cards, no page overflow, hidden source-file/export UI; controller/backend unchanged |
| Shared scroller continuity | Default SSR markup equality, existing contract tests, existing module browser regressions |

New tests: `client/src/pages/general-search/general-search-layout.test.ts` and
`tests/visual/general-search-layout.spec.ts`. Extended geometry and shared-scroll
tests live beside the existing utilities/components. The built-browser fixture
requires HTTP loopback, mocks every expected API, blocks unexpected off-origin
requests/WebSockets, and reports page errors. It is not an authenticated live
production smoke test and does not establish remote CI or production health.

## Handoff / next authorized step

No remaining implementation or local-verification work for this scoped goal.
On 2026-10-08 the user separately authorized commit and push of the completed
work. The dependency/audit patch and this UI patch are grouped as separate
commits; inspect Git history/remote state for the result. Deployment is not
authorized by that follow-up. Preserve the dependency/audit patch and its handoff;
do not mistake those pre-existing files for General Search changes.

The General Search patch consists of seven production files (page, desktop
controls, results wrapper/table, geometry utility, route CSS and optional shared
scroller ref), four test files, and this handoff. No backend, schema, dependency,
global design-token or workflow change was introduced by this UI task.

For a portable focused recheck after checkout/build:
`npm run test:visual:built -- --grep "General search layout" --workers=1`.
Use the normal project lint/typecheck/client/scripts/contract/build commands for
the other gates; the ignored low-concurrency runner is a local convenience only.

A portable repository handoff helps another account continue; automatic transfer
of chat/goal state between accounts is not assumed. Read this file, inspect the
current worktree and timestamped evidence, then continue only the unfinished scope.
