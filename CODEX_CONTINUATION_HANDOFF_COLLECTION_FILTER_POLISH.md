# View Rekod Collection — search-first filter polish

Updated: 2026-10-12 (Asia/Singapore)
Status: COMPLETE — implementation and local verification passed; publication history is recorded in Git. Not deployed by this task.

## Authorization and goal

User approved the preceding proposal and requested a completion goal plus a
portable handoff for another account. Implement always-visible Search, hidden
optional filters, complete active-filter indicators and compact summary/actions.
Polish desktop/mobile, keyboard and light/dark without changing records, matching,
permissions, API requests, export scope, pagination or backend. The original
implementation request did not authorize publication or production access.
Follow-up on 2026-10-12: user explicitly authorized commit and push of this
completed change, including its handoff. Deployment/production cleanup remains
outside this request.

Baseline: clean main at c259718b305a95354c9f78873aee613c3fd5f6d5. That release
was previously deployed and verified; production is not needed for this task.
Read AGENTS.md; do not read/print .env or credentials. Preserve unrelated edits.

## Implementation plan

- Search remains outside filters at every viewport. Keep its text semantics,
  identifier precision, debounce and existing ID conventions.
- Desktop Penapis toggles an accessible disclosure; mobile uses existing sheet
  without a duplicate Search field. Filters start closed and keep values when
  closed. Existing Filter action refreshes and closes, preserving fetch logic.
- Complete chips/count/reset for date, nickname/team (permission-gated), source,
  aging, classification and nondefault sorting. Search has its own removable
  chip but is excluded from the nonsearch filter count. Use authorized option
  labels and generic fallbacks, never raw unavailable source/team IDs.
- Compact two semantic totals and View All/Export without hiding export scope,
  disabled reasons, loading state, purge guards or pagination.
- Preserve Ringkas/Lengkap, record actions, receipt return and overlay focus.
- Update browser/smoke assumptions about always-expanded filters. Add regression
  and responsive tests; verify build, types, lint, scripts and affected browser
  flows proportionately. No skipped assertions, relaxed security or timeouts.

## Work ownership (inspect current files after continuation)

- Root: Page/Filters/Search/chip model and unit tests; integration and handoff.
- records_compact_toolbar: Toolbar.tsx and Toolbar.test.tsx only.
- records_filter_browser_tests: tests/visual collection/app plus dedicated tests.
- records_final_safety_review: scripts browser/smoke compatibility and tests.

## Checkpoint

Implementation integrated: new always-visible controlled Search; shared open
state for desktop disclosure/mobile sheet; complete normalized chip model;
compact toolbar; retained controls after close; valid Filter/Reset closes and
restores focus; invalid dates stay open. Search, query hooks, backend, exports
and authorization are not changed. Chips remove only their own selection;
Clear all retains existing Reset semantics. All smoke/browser callers were
updated to use the external Search and explicit optional filter toggle.

Static independent review found a shared sm:h-9 override on Search; fixed with
sm:h-11. No other blocking finding. Browser resize/nested focus passed in the
final suite. Two delegated agents reached usage limits after partial
edits; root reviewed/finished their work; do not wait on them.

Final verification:
- npm run typecheck and npm run lint:client: pass again after all edits
  (artifacts/filters-polish-typecheck-final.log, filters-polish-lint-final.log).
- npm run build: pass; final rebuild after height/skeleton polish also pass
  (artifacts/filters-polish-build-final.log). Existing PostCSS `from` warning.
- Final focused Filters/Search/Toolbar/chip/overlay/decorative-icon tests:
  32 pass (artifacts/filters-polish-focused-final.log), including the TSX tests
  not discovered by the standard test:client runner.
- npm run test:client final: 1,916 pass, 0 fail
  (artifacts/filters-polish-client-final.log). Updated stale decorative Reset
  icon assertion to verify the actual external Search icon instead.
