# Single active tab: implementation and verification

Status: implemented; local feature acceptance passed. Updated 2026-10-20
(Asia/Singapore). Uncommitted/unreleased: this is not a remote CI or deployment
certificate. The broader existing PostgreSQL OSP performance test timed out;
do not describe the entire backend suite as green.

## Scope and ownership boundary

The requirement is one active SQR tab for one authenticated account within the
same origin and browser storage partition/profile. Ownership uses an exclusive
Web Locks API request with `ifAvailable: true`. A blocked tab does not queue,
steal ownership, or become active merely because a heartbeat has expired.

`client/src/lib/singleTabLock.ts` owns the browser lock for the unresolved
callback lifetime. `client/src/components/auth/SingleActiveTabGate.tsx` renders
protected children only after ownership and backend revalidation succeed. The
gate is keyed by the backend account ID, starts in a checking state, releases on
cleanup/pagehide, and reacquires after a persisted pageshow. A stale asynchronous
attempt must never activate a disposed controller or a different account.

The integration boundary is `App.tsx`'s authenticated branch, outside and before
the lazy `AuthenticatedAppEntry`. This boundary remains mounted throughout
ordinary SPA navigation. It must not be moved inside a page, the authenticated
shell, or after `useAuthenticatedAppState`. `validateBeforeActivation` calls
`app/single-tab-session-validation.ts` on every granted lock. Its bounded,
schema-validated, read-only `/api/me` request deliberately avoids the generic API
client's forced-logout broadcast side effects. A fresh same-account profile is
forwarded before protected mount; another verified account returns through
`handleVerifiedAccountChanged` and rekeys ownership at its role's home route.
Before a document that previously owned another account/role mounts again, its
in-memory protected query cache is cleared after the new ID's lock and identity
are verified. This never changes another tab's cache, cookies or session.
Pre-gate bootstrap uses the same abortable reader. A failed or superseded read
does not clear the shared auth hint or broadcast logout. Banned/inactive payloads
fail closed; an active account requiring a password change retains that workflow.

Only the internal `user.id` returned by the existing backend login or `/api/me`
is an account key. Username, display name, JWT, sessionStorage snapshots and tab
IDs are not identity authorities. A missing backend ID must fail closed. On
recheck, acquire ownership and revalidate the existing backend identity before
mounting any protected child; a changed identity must return through the outer
boundary and acquire its own account lock.

## Audited integration map

| Existing surface | Behavior that must remain behind ownership |
| --- | --- |
| `app/usePublicAppState.ts` | Restore the shared cookie with `/api/me`; do not treat cached user data as proof of authentication. |
| `app/AuthenticatedAppEntry.tsx` | Mount `useAuthenticatedAppState` and providers only inside the new gate; stop using the old username lock here. |
| `app/useAuthenticatedAppState.ts` | Runtime configuration, role visibility, saved-import count, maintenance polling and navigation state. |
| `app/useAppShellSessionValidation.ts` | Accept same-account profile/RBAC updates; send a different verified ID to `onAccountChanged` without persisting it in the old runtime. |
| `app/single-tab-session-validation.ts` | Fresh bounded identity validation after lock acquisition, without forced-logout broadcast side effects. |
| `app/AuthenticatedAppShell.tsx` | Protected pages, AI context, predictive prefetch and AutoLogout. |
| `components/AutoLogout.tsx` | Activity heartbeat, idle timeout, forced logout subscription and native WebSocket `/ws`. |
| `components/auto-logout-socket-runtime.ts` | Kick, ban, logout, idle timeout and settings messages. This repository uses native WebSocket, not a Socket.IO client. |
| `app/AppPageRenderer.tsx`, `app/monitorAccess.ts` | Existing role and page access checks remain authoritative and unchanged. |
| `app/routing.ts` | State-driven SPA routing/deep-link resolution; no separate React Router loader pipeline was found. |

