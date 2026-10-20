# SQR Single Active Tab — IMPLEMENTED, LOCAL FEATURE QA PASSED

Updated 2026-10-20 (Asia/Singapore). Baseline HEAD at start:
`753c7e029513e8095f7dbe5eecce6a1cbe494ae4` on `main`.
Local feature acceptance is complete. No remote CI, commit, push or deployment
is claimed. A broader pre-existing OSP PostgreSQL performance test timed out;
full backend-suite green is NOT claimed and no OSP test/implementation was changed.
Do not assume a persisted Codex goal was created; inspect current goal state if
the user asks to continue it.

## User-authorized scope

Implement the attached `SQR_Single_Active_Tab_FINAL.zip` in the real SQR auth
lifecycle: one active tab per backend account ID in the same browser profile and
origin, using atomic Web Locks. Keep existing business/auth/role behavior. Gate
before protected app hooks/API/WS mount. Unsupported browsers fail closed. Use
real SQR logo and approved BM text. Browser QA must use local synthetic data;
no production or existing app data access. Commit/push/deploy require separate request.

Reference package:
`C:/Users/Administrator/Downloads/SQR_Single_Active_Tab_FINAL.zip`.
Read its `docs/IMPLEMENTASI_CODEX.md` and applicable repository/skill instructions
yourself before continuing. Root agent has been performing that specification
and Product Design workflow; this handoff is not a replacement for the source.

## Current files and responsibilities

New implementation already present in the shared working tree:

- `client/src/lib/singleTabLock.ts` and `.test.ts`: exclusive non-queued Web Lock
  per internal account ID, lifecycle ownership, fail-closed support/error paths.
- `client/src/components/auth/SingleActiveTabGate.tsx`, `.css`, and
  `single-active-tab-gate.test.ts`: approved BM blocked/checking UI, real-logo
  prop, protected-child mount guard, abortable `onBeforeActivate`, account key,
  pagehide/BFCache handling, reduced motion and scoped CSS.
- `client/src/app/session-validation-account-guard.ts` and `.test.ts`:
  distinguishes same account, changed backend ID and absent backend ID.
- `client/src/app/useAppShellSessionValidation.ts`: invokes optional
  `onAccountChanged(nextUser)` before accepting a different account. Missing ID,
  missing callback or callback error uses local `setUser(null)` without logout,
  shared cookie clearing or broadcast. Same-account profile/RBAC logic stays.
- `client/src/app/useAuthenticatedAppState.ts`: forwards that optional callback.
- `client/src/App.tsx`: outer `SingleActiveTabGate` before lazy Entry, using the
  existing `SQR_BRAND_ASSETS.transparentIcon` and backend `user.id`.
- `client/src/app/AuthenticatedAppEntry.tsx`: forwards identity changes to the
  outer boundary; old `useSingleTabSession(username)` invocation removed.
- `client/src/app/single-tab-session-validation.ts` and `.test.ts`: bounded
  abortable `/api/me` adapter used for bootstrap and every lock grant; no generic
  API forced-logout side effects. Rejects missing ID, banned/inactive accounts,
  auth failures and late responses; active forced-password workflow is preserved.
- `client/src/app/usePublicAppState.ts`: verified same-ID profile updates,
  different-ID boundary rebind/role-home navigation, passive forced-logout listener
  without cookie clearing or rebroadcast.
- `client/src/app/single-active-tab-boundary.test.ts`: AST/source lifecycle
  regressions, including protected lazy entry, StrictMode and bootstrap cleanup.
- `scripts/lib/single-active-tab-fixture.mjs`: local synthetic HTTP/WS fixture
  for the actual built frontend, with optional bounded stdin controls (no HTTP
  control endpoint). `scripts/tests/single-active-tab-fixture.test.mjs`: 8 tests.
- `scripts/single-active-tab-browser.mjs`: actual native-Web-Locks browser suite,
  exposed as `npm run test:auth:single-tab-browser`; 17/17 checks passed including
  four viewport/theme axe WCAG A/AA runs. CI step and artifact upload added.
