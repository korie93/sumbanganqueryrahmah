# Collection frontend and receipt-viewer handoff

Updated: 2026-10-15. Status: implementation and scoped verification complete.

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
secrets. No required implementation work remains in this goal.

Chat and goal state do not automatically transfer between accounts. This file is
the durable handoff; the user can ask the new account to review it and perform a
specific next action. The current commit/push is approved; future changes and
production deployment still require appropriate explicit user direction.
Ignored visual evidence does not travel with Git: copy the scoped artifact folder
when moving machines, or regenerate its captures/tests before claiming it exists.

## Implemented

- Save: balanced payment grid, neutral completeness guidance, correction details
  open for real errors, concise receipt upload copy. Matching behavior unchanged.
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
