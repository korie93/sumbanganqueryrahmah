# Collection frontend and receipt-viewer handoff

Updated: 2026-10-15. Original polish committed/pushed as `9e63a5db`.
Follow-up: reported CI visual-stage failures fixed and full local verification
complete. The user approved committing and pushing this follow-up on 2026-10-15;
this handoff accompanies the CI repair commit. Check Git for the current SHA.

## User-approved goal and boundaries

Finish the approved Product Design improvements to Collection and receipt preview:
compact, clear, responsive and accessible, while preserving APIs, permissions,
automatic matching, financial formulas and receipt originals. The user approved
local Playwright using synthetic data and explicitly requested a goal plus a
cross-account handoff. The goal is complete once the final QA is recorded.

The implementation turn did not commit, push, deploy or clean production. The
user subsequently approved commit and push on 2026-10-15; this handoff accompanies
that Collection polish commit. Production deployment/cleanup is not authorized by
that approval. Do not reuse credentials from earlier conversation history.

## Starting from another account

Open this same local repository, then read this file, `AGENTS.md`,
`docs/collection-frontend-polish.md` and the latest Collection section of
`design-qa.md`. Inspect `git status --short`. Collection polish files belong to this
feature commit; preserve any later unrelated user work and never commit environment
secrets. The original goal is complete, but the newly reported CI follow-up must
be checked against the section below before claiming the latest state complete.

Chat and goal state do not automatically transfer between accounts. This file is
the durable handoff; the user can ask the new account to review it and perform a
specific next action. The current commit/push is approved; future changes and
production deployment still require appropriate explicit user direction.
Ignored visual evidence does not travel with Git: copy the scoped artifact folder
when moving machines, or regenerate its captures/tests before claiming it exists.

## Implemented

- Save: balanced payment grid, neutral completeness guidance, correction details
  open on explicit submit errors, concise receipt upload copy. Matching behavior unchanged.
- Records: outside search and folded filters retained; both date controls expose
  persistent inverted-range feedback.
- Summary/Monthly/Daily: current-month emphasis and tabular figures; supporting
  analysis/tools use disclosures, all seven display modes retained, important
  dirty/conflict/attention feedback visible, browser-print contents revealed.
- Billing OSP: Movement (pp), semantic sticky Aging row headers and total emphasis.
- Nickname Summary: draft/applied state separated; refresh events use last-applied
  scope and do not interrupt Apply; long names wrap on mobile.
- Manage: compact heading, clear group/assignment sequence, explicit labels and
  existing guarded action menus.
- Receipts: filename choices, pressed state, compact Fit/zoom/rotate toolbar,
  genuine mobile zoom and reachable rotated edges, keyboard-scrollable details,
  single PDF action set, accessible retry/loading/error state, safe original-file
  downloads and request/object URL cleanup retained.
- React development StrictMode setup restores the validated image/PDF source
  after simulated cleanup. Actual unmount cleanup remains. Native PDF frames do
  not use a potentially indefinite native-load overlay; fetch loading remains.

No backend/shared API, dependencies, env files, database or receipt data changed.

## Verification completed

Evidence: `artifacts/collection-polish-20261015/` (ignored, local synthetic data).

- Final normal frontend command: **2017/2017** passed, no skips/failures
  (`client-tests-ci-final.log`, batches 1186 + 831).
- Scoped TSX presentation cases: **28/28**. They now run through
  `client/src/pages/collection/tests/collection-polish-presentation-regressions.test.ts`
  using the existing CSS test hook. The ordinary runner otherwise only discovers
  `.test.ts`; remove the scoped aggregator if broad discovery later includes TSX.
- Script suite: **727 passed**, one existing skip, no failures using an isolated
  test environment (`script-tests-clean-env.log`).
- Final stable built browser suite: **60/60** passed, no retries/skips/failures
  (`final-combined-browser.log`; `final-combined-report/index.html`;
  `final-combined-results/`). Includes real dev StrictMode readiness/cleanup,
  receipts/rotation/keyboard/PDF original bytes/retry, Billing, Monthly/print,
  Daily permissions/modes, Nickname background refresh, layouts and snapshots.
- Separate report 15/15 and initial navigation 14/14 passed. Focused form/scope
  regression runs are recorded in `form-and-scope-verification.md`.
- Full client lint, application TypeScript and browser-spec semantic TypeScript
  passed. Production build `sqr-1.0.0-315a657a50ce-20261015T013713Z` passed.
- Token spacing/colors, breakpoint/storage, bundle budgets, sourcemap gate,
  repository hygiene, secret guards and `git diff --check` passed.
- All five visual fidelity surfaces, full and readable focused before/after
  comparisons, mobile/light/dark states inspected. Final QA result: **passed**.