The old `app/useSingleTabSession.ts` uses a username/localStorage TTL heartbeat
and can fail open. The integrated Entry no longer imports or invokes it; it is
retained as unused compatibility code, not production ownership authority.
`app/single-tab-session.ts` also contains reload compatibility helpers
used elsewhere; retaining those helpers does not make localStorage an ownership
authority. Audit imports before removing any compatibility file.

## Session and security semantics

- A blocked tab never mounts sensitive routes, their hooks/loaders, activity
  heartbeat, API subscriptions or WebSocket. Authentication identity validation
  and non-sensitive public health/static assets are not protected business data.
- `Tutup Tab` only requests local browser closure. If browser policy refuses it,
  display the manual-close hint. Never invoke logout, clear cookies/storage, or
  release a different tab's lock.
- `Semak Semula` attempts a fresh non-queued atomic acquisition. It cannot replace
  an owner that is still active. Authentication is rechecked before activation.
- Normal logout, idle timeout, kick and ban stay in the existing owner lifecycle.
  Do not add logout calls to gate cleanup or blocked-page close.
- The outer public state passively observes existing forced-logout notifications
  so a blocked gate can unmount without mounting AutoLogout. This listener does
  not rebroadcast, clear cookies or send activity logout requests.
- Existing fresh login policy replaces prior backend sessions and closes their
  sockets. Ordinary second-tab entry must restore the current shared cookie, not
  silently submit another login. This work does not change that business policy.
- `clearAuthenticatedUserStorage()` clears a shared auth hint cookie. An account
  identity mismatch must use local fail-closed state, not that session-clearing
  function or a forced-logout broadcast.
- Missing/denied Web Locks, invalid IDs or ownership errors fail closed with
  understandable BM feedback. No heartbeat-only fallback is allowed.
- The UI uses the existing project logo via `logoSrc`; no replacement Q drawing,
  demo controls, test buttons or preview labels belong in production.
- CSS is scoped under `sqr-tab-*`, supports 320px+, keyboard focus and reduced
  motion. Do not assume these contracts replace real browser/accessibility QA.
- Initial acquisition is deferred one microtask so a discarded React StrictMode
  effect cannot briefly own the lock and falsely block its replacement setup.
- The identity reader makes no frontend logout/cookie writes. Backend `/api/me`
  retains its existing authentication, cookie refresh/expiry and activity policy;
  this change does not claim the HTTP endpoint is side-effect-free server-side.

Web Locks do not coordinate separate origins, browser profiles, browsers or
devices, and do not protect the server from a modified client or direct API call.
Atomic cross-browser/device enforcement would need a separately scoped backend
lease/session policy and server checks. That work is not implemented or claimed.

## Acceptance evidence — local, synthetic scope

- `npm run test:auth:single-tab-browser`: **17/17 grouped checks passed**, actual
  production build and native Chromium Web Locks. The suite records API requests,
  WebSockets and transient protected DOM mounts, and rejects unexpected endpoints.
  Evidence: `artifacts/single-active-tab-browser/report.json` and
  `artifacts/single-active-tab/browser-regression.log`.
- Verified two tabs, six protected deep links, recheck without stealing, original
  Search/Saved/Viewer/Import/Activity/Collection SPA workflows, close-blocked,
  close-owner/manual takeover, simultaneous refresh, pending/cached hydration,
  changed backend IDs, revoked-session recheck, real login/logout, client idle
  timeout with virtual browser time, and kick/ban/logout/idle WebSocket messages.
  A previously active document changing accounts is also tested with a populated
  analytics cache: it stays blocked by the new account's owner, then refetches
  after legitimate takeover instead of using the previous account's query data.
- Unsupported Web Locks fail closed. Denied API/error/late-callback cases also
  have direct lock tests. No heartbeat fallback or backend session-policy change.
- Persisted pagehide/pageshow handlers are exercised with **synthetic lifecycle
  events**. This does not certify real browser BFCache eligibility on every engine.
