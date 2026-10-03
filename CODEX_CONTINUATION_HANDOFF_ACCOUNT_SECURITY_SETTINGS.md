# Account / Security / Settings continuation

Status: COMPLETE locally — implementation, final hardening and acceptance verified on 2026-10-03. Not committed, pushed or deployed.

## Authorization and scope

User approved `CODEX_GPT_6_ASTRA_ULTRA_SQR_ACCOUNT_SECURITY_SETTINGS_CHATGPT_STYLE_GOAL.md` with “boleh”. Active goal: canonical personal Account/Security, permission-controlled administrative Settings, one profile-menu Logout, preserve prior Dashboard V7.9 and verify locally. No commit, push, deployment, production migration, production data access or dotenv inspection authorized/performed.

The working tree already contains the previous Dashboard V7.9 implementation and mandatory user Home changes. Preserve those changes. HEAD remains the earlier base; do not reset or blindly discard dirty files. The older Dashboard handoff describes a historical pre-refactor state; its Account shortcut through Settings is superseded by this task.

## Implementation / architecture

- `/account`: avatar editable; username/email/created date read-only. `Account.tsx`, `account-profile.ts`, shared `AccountAvatar` use existing shell/auth state and image/form primitives, no additional current-user request.
- `/security`: existing credential and 2FA hooks/forms extracted from Settings. Password uses the existing API and invalidates sessions exactly as before. Pending/enabled/disabled 2FA remains server-authoritative. No parallel password/hash/TOTP implementation.
- `/settings`: system configuration, roles, account management and backups remain. Removed legacy `AccountSecuritySection`, `MyAccountSecurityCard`, `useSettingsMyAccount`, `useSettingsSecurityViewModel`. System Security is still genuinely administrative; do not redirect `/settings?section=security`.
- Legacy personal aliases `section=account|my-account` redirect to `/account`; `section=account-security` redirects to `/security`.
- One shared profile menu owns Account, Security, conditional Settings and Logout, including mandatory-password view. Existing production logout callback is reused; local-only logout button removed from ChangePassword.
- All four authenticated roles can access personal pages. Production RBAC still denies Settings to manager/user, including forged settings=true; authorized admin/superuser retain Settings. Current 2FA capability is admin/superuser only, explained honestly for manager/user. No new grant or capability was introduced.
- `createdAt` reuses existing account timestamp. `avatarUrl` is added to successful authenticated self payloads only, not 2FA challenges. Profile updates preserve identity/roles/session constraints and reject stale actors; restored sessions include all 2FA state.
- New private `GET/PUT /api/me/avatar`; strict JSON `{fileName,mimeType,contentBase64}`; 1 MiB PNG/JPEG/WebP, max 2048x2048, canonical base64, MIME/signature/extension/structure validation using existing receipt sanitizer, strips metadata. No new dependencies/migration.
- One atomic file per SHA256 immutable account ID under persistent uploads/profile-avatars. Trusted configured uploads-root symlink is resolved for production shared storage; avatar subdirectory/file symlinks rejected. Authenticated self-only image response is private/no-store/nosniff. No user-selected paths or IDs. Existing auth, CSRF, scoped upload body limit, rate limiting and audit preserved.
- Legacy self credential endpoint rejects username changes and unknown protected properties; administrative Account Management is unchanged.

## Final verification evidence