- Only two intentional Save light/dark snapshot baselines changed after reviewing
  expected/actual/diff images. Other six PNG hashes are unchanged; audit in
  `save-baseline-hashes.json`. Do not broadly rebaseline or loosen tolerance.

An exploratory all-57-TSX run without its CSS hook exposed seven CSS-loader errors
and an unchanged legacy RoleGuide capitalization assertion. That broad command is
not claimed green. Correctly configured task-specific tests are green; unrelated
legacy tests were not altered. The initial dotenv script-test failure was fixed
by isolating the test environment, not editing user env or bypassing validation.

## Recheck commands if code changes

```powershell
npm run test:client
npm run typecheck
npm run lint:client
npm run build
npm run test:visual:built -- --grep 'Receipt viewer|Billing receipt polish|Monthly|Report controls|Collection desktop navigation|Collection layout polish|authenticated pages match' --workers=1
git -c core.safecrlf=false diff --check
```

Run only one shared Playwright reporter at a time, preserve its report, and never
rebuild `dist-local` during a browser run. On this host Node/tsx sometimes needs
narrow sandbox escalation for Windows account lookup; do not change code to work
around that host restriction. Script tests need a non-existent task-specific
`DOTENV_CONFIG_PATH` with `NODE_ENV=test` rather than the user's dotenv.

## Local preview and limitations

Preview: `http://127.0.0.1:51103/collection/records`, read-only fictional fixtures.
Ignored helper: `artifacts/collection-ui-audit-preview.mjs`; session50488, PID464.
The older session56166/port53909 was stopped. Vite watcher is disabled in this
helper, so restart it after source changes to avoid stale transform caches.
Ports/sessions may not survive account/app restarts; probe before starting one.
Main IAB tab3 is the user-facing preview; re-mark it deliverable in later turns.

No real-database save, production deployment, remote CI/release-readiness,
physical-device/GPU measurement or complete WCAG/native PDF-engine certification
is claimed. Synthetic preview aggregates are not formula validation evidence.

## CI follow-up: run 38669128827

The pushed `9e63a5db` CI visual stage failed 10 tests; 347 passed. There were no
pixel-baseline mismatch failures. Root causes and fixes:

- Mobile sticky actions covered matching Retry at 390px. Error/no-match actions
  now use normal flow; existing bounds remain and a painted hit-target check was
  added. Ordinary/keyboard behavior remains unchanged.
- Dynamic review wrapper remounted correction controls, and auto-expansion on
  blur moved Reset mid-click. Keep one native details container and expand only
  on explicit submit failure/complete fields. Inline blur errors remain.
- Guidance tests now explicitly open the intentionally folded correction list.
  Focus, privacy, suspended-access and unsaved-work assertions stay intact.
- Nested nickname Popover/Sheet Escape tests wait for restored focus before the
  second Escape; draft/applied/background-refresh assertions are unchanged.
- Receipt fixtures recognize Chrome's exact built-in PDF extension and internal
  resource host, with regression tests rejecting external/lookalike/credential/
  port URLs. Synthetic storage setup runs only in the top-level app origin.

Evidence: ignored `artifacts/ci-38669128827/`. Original CI evidence is under
`evidence/artifacts/playwright-test-results/`. Current focused results show all
form/matching/report cases green; the final four PDF/StrictMode tests pass on
installed Google Chrome. The complete suite passed **357/357**, no retries,
failures or skips, in 17.7 minutes (`full-chrome.log`, `full-final-report/`,
`full-final-results/`). All 10 cases that failed remotely pass in this run.
Current application and affected browser-spec TypeScript, full client lint,
client tests **2017/2017**, script tests **729 passed + one existing skip**,
bundle budgets, secret guard and diff checks are green. Browser specs are
covered by semantic TypeScript; the repository ESLint config targets app code,
not Playwright specs. No baseline PNG, tolerance, timeout or workflow changed.

The ignored runner `verify-local.mjs --full` uses static frontend only, loopback,
installed Google Chrome and fresh synthetic environment; it never loads dotenv
or starts a backend/database. `verify-checks.mjs` records static/unit checks.
QA inspected same-input light/dark CI-before/local-after comparisons and actual
in-app Reset/correction interactions; the latest `design-qa.md` result is passed.
Current synthetic preview is `http://127.0.0.1:51974/collection/save` (session61263,
PID9156, IAB tab3). The older preview session50488 was stopped; treat its earlier
51103 URL above as historical. Verify any process/port before reusing it.

All required local CI-fix work is complete. The user approved commit/push for
this follow-up; production deployment is not authorized. Remote GitHub CI must
be checked on the new commit after push; a full backend/database/deployment
smoke run is not claimed. Never restart shared
Playwright reporting or rebuild dist-local during another browser run.