- npm run test:scripts: 658 pass + 1 existing opt-in skip; 63 additional TS
  script tests pass (artifacts/filters-polish-scripts.log).
- Focused smoke/runner unit contracts: 43 pass.
- Initial browser run: 26 pass, 2 new test expectation failures. Reset correctly
  used existing unfiltered cache, so asserting a new network request was wrong.
  Fixture now has a second source; assertions verify restored records and a new
  subsequent query has no hidden filters. No runtime cache behavior was changed.

- Final Playwright: 57 passed, 0 failed (artifacts/filters-polish-visual-final.log).
  Light/dark 320/390/768/1280/1920, complete chips, invalid date correction,
  nested popup Escape, desktop/mobile resize, role visibility, record modes,
  pagination/export scope, receipt return/focus and inline edit validation.
- Real built app smoke using fresh owned PostgreSQL: PASS, exit0
  (artifacts/filters-polish-smoke.log; artifacts/frontend-redesign/baseline-0PqUak).
  Login/navigation, stale deletion, Manual Verified ABORT, Billing exports,
  collection receipt flow, backup/restore fixture and logout all passed.
- Real isolated Card No harness: PASS, exit0 (artifacts/filters-polish-card-no.log;
  artifacts/collection-card-no/run-bXIHP7). Verified exact identifiers/leading
  zeros, 50+1 pagination, historical/tamper paths, filter intersections, mobile
  external Search, logout and admin/user out-of-scope rejection.
- Both temporary app/PostgreSQL fixtures stopped and removed by their own
  provenance-checked runner. Existing application data was never used.
- Secret guard over all changed/new files: PASS. git diff --check: PASS.
  Only .env.example is tracked; no secret/env/backend/dependency/workflow edits.
- Visually inspected report captures: 320 light open and long-source chip,
  1280 light collapsed, 768 dark open, 1920 dark collapsed. Controls align,
  text/chips remain bounded, optional filters leave room for records.

## Repeat key checks

Use a sanitized process environment (OS support keys only); point
DOTENV_CONFIG_PATH to an absent artifacts/filters-polish-no-dotenv.env and
PG_HOST=127.0.0.1, PG_PORT=1 for build/unit checks. Windows sandbox may prevent
tsx userInfo/spawn; use approved local process access, never disable safeguards.

```text
npm run typecheck
npm run lint:client
npm run test:client
npm run test:scripts
npm run build
node --import ./scripts/lib/register-client-css-test-loader.mjs --import tsx --test client/src/pages/collection-records/CollectionRecordsFilters.test.tsx client/src/pages/collection-records/CollectionRecordsSearch.test.tsx client/src/pages/collection-records/CollectionRecordsToolbar.test.tsx client/src/pages/collection-records/tests/collection-record-active-filters.test.ts client/src/pages/collection-records/tests/collection-record-overlay-focus.test.ts client/src/pages/collection/tests/collection-decorative-icons-a11y-contract.test.ts
node scripts/test-visual-built.mjs --grep "Collection filter disclosure|Collection advanced filter chips|Collection layout polish|Collection record|Collection return|Collection inline validation" --workers=1
```

For smoke only, set SQR_REDESIGN_SMOKE_ONLY=1 in a clean process and run
`node scripts/test-frontend-redesign-isolated.mjs`. In a separate clean process,
run `node scripts/test-collection-card-no-isolated.mjs` (without legacy
--expect-missing-card). Runners create fresh loopback fixtures; never substitute
production credentials/URLs. No snapshot baselines were regenerated.

No required implementation/verification work remains. Commit/push is authorized
by the follow-up above; inspect Git history and origin/main for its publication
state. Deployment still needs a separate user instruction. Local passing checks
are not a claim that remote CI passed or production was updated.

## Portable continuation

This file records durable scope and progress when another account can access
the checkout. Chat state, goal state, tool permissions and credentials are not
assumed to transfer. Update this file with changes, exact test evidence and
remaining actions before ending work. Mark the goal complete only after all
required implementation and verification are finished.