- 320/390/768/1440px in light/dark settings, keyboard recheck/close, real Q asset,
  reduced motion and no horizontal overflow passed. Axe WCAG A/AA checks passed
  at 320/1440px in both settings. The approved page intentionally retains its
  white/corporate-blue/gray/gold palette rather than adding a new dark design.
- Codex browser independently verified owner/blocked behavior, zero protected
  second-tab API/WS traffic, SPA modules, concurrent refresh, close/recheck,
  keyboard focus, narrow layout, kick, login and idle-timeout feedback.
- `npm run test:client`: **2,198 passed** (1,209 + 989), no failures/skips.
- Synthetic HTTP/control/schema/WebSocket fixture Node tests: **8/8 passed**.
- Existing personal avatar/session-race browser regressions: **4/4 passed**.
  Their held response is now the third `/api/me` read (bootstrap, ownership
  activation, protected validation), preserving the original race assertions.
- Production build, typecheck, full client/server lint, bundle budgets, entry
  shell, breakpoint, bounded JSON parsing and secret-scan checks passed.
- `test:scripts` passed after removing inherited `LOG_FORMAT` only from the test
  process environment; no environment file was edited. Final run, with dotenv
  disabled and loopback port1: **765 passed, 1 existing skip, 0 failures**
  (703 + 63 total tests). Evidence: `artifacts/single-active-tab/script-tests-final.log`.
