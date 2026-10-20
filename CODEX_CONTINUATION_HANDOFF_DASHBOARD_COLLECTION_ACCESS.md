# Dashboard Collection total and exit navigation

Status: COMPLETE — both fixes implemented and verified on 2026-10-20.
Commit and push authorized on 2026-10-21; consult Git history and origin/main for
the published revision. Production deployment is a separate next step.
Baseline: `3ad1acce6b80397f6753ca783370aab23ef65959` on `main`, initially clean.

## User request

Fix Dashboard month totals showing zero until Collection nickname login, and allow
leaving Collection nickname login for Dashboard without refreshing. Keep a goal
and this handoff so another account can continue.

## Findings

- Home calls `/api/collection/summary?year=...&includeDashboard=1&month=...`.
- The existing summary changes authorization scope with the Collection session:
  user falls back to `createdByLogin` before nickname login, then uses nickname;
  admin has no group without a session nickname and receives an empty summary.
- Accounts and Collection nicknames do not have a permanent universal mapping.
  Do not infer ownership from a nickname typed into the browser or grant all-team
  totals without an explicit decision.
- User confirmed scope: user = own nickname, admin = own team, manager and
  superuser = all Collection in the selected month. Manager gains no write powers.
- CollectionReport's close handler writes General Search storage and uses Wouter
  to navigate to `/`, but the protected app is state-driven. It does not update
  shell `currentPage`. Pass and use the existing shell `onNavigate("home")`.

## Implemented locally

- `AppPageRenderer.tsx` passes the established shell `onNavigate` callback into
  `CollectionReport`.
- Collection dialog Dashboard exit, X and Escape now update actual shell state
  via `onNavigate("home")`, clear the local nickname hint and dismiss the modal.
  No logout endpoint is called.
- Dialog action label is `Kembali ke Dashboard`; actions wrap within the dialog
  and remain stacked on small screens. Dashboard exit remains enabled during a
  pending request; leaving does not undo a request already accepted by the server.
- `useCollectionNicknameAccess` invalidates pending auth responses on exit,
  unmount and identity change. They cannot restore nickname browser state or
  produce stale success/error toasts after navigation.
- Six built-app browser regressions added to `dashboard-v79.spec.ts` with
  synthetic nickname/session responses, no production connection.
- Migration 0064 and matching local runtime bootstrap add the summary-only
  `collection_dashboard_accounts` mapping (stable user ID -> nickname ID).
  Valid unambiguous server sessions are backfilled; the first verified login
  can establish a missing link. Logout never removes the stable mapping.
- Existing mappings never silently change on another nickname login. Explicit
  null unlinks prevent auto-regrant. Role mismatch / inactive nickname fails
  closed. Empty admin scopes cannot fall through to an unfiltered SQL aggregate.
- Dashboard uses this scope, not session nickname or record authorship.
  User sees nickname, admin sees existing leader+active member report scope;
  manager and superuser retain all-month totals and team breakdown.
- Superuser-only GET/PUT `/api/collection/dashboard-accounts/:userId` with
  strict validated payload and atomic assignment+audit. No manager mutation
  powers were added. Account Management Details has a folded nickname editor.
- Missing linkage has an explicit setup message, not false RM0. Genuine empty
  months remain distinguishable. Old report/detail/write authorization unchanged.
- Deployment/configuration guide: `docs/dashboard-collection-account-scope.md`.

## Verification

- Typecheck and focused ESLint passed.
- Full client suite passed: 2,214 tests (1,209 + 1,005), zero failures. Log:
  `artifacts/dashboard-collection-client.log`.
- Full production build passed (ignored log
  `artifacts/dashboard-collection-build.log`).
- 25 built Chromium cases passed: all roles, account nickname editor,
  missing linkage, user/admin, 320/1366 widths, button/X/Escape,
  repeat entry, setup deep link, delayed login success, initial user Home,
  denied Collection, late permission-revoked response, stale editor response,
  retry and Account Management at 320/390/1280 light/dark. No document reload,
  logout, unexpected requests or console errors. Log:
  `artifacts/dashboard-collection-browser.log`.
- Final build and all 25 cases repeated after keeping Dashboard exit enabled
  during pending nickname authentication: 25 passed in 1.4m. The delayed-login
  test now uses the enabled Dashboard button, not only Escape.
- Desktop/mobile screenshots inspected: all controls inside the dialog.
- 581 Collection service/repository/route and permission/runtime-schema
  regressions passed (`artifacts/dashboard-collection-regressions.log`).
- Final focused Dashboard HTTP/service rerun: 16 passed, including forged
  account/group IDs and empty-scope protection (`dashboard-collection-backend.log`).
- Disposable PostgreSQL: 12 passed, applied all real migrations, verified backfill,
  real nickname-session transaction, role checks, unlink persistence, audit
  rollback, competing first logins, rename/deletion and runtime-bootstrap
  compatibility. Real SQL
  confirmed user=100 / admin=125 / manager+superuser=425 for fixture month,
  excluding a prior-month 999 record and a different nickname login.
  Log: `artifacts/dashboard-collection-postgres.log`.
- Existing isolated authentication recovery suite: 17 passed, fixture removed
  (`artifacts/dashboard-collection-auth-postgres.log`).
- Script suites: 771 passed (708 JS + 63 TS), zero failed, one existing opt-in
  baseline Viewer diagnostic skipped (`artifacts/dashboard-collection-scripts.log`).
- Secret scan, repository hygiene, schema/rollback governance and diff check
  passed. Migration rollback coverage: 64/64.
- Initial ARIA contract failure fixed with existing getAriaExpandedProps helper;
  full client rerun green. Script tests need disabled dotenv path because
  importing scripts loads local .env otherwise; use a fresh OS-only child env
  with DOTENV_CONFIG_PATH pointing at a verified nonexistent file and PG_PORT=1.
- Browser fixtures are synthetic. PostgreSQL evidence uses a fresh local cluster
  with synthetic rows, never existing application databases. The runner shuts
  down and removes only its validated temporary fixture directory.

## Completion audit and next authorized action

| Requirement | Evidence |
| --- | --- |
| Monthly total without Collection login | Real PostgreSQL own=100 / team=125 / all=425, no nickname session; prior-month record excluded |
| Role isolation | Auth/tab guards, stable ID lookup, forged ID/filter rejection, unchanged legacy summary and 581 Collection regressions |
| Manager like superuser for monthly reading | All-month SQL totals and existing team breakdown; mutation and assignment routes still reject manager |
| Return to Home without refresh/logout | Built browser button/X/Escape, setup deep link, repeat entry and late-login response tests |
| No misleading zero on unavailable scope | Shared scopeStatus contract and 320/1366 built UI tests; genuine empty month remains zero |
| Cross-account continuation | This handoff plus deployment/configuration guide saved in the worktree |

No implementation or verification work remains for this fix. The user requested
commit and push on 2026-10-21. Check Git history and origin/main for their result.
No production access or deployment was performed. At deployment run migration first. Old unlinked
accounts need superuser assignment once (valid active sessions may be backfilled
automatically); never infer nickname ownership from names.

## Boundaries

Commit and push are authorized. Production access/deployment is not requested in this step.
Local synthetic Playwright is authorized by the conversation. Use existing
isolated built-app fixtures; do not load production credentials/data.
Do not change Collection report/detail/write permissions to fix Dashboard totals.