- `tests/visual/personal-account-security.spec.ts`: hold the third identity read
  (protected session validation), not the new pre-mount second read; original
  profile-race assertions retained and all four affected browser tests passed.
- `docs/single-active-tab.md`: audited boundary, evidence and security limits.

Root's integration and feature/browser verification are complete locally.
Inspect current files/status rather than repeating finished work.
Required result: backend identity revalidation before every activation/recheck,
identity-change callback returns through the outer boundary, and gate stays
mounted during ordinary SPA navigation. The old `single-tab-session.ts` reload
helpers still have callers; do not delete blindly or reintroduce them as ownership.

## Verified results and limits

- Account/profile targeted tests: **12/12 passed**, no skips.
- Targeted ESLint for those four account guard/plumbing files: passed.
- Targeted `git diff --check`: passed (normal LF/CRLF Git warnings only).
- Gate contract tests: **5/5 passed**, reported by its implementing agent.
- Actual built two-tab browser suite: **17/17 passed**; report at
  `artifacts/single-active-tab-browser/report.json`.
- Includes a formerly active document switching accounts with a populated
  protected query cache. It acquires the new ID and clears its local old-account
  query data before protected mount; no other tab/session/cache is cleared.
- Full client tests: **2,198/2,198 passed**; fixture Node tests **8/8**, affected
  personal-account browser regressions **4/4**.
- Build, typecheck, client/server lint, bundle/breakpoint/JSON/entry contracts and
  secret scan/repository hygiene passed. `test:scripts`: **765 passed, 1 skip,
  0 failures**, with inherited LOG_FORMAT removed only from the child environment,
  dotenv disabled and loopback port1. Evidence: `script-tests-final.log`.
- Existing backend: auth 164 passed/1 skipped; HTTP 384 passed/23 skipped;
  services 674 passed; repositories 406 passed/2 skipped/1 cancelled (existing
  100k-account OSP isolated PostgreSQL performance test hit its 120-second timeout).
  Remaining routes 489, WS 106, intelligence 12 and API contracts 124 passed
  separately with dotenv disabled and loopback port1 synthetic DB configuration.
- No production, app database, receipts/uploads, environment files, migration,
  dependency or business rules changed. The broad repository suite's isolated
  performance fixture is NOT the production/application DB; it creates its own
  uniquely named disposable database. Do not call the full backend suite green.
- Product Design source/implementation comparison and desktop/mobile screenshots:
  `artifacts/single-active-tab/source-vs-implementation.png`,
  `artifacts/single-active-tab-browser/blocked-light-1440.png`,
  `artifacts/single-active-tab-browser/blocked-dark-320.png`; QA in `design-qa.md`.
- Native BFCache eligibility across engines was not certified: the persisted
  pagehide/pageshow handler was tested using explicit synthetic lifecycle events.

Local synthetic preview may still be running at `http://127.0.0.1:5198`.
Two same-browser tabs are needed to see the blocked page. If stopped, after build:
`node scripts/lib/single-active-tab-fixture.mjs --serve --port 5198`.
Never confuse this synthetic preview with the production SQR server.

## Handoff / remaining release work

1. Inspect `git status`, current goal state if relevant, all in-progress source
   and the latest messages/artifact logs. Preserve unrelated/user changes.
2. Feature/browser work above is finished; do not redesign or restore the legacy
   hook. Preserve the ownership-before-protected-effects boundary.
3. If requested to prepare a release, investigate/rerun the unrelated existing
   isolated OSP performance timeout and run remote CI after an authorized push.
   Do not weaken its assertions, increase timeouts or change OSP business logic
   just to conceal that result.
4. Commit/push/deploy only if the user requests them. No release action is
   automatically authorized by this implementation request.
5. Use the synthetic browser runner for repeats; run heavy jobs serially. Do not
   use production credentials or an existing application DB as a fixture target.

## Critical cautions

- Backend fresh login revokes older sessions; normal second-tab entry must reuse
  the shared session `/api/me` instead of logging in again.
