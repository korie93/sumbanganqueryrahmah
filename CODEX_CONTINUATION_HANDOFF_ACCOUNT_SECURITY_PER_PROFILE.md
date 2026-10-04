# Account / Security per-profile — completed locally

Goal: `SQR-ACCOUNT-SECURITY-PER-PROFILE-V1-PRODUCTION`.
Updated: 2026-10-05, Asia/Singapore.

## Current checkpoint

Implementation and required local verification are complete. Final session **6607**
exited **0**: **128/128 built browser tests passed**, zero failures, in 7.8 minutes.
Evidence: `artifacts/per-profile-browser-all.log`. All nonvisual gates also passed.
No verification process remains running from this task.

Earlier menu Escape failures were test readiness races with Radix post-mount
effects. Shared Personal menu opening and the two Dashboard tests now await real
menu focus plus two animation frames before keyboard interaction. There are no
forced-focus workarounds, fixed sleeps, weakened assertions, production navigation
changes or snapshot updates. All nine focused menu tests also passed.

The final review found no unresolved required implementation work. Review the
evidence and limitations below rather than treating this checkpoint as a blanket
guarantee against every possible bug. On 2026-10-05 the user explicitly authorized
committing and pushing this verified work to the configured `origin/main`.
Deployment remains unauthorized. Use Git history and the remote ref to verify
publication; this report does not claim that GitHub CI or deployment has passed.

## Authority and workspace

- User approved the uploaded package with “boleh”, then requested completion and
  a persistent goal / cross-account handoff.
- Workspace: `C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah`.
- Base: clean `main`, commit `66038eeb24606c575267bfec2944a6a16ed8945f`.
- Local implementation was verified before publication. The user's 2026-10-05
  follow-up authorizes commit and push of this work, including this handoff.
  No deploy, production access, migrations, dotenv reading/modification or secret
  changes are authorized for this task.
- Preserve all task changes. Earlier production deployment is a separate,
  completed task; do not repeat it.
- References in `C:/Users/Administrator/Downloads`:
  `CODEX_GPT_6_ASTRA_ULTRA_SQR_ACCOUNT_SECURITY_PER_PROFILE_PRODUCTION_GOAL.md`,
  `account.html` and `security.html` (the supplied account-18/security-2 references).
- Follow repository `AGENTS.md`. No dependency, schema or migration changes.

## Implemented

### Account

- Real current-user avatar, username, role, email and creation date.
- Only the avatar is editable; username/email/date remain read-only.
- Large avatar viewer; image selection and preview; pointer/touch/keyboard crop
  repositioning; zoom, quarter-turn rotation, reset, save and cancel.
- Original limits remain 1 MiB / 2048 px. Re-encoded output is a bounded 512 × 512
  WebP/JPEG with original filename and image metadata discarded.
- Confirmed removal through new self-only `DELETE /api/me/avatar`.
- Existing canonical current-user profile patch synchronizes Account, sidebar
  and profile menu; it does not overwrite unrelated refreshed 2FA fields.
- Abort / identity-session unmount guards, duplicate-submit locks, safe failures,
  copy username, missing-email guidance, focus restoration and responsive CSS.
- Removed proven-unused old photo CSS. Fixed semantic definition-list markup and
  localized avatar errors using the existing English auth-feedback adapter.

### Security and canonical navigation

- Compact overview shows real 2FA state and email presence, not invented scores
  or unverified “verified email” claims.
- Personal password and 2FA UI now consistently uses English, matching the shell.
- Reuses existing password validation, strength, confirmation, show/hide,
  Caps Lock feedback, server mutation and session invalidation.
- Reuses actual 2FA password reauthentication, local QR rendering from server
  setup material, OTP verification, expiry, enable and confirmed disable flows.
- Optional English locale added to existing shared controls/hooks; default Malay
  and public login/reset/activation behavior are preserved.
- Existing canonical /account, /security, permission-controlled Settings,
  profile-menu Logout and legacy Settings redirects were reused and verified.
- All four roles retain personal pages. User never gets Settings. Elevated
  Settings remains subject to the actual permission policy.
- Account Management, Dashboard V7.9, sidebar and unrelated modules are unchanged.
- Updated auth browser/actual authenticator scripts and tests for personal English
  labels while retaining public Malay and all secret-handling assertions.

## Existing production logic reused