- `artifacts/personal-npm-test-hardened.log`: final full `npm test` completed every configured batch through the last intelligence suite: **4,628 passed, 64 optional integration skips, zero failed/cancelled/todo (4,692 total)**. Includes client, scripts, contracts, auth, HTTP, services, repositories, routes, WebSocket and intelligence batches. All per-batch failure counts are zero and the final suite summary is complete. The process handle expired across continuation before its final exit response could be retrieved; the complete terminal log is the result evidence. Earlier `personal-npm-test-final.log` had 4,610 passes before the last 18 regression additions.
- `artifacts/personal-typecheck-acceptance-final.log`: final `npm run typecheck` PASS, terminal exit 0 in the serial root session 16458.
- `artifacts/personal-lint-hardened.log`: final client and server `npm run lint` PASS, terminal exit 0 in session 16458.
- `artifacts/personal-build-hardened.log`: final full `npm run build` PASS, including status assets, CSP, frontend/server build, release manifest and production sourcemap gate, terminal exit 0 in session 16458. Release manifest `sqr-1.0.0-7a2cd32eb2a5-20261003T082508Z` explicitly identifies dirty source. Includes scoped profile patches, malformed-image hardening and V17 hover token fix. Post-build bundle budgets passed.
- `artifacts/personal-browser-hardened.log`: final full built-browser suite **101 PASS**, terminal exit 0 (agent session 85714), 4.7 minutes. 48 Dashboard V7.9 + 17 existing + 36 personal tests. No baseline updates in this run. Covers six requested viewport sizes in both themes, axe serious/critical checks, avatar all four roles, real route/selector interactions, password rejection/success, 2FA setup/invalid code/enable/refresh/disable, permissions, aliases, real logout request, post-logout protected-route denial, collapsed-menu geometry, both response orders of avatar/2FA synchronization, held `/me` response and duplicate avatar submission. Fresh mobile forced-password header, desktop/light Account and mobile/dark Account/password screenshots inspected without overlap/clipping; `.last-run.json` reports passed with no failed tests.
- `artifacts/personal-backend-tests.log`: 59/59 PASS, zero skips; all roles/self isolation, strict payload, private response, forbidden account states, CSRF, body limits, atomic storage/symlinks, legacy identity rejection and auth regressions.
- `artifacts/personal-avatar-all-formats.log`: 6/6 PASS, including genuine offline-created JPEG/WebP fixtures and metadata removal, before additional malformed-header hardening.
- Browser storage, standardized breakpoints, spacing/color compatibility, bundle budgets, bounded JSON, tracked secret scan, untracked-file secret guard, repository hygiene and `git diff --check` passed on the final changes. Package manifests, schema, workflow configuration and dotenv files were not changed by this task.
- `artifacts/personal-auth-browser-final.log`: existing isolated auth browser harness PASS, terminal exit 0 (agent session 90603). All password reset/activation/change, OTP rejection/restart, 2FA setup/enable/disable/expiry/stale-response, duplicate-submit, browser-storage and full WCAG A/AA checks passed, including explicit password-toggle hover at 320/360/390/430/768/1280px in light/dark. Earlier acceptance/diagnostic logs failed on V17 hover contrast; the final passing run supersedes those attempts.
- `artifacts/personal-avatar-hardening-tests.log`: final image/route/repository tests **20/20 PASS**, zero skips, terminal exit 0 (root session 4159). Includes valid PNG/Adam7/indexed images, baseline/progressive JPEG, lossy/lossless/alpha/animated WebP and malformed-header/raster/frame rejections. JPEG/WebP checks are structural; no full image-codec dependency was introduced.
- `artifacts/personal-profile-patch-tests.log`: 21/21 PASS for scoped mutation events, both reverse-response races, pending `/me` touched-field guard and original Settings utilities.
- `artifacts/personal-public-auth-contract.log`: 8/8 PASS, including the V17 scoped hover contrast regression.
- `artifacts/personal-component-final.log`: 5/5 React render/presentation tests PASS with the repository CSS loader. These `.test.tsx` cases are explicitly run separately from the default client `.test.ts` discovery.

### Bugs fixed during acceptance

- `useAppShellSessionValidation` explicitly rebuilt User without avatar/created date/2FA fields, overwriting valid bootstrap state. Added all fields and regression coverage.
- Avatar mutation adapter expected the `/me` response schema with mandatory session expiry instead of `{ok,user}`. Reuses existing mutation schema now; client adapter regression added.
- Delayed `/me` could overwrite a completed avatar/2FA mutation. A per-read profile-event guard retains only newer personal fields while preserving authoritative role, status, bans and password gates; cross-account/session responses are not merged.
- Removed unused client `updateMyCredentials` wrapper advertising forbidden username edits; backend legacy endpoint remains fail-closed and canonical password endpoint is reused.
- Mandatory-password profile menu is now in normal layout flow rather than overlaid on the auth card; final 360px screenshot verified without overlap.
- Final read-only review reproduced a malformed PNG with invalid bit depth and correct CRC being accepted. Bounded PNG raster validation and JPEG/WebP structure checks now reject the identified malformed cases; positive-format and negative tests passed.
- Reverse response order could overwrite unrelated fields: a mutation captured old avatar/2FA state, then `/me` refreshed it before that mutation finished. Mutation notifications and the pending-read guard now carry only fields actually changed, retaining authoritative unrelated fields. Focused tests and both built-browser response-order cases passed (101 total browser cases).
- V17 intentionally uses a light auth surface even when the workspace theme is dark. Its password-toggle hover inherited the dark workspace `--muted` background with a dark text label. A single V17-scoped light token fixes the confirmed contrast failure; explicit hover axe coverage and a color-contract test now pass.

## Remaining issues / handoff boundaries