- Broader backend run: auth 164 passed/1 skipped, HTTP 384 passed/23 skipped,
  services 674 passed; repository 406 passed/2 skipped/**1 timeout** in existing
  `collection-osp-v3-performance.postgres.test.ts` (120-second 100,000-account
  performance fixture). It writes only a uniquely created test database, not the
  configured application database. No OSP implementation/assertion was changed.
  See `artifacts/single-active-tab/backend-tests.log`; do not claim a full backend
  pass from this partial run. Remaining unit suites are recorded separately.
- Remaining isolated/offline-configured suites passed: routes **489**, WebSocket
  **106**, intelligence **12**, API contracts **124**. Their child environment
  disabled dotenv and selected loopback port1 to prevent accidental app DB use.

The new browser command is wired into the CI smoke job after build; its report
and screenshots are included in smoke artifacts. Remote CI has not run this
uncommitted change. No production deployment, database migration, new dependency,
brand replacement or business-rule change was made.

Use only local synthetic fixtures or explicitly disposable databases. The new
browser fixture never imports the application server, dotenv or PostgreSQL.
Never target production accounts, receipts/uploads or the existing app database.
Keep diagnostic screenshots/logs in ignored `artifacts/`.

### User copy follow-up — 2026-10-20

Removed the selected "Sesuai untuk komputer dan telefon" benefit and its unused
icon. The two remaining operational messages share equal columns, stacking on
small screens. Ownership/auth/session behavior is unchanged. Gate tests **6/6**,
targeted ESLint and production build passed. Codex browser confirmed the removed
copy is absent and both columns are equal at the user's 722px viewport. Evidence:
`artifacts/single-active-tab/benefits-two-items.png`.

### Layout and typography polish — 2026-10-20

Product Design follow-up on the existing blocked-tab page, not a new design.
Only scoped gate CSS, browser layout assertions and QA/handoff documentation
changed in this pass; ownership/auth/session effects and mandatory BM copy did not.

- Calmer 32–44px desktop heading, 700 weight, less compressed tracking and explicit
  line heights. Copy/status/actions share one left edge and a consistent spacing
  rhythm; desktop buttons are both 156px wide and at least 48px tall. Phone buttons
  remain equal-width, wrapping to full-width rows when necessary.
- Tablet layout now stacks at 1023px rather than squeezing the copy/actions into
  a narrow half-column. Desktop retains the selected split composition. At the
  user's measured 722px viewport, the main card fell from about 932px to 857px tall.
- Rebalanced the supplied browser illustration while keeping its real Q asset,
  first-window heading and both operational benefits. The caption has its own
  clearance below the rotated foreground card; it no longer relies on the old
  phone stage that was shorter than the illustration.
- Browser checks now assert geometry at 320, 390, 640, 641, 722, 767, 768, 1023,
  1024 and 1440px in both stored light/dark preferences. They enforce aligned
  edges, equal action dimensions, two balanced benefits, tablet stacking and
  non-overlapping illustration/caption. The approved light palette is unchanged.
- Avoided a test-only race with the existing public boot-shell heading by waiting
  for the same one-heading/one-main semantic assertions. Protected mount/fetch/
  WebSocket isolation assertions remain unchanged and immediate.

Final rerun: actual built browser **17/17**, gate tests **6/6**, production build,
targeted ESLint, JS syntax, breakpoint contract and `git diff --check` passed.
Axe WCAG A/AA at 320/1440px under both theme preferences reported zero violations.
No production/DB access, commit, push or deployment in this polish pass. The
previously documented unrelated backend performance timeout remains unresolved.

Visual evidence inspected individually and side-by-side:
`artifacts/single-active-tab/polish-before-after-722.png`,
`artifacts/single-active-tab/polish-final.png` and the 10-width browser screenshots.
Latest reports: `artifacts/single-active-tab/polish-browser.log`,
`artifacts/single-active-tab-browser/report.json` and `polish-build.log`.

### CI accessibility readiness follow-up — 2026-10-20

CI run `39343538985` on `9ac9f71e` failed in **Run accessibility contracts**:
`collection-save/desktop: page is missing a heading`. The contract accepted the
temporary tab-checking `main#main-content` and captured its heading count before
the protected Collection route mounted. This was a test-readiness race, not a
missing Collection heading or a reason to bypass tab ownership.

`scripts/lib/ui-protected-route-readiness.mjs` now waits for the visible
`.sqr-workspace main#main-content` before authenticated accessibility/layout
scans. Both contract entrypoints use it after every protected navigation; public
pages retain their existing readiness checks. Existing route-specific selectors,
heading/control/name/duplicate-ID assertions, axe rules and keyboard checks are
unchanged. No frontend, auth/session/lock logic or timeout increase is involved.

Regression evidence:

- The actual built browser suite adds a controlled delayed second `/api/me`
  response on `/collection/save`: the checking main exists without any heading,
  but contract readiness stays pending and no protected API/WS starts. Releasing
  validation allows the real Collection page. Blocked and unsupported gates
  cannot satisfy contract readiness. Suite: **18/18 passed**.
- Exact CI accessibility entrypoint passed all public/authenticated routes,
  desktop/mobile, axe, keyboard and screen-reader scenarios against the real
  built app and a fresh disposable PostgreSQL cluster with synthetic accounts
  and 59 Collection records. Owned app/cluster stopped and temporary data removed.
- Exact CI visual-layout entrypoint also passed public/authenticated pages,
  Dashboard detail/focus checks and operational stress viewports in a separate
  fresh cluster. Its owned app/cluster and temporary data were cleaned up.
- Repeat by setting `SQR_REDESIGN_A11Y_ONLY=1` for the process running
  `node scripts/test-frontend-redesign-isolated.mjs`. The mode is exclusive with
  other QA modes. It never loads repo dotenv or connects to an existing DB;
  the browser child receives synthetic credentials and a fail-closed DB endpoint.
- `npm run test:scripts`: **770 passed, 1 existing skip, 0 failures**. Targeted
  ESLint and syntax checks passed. No production/environment/dependency changes.

Evidence: `artifacts/single-active-tab/ci-a11y-isolated.log`,
`ci-a11y-visual-regression.log`, `ci-a11y-tab-regression.log`,
`ci-a11y-script-tests.log` and the existing built browser report.
This follow-up remains uncommitted/unpushed until requested;
remote CI success is not claimed from the local verification.