- Auth current-user payload / session store and `syncAccountProfile`.
- Existing private avatar GET/PUT, image content validation and sanitization,
  immutable-ID-hashed local storage, CSRF, authenticated limiter and audit log.
- Existing password-change API / shared policy / hashing and session invalidation.
- Existing 2FA service, encrypted server-side secret, QR URI and OTP lifecycle.
- Existing logout, authentication guards, role/module permissions and theme.
- DELETE only removes the authenticated actor's single avatar file; no separate
  storage provider, identity editor, session store or audit system was introduced.

## Unsupported / deliberately omitted prototype features

- Recovery codes and regeneration: no existing production backend support.
- Personal device list/revocation and security activity: current operational
  activity feeds require module permission and contain shared data; session kick
  is admin/superuser-only and audit logs are superuser-only. These are not safe
  self-only APIs. No parallel subsystem or fake rows were created.
- Optional generated password, drag/drop, paste-image and pinch gestures are not
  added; standard selection, touch drag, zoom slider and keyboard controls work.
- Password change already invalidates all sessions, including the current one;
  no misleading optional “other devices only” toggle is shown.
- Existing 2FA self-service remains admin/superuser-only. Manager/user can open
  Security and change password, but receive no new 2FA capability.

## Verified evidence

| Check | Result / evidence |
| --- | --- |
| Full npm-test-equivalent suite | PASS: 4,720 total, 4,656 passed, 64 skipped, zero failures; `artifacts/per-profile-full-test.log` |
| Client portion | All 1,800 tests passed |
| Existing skipped tests | 23 opt-in PostgreSQL auth-recovery, 40 opt-in General Search SQL, one base-HEAD Viewer comparison; none disabled by this task |
| Focused crop/API/profile/security | 34 passed; `artifacts/per-profile-focused.log` |
| Component presentation | 5 passed; `artifacts/per-profile-presentation.log` |
| Typecheck and full lint | PASS; `artifacts/per-profile-typecheck.log`, `artifacts/per-profile-lint.log` |
| Full production build | PASS; `artifacts/per-profile-full-build.log`; source-map gate: zero maps |
| Static contracts | Breakpoints, browser storage, spacing, color compatibility, bundle budgets, secrets and repository hygiene PASS; `artifacts/per-profile-gates.log` |
| Modified + untracked secret guard | PASS, in addition to the tracked-file secret scan |
| Focused built browser | 46 passed (44 Personal + two matching existing Dashboard tests); `artifacts/per-profile-browser.log` |
| Auth-feedback browser | PASS, mocked HTTP with real React; `artifacts/per-profile-auth-browser.log` |
| Actual authenticator lifecycle | PASS, fresh local PostgreSQL 17 and actual built app, no API mocks; `artifacts/per-profile-two-factor-browser.log` |
| Full built visual regression | PASS: 128/128, zero failures, 7.8 minutes; final session 6607 exit 0; `artifacts/per-profile-browser-all.log` |
| Targeted menu regression | PASS: 9/9, including all roles and mandatory-password-change guard; `artifacts/per-profile-browser-menu.log` |
| Diff whitespace check | PASS; normal LF/CRLF normalization warnings only |

Build manifest: `sqr-1.0.0-66038eeb2460-20261004T155556Z`, dirty source, not a release.

Actual 2FA verified independent QR decoding / OTP generation, wrong-code rejection,
login gate, disable and re-enable. Eight widths (320–1440), both themes and a11y
passed. Temporary app/database were stopped and removed; application uploads,
receipts and existing data were never used. Masked synthetic artifacts remain at
`artifacts/two-factor/run-0JBgN7`.

Personal viewport tests cover 1366×768, 1024×768, 768×1024, 430×900, 390×844,
360×800 and 320×800, light/dark, Account, viewer/editor, profile menu, password
and 2FA. Main visually inspected desktop and mobile screenshots, including long
username/email wrapping. Axe, containment and no-overflow checks passed.

## Security review

- API tests verify all four roles, authenticated self-only selection, no target
  parameter, rejection of username/email/role/permission/status/path injection,
  CSRF, banned/disabled/must-change-password guards and limiter retention.
- Repository tests verify idempotent removal, isolation of other users' images,
  no directory deletion and refusal of unsafe file/subdirectory links.
- Existing server validation rejects malformed, oversized, mismatched image
  content/types and unsafe filenames; metadata stripping remains authoritative.
- Browser tests verify no duplicate writes, removal retry, stale /me races,
  canonical avatar synchronization and preservation of unrelated 2FA refreshes.