No known unresolved defect or failing required local gate remains for this implementation. The 64 skips are existing optional cases, primarily live PostgreSQL integration checks plus the optional baseline Viewer reproduction; they are not claimed as passing. Live external PostgreSQL/Redis verification was not performed. The real-browser tests use actual built React routes with synthetic HTTP; they do not claim a production end-to-end deployment test. Remote CI has not run on these uncommitted changes. Commit, push, production migration and deployment require a separate request.

Run heavy gates serially on this 4GB Windows host. Local verification uses synthetic fixtures, closed loopback DB port and disabled dotenv. Approved elevation can be needed for Node/Chrome startup. Optional live PostgreSQL/Redis integrations and remote CI are not claimed.

## Operational notes

Avatar files belong to persistent uploads alongside existing customer uploads. Future deployment must preserve/mount the existing uploads root; filesystem snapshots must include profile-avatars (database-only export is not an avatar backup). Account deletion makes its avatar inaccessible through session/user guards; the residual private file follows existing upload retention rather than introducing an unrelated deletion policy here.

## Acceptance evidence map

| Requirement | Authoritative implementation / verification |
| --- | --- |
| One profile menu, Account/Security/Logout for all four roles, Settings only when authorized | `NavbarUserMenuContent.tsx`, existing `canAccessRoleFeature`; visual role matrix and forged-permission/direct-route tests in `personal-account-security.spec.ts`; backend permission matrix tests |
| Anchoring, collapse-to-expand before opening, outside click, Escape, keyboard focus, mobile and utility layers | Existing `Navbar.tsx`/`useSidebarExpansion.ts`, V7.9 browser cases plus personal collapsed-profile test |
| Canonical read-only identity/date and editable avatar | `Account.tsx` renders a description list, no editable identity fields; existing `createdAt` in self payload; strict avatar-only route/service; backend protected-field and two-actor tests |
| Avatar preview/save/busy/error/success/global synchronization | `Account.tsx`, shared `AccountAvatar`, `account-profile.ts`; all-role upload/error/reload tests and synchronous double-submit test; scoped patch and delayed `/me` regressions |
| Private safe image upload, bounded storage, no new schema/dependency | `account-avatar-image.ts`, repository/service/routes; file type/size/name/signature/structure tests, metadata removal, atomic replacement, symlink tests, CSRF/body-limit tests; unchanged package manifests and schema |
| Canonical password and optional production 2FA | `Security.tsx`/`PersonalSecurityForm.tsx` reuse original hooks, policy, PasswordInput, PasswordStrengthMeter and TwoFactorSettingsPanel; `/api/auth/change-password` uses unchanged `changeOwnPassword`, bcrypt, credential compare-and-swap, audit and session invalidation; original TOTP APIs/storage untouched |
| Password confirmation, visibility, safe errors, no repeated writes; server-only 2FA enable and verified disable | Personal built-browser password/2FA cases, credential/API tests and isolated auth feedback browser harness; no secrets in output or browser storage |
| No duplicate personal Settings forms or logout | Deleted legacy account/security card, section and view-model/controller; Settings renders real admin/system categories only; source search plus browser absence tests; Activity's logout labels are historical data, not extra actions |
| Legacy bookmarks and guarded direct links | `personal-routes.ts`/`routing.ts` normalize only personal aliases, preserve system Security; direct links and reload/forced-password/logout tests |
| Real logout/session rules preserved | Existing `performAppLogout` invokes `/api/activity/logout`; server deactivates activity, revokes session JWT and clears auth cookie; browser proves one request and protected-route denial; auth/session unit tests cover server guards |
| Dashboard/sidebar and unrelated modules retained | Full built-browser suite includes 48 V7.9 cases and original login/module snapshots; full client/scripts/backend suite; no unrelated module rewrite within this refactor |
| Light/dark/responsive/accessibility/performance | Account/Security/password/setup/profile at 1366x768, 1024x768, 768x1024, 430x900, 390x844, 360x800; no-overflow checks and axe; manual screenshot review; lazy routes, existing UI primitives, no duplicate `/me` fetch from personal pages, bundle budgets |
| No unauthorized external changes | All QA uses synthetic data/local loopback and disabled dotenv; no commit/push/deploy, production data access or migration |

The map was checked against the original document and the final evidence above. Existing production role restrictions take precedence over granting new capabilities: manager/user have personal Account/Security/Logout but no Settings or self-service 2FA; admin has Settings only with its existing grant and supports current 2FA; superuser retains authorized Settings and current 2FA. Administrative Account Management remains separate.