- Outer App and inner authenticated state initially have separate user state:
  a changed `/api/me` ID must re-enter the gate, never update protected state
  under the previous account's ownership.
- A blocked tab's close/retry/cleanup must never call logout or clear the shared
  auth hint cookie. Preserve owner idle/kick/ban behavior.
- Web Locks coordinate only same-origin/storage-partition contexts. No atomic
  cross-browser/device backend lease is implemented; explicitly report that limit.
- Do not read `.env`, secrets or production data. No database/schema changes or
  new dependencies are needed for this scope.

## Latest user-approved visual polish — 2026-10-20

- Removed the selected third benefit, then polished the existing blocked-tab
  page's alignment, widths/heights, spacing and type. Preserve both remaining
  messages, actual Q, supplied illustration and mandatory BM copy.
- `SingleActiveTabGate.css`: calmer heading, consistent line heights/gaps,
  equal 156x48px desktop actions, phone equal-width/stacked actions, single-column
  tablet through 1023px and safe illustration/caption clearance. No gate lifecycle
  or auth/backend changes in this pass. Main card at 722px is about 74px shorter.
- `scripts/single-active-tab-browser.mjs`: geometry checks at 10 widths from
  320–1440px in both theme preferences; same strict ownership/data isolation checks.
  Semantic main/h1 checks wait for the existing boot-shell's next-frame removal
  instead of racing it. No production assertion was removed or weakened.
- Final build/browser run **17/17**, gate tests **6/6**, targeted ESLint, syntax,
  breakpoint contract and diff whitespace checks passed. Axe at 320/1440 under
  both preferences: zero violations. Full client/backend suites were not rerun
  for CSS polish; previous broader-suite caveats above remain in force.
- QA notes: `design-qa.md`, `docs/single-active-tab.md`. Visuals:
  `artifacts/single-active-tab/polish-final.png` and `polish-before-after-722.png`.
  Reports: `polish-build.log`, `polish-browser.log`,
  `artifacts/single-active-tab-browser/report.json`.
- Codex IAB preview remains local/synthetic at `/collection/records` on port5198;
  a hidden owner tab keeps the visible second tab blocked. Viewport override reset.
  Nothing committed, pushed or deployed; wait for explicit user release request.

## CI accessibility fix after feature commit — 2026-10-20

- Feature/polish committed and pushed as `9ac9f71e` on main. CI `39343538985`
  failed at Run accessibility contracts with `collection-save/desktop: page is
  missing a heading`. The scanner captured the transient checking gate's main,
  not the Collection route. Build/unit/coverage jobs were successful in that run.
- New dependency-free `scripts/lib/ui-protected-route-readiness.mjs` waits for
  the actual visible protected workspace main. Both a11y and visual entrypoints
  call it after each authenticated navigation, before their unchanged scans.
  No frontend/security/ownership behavior or axe assertion was weakened.
- Added delayed-activation actual-built regression: generic checking main with
  zero headings must not start scanning; released ownership mounts real
  Collection; blocked/unsupported gates fail readiness. Browser suite **18/18**.
- Added safe `SQR_REDESIGN_A11Y_ONLY=1` mode to the existing fresh-cluster fixture.
  Exact CI a11y entrypoint **passed** with real built app, synthetic accounts and
  59 records; owned app/cluster stopped and temporary data removed afterward.
- Exact CI visual-layout entrypoint also **passed** in a separate fresh cluster,
  including Dashboard detail/focus and operational stress viewports. Cleanup
  confirmed; log `artifacts/single-active-tab/ci-a11y-visual-regression.log`.
- Script tests **770 passed /1 existing skip /0 failures**; targeted ESLint and
  syntax passed. Evidence: `artifacts/single-active-tab/ci-a11y-isolated.log`,
  `ci-a11y-tab-regression.log`, `ci-a11y-script-tests.log`.
- This CI follow-up is not committed/pushed or deployed. Preserve its changed
  scripts/helper/tests/docs; wait for explicit user release authorization. Remote
  CI has not yet run the follow-up patch. Previous release caveats remain above.