- Password and 2FA reuse server policy and verification, not client-only checks.
  Setup secrets stay out of localStorage and are cleared on completion/cancel/
  expiry/account switch; no fake QR, activity, sessions or recovery codes.
- Direct unauthorized Settings access and mandatory-password-change guards remain.

## Requirement-to-evidence audit

| Requirement group | Authoritative implementation and verification |
| --- | --- |
| Canonical personal pages / role menus | Existing route/feature policy and `tests/visual/personal-account-security.spec.ts`: superuser, manager, admin granted/denied Settings, and user; direct Settings denial and mandatory password guards |
| Real, read-only identity | `Account.tsx` renders the authenticated user; browser tests exercise real fixture creation date, long identity, absent email and no identity inputs; avatar API rejects injected identity/authorization fields |
| Avatar UX and persistence | `account/AvatarEditor.tsx`, `avatar-crop.ts`, existing PUT plus new DELETE; crop math tests, browser keyboard/pointer/zoom/rotate/reset/cancel/save/remove tests, real filesystem repository and HTTP route tests |
| Shared avatar state | Existing `syncAccountProfile` identity/session scope; browser delayed-response tests preserve new avatar and newer unrelated 2FA state, including duplicate-write locking |
| Password | Existing credential hook/API/policy, English personal form, shared password controls; browser rejects wrong password/mismatch/rate limit and verifies canonical session-ending success; backend auth tests remain green |
| Actual authenticator | Existing role policy/services/QR; independent built-app + disposable PostgreSQL lifecycle passes without API mocks, including invalid OTP, enable/login gate/disable/re-enable |
| Settings / Logout / shell | Existing legacy redirects and de-duplication verified by presentation/browser tests; no production sidebar/Dashboard/Settings mutation in this diff |
| Responsive, theme and accessibility | Personal tests cover all specified widths plus 320 px, both themes, long text, QR/dialog bounds, keyboard/focus, serious/critical axe checks; existing visual baselines are unchanged |
| No demo / unrelated production changes | Read-only final diff audit found no added fake data, new dependency, schema, migration, production config, dotenv or unrelated module changes; unsupported reference features explicitly listed above |

Independent final read-only scope review also found no missing implementation
requirement. Browser fixtures verify the actual built React frontend but do not
claim a production server end-to-end run. Backend mutation/repository tests and
the real isolated authenticator test provide the separate server-side evidence.
Final build-freshness check confirmed no changed runtime source was newer than
the verified production build; subsequent edits were tests and this handoff only.

## Remaining issues and release boundary

- No known unresolved acceptance failure; all required local verification passed.
- Unsupported prototype features are explicitly listed above, not presented as
  implemented. Existing manager Settings and manager/user 2FA restrictions remain.
- The 64 existing opt-in tests are skipped, not claimed as passed.
- No GitHub CI result for this feature, production browser test,
  production migration or deployment has been performed.

## Continue from another account

1. Read this file and inspect current git status/history. Preserve any newer work.
2. The implementation is finished locally; do not restart or reimplement the goal.
   Confirm the evidence logs if needed. Session 6607 is terminal and green.
3. If the user requests a new change, rebuild when runtime source changes and
   rerun the affected tests plus proportionate regression gates.
4. Commit and push were authorized on 2026-10-05; check history and `origin/main`
   before repeating publication. Deployment still requires a new explicit user
   request. Keep real dotenv, generated artifacts and credentials out of commits.
   No migration is needed.

## Safe verification execution

Ignored `artifacts/per-profile-run.mjs` contains the audited local runner.
Read it before reuse. It strips inherited app credentials, uses a nonexistent
dotenv path, and points ordinary test DB configuration at closed loopback port 1.
Vite builds use `envDir:false`. Full-test runs exactly the npm-test file groups,
serially/chunked to limit memory. Presentation tests use the existing CSS loader.

Modes: focused, full-test, typecheck, lint, full-build, presentation, gates,
browser, browser-all, auth-browser and two-factor-browser. Built visual tests use
only local static files and synthetic routes; actual 2FA creates its own fresh
loopback database/app. Windows sandbox tsx initialization previously failed with
`os.userInfo ENOMEM`; approved isolated outside-sandbox runs passed.

For Personal grep use `Personal`, not `^Personal`: Playwright prepends project/file
to the full test title. Never use the live-server visual runner or existing DB.
