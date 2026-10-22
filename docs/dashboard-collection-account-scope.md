# Dashboard Collection ownership

The Home Dashboard monthly total is independent of the temporary Collection
nickname session. Authentication and the `collection-report` tab permission
remain required.

| Account role | Dashboard scope |
| --- | --- |
| user | All records under its linked Collection nickname |
| admin | Its linked leader nickname and active team members, using the existing admin-report scope |
| manager / superuser | All Collection records in the requested month, with the existing team breakdown |

This does not grant access to Collection customer details, receipts, saving,
nickname passwords, other teams, or account-management actions. Manager remains
read-only under existing permissions. Report endpoints without `includeDashboard=1`
retain their existing authorization.

## Stable links

Migration `0064_collection_dashboard_accounts` creates a summary-only
`users.id -> collection_staff_nicknames.id` mapping with the account's role at
assignment. Names in browser storage, query parameters, matching display names,
and record authorship are never used to establish ownership.

- The migration imports only unambiguous, valid password-verified server sessions
  associated with an active account through the activity's stable owner ID.
- The first subsequent valid nickname login can establish a missing link.
- Later nickname logins do **not** change an existing mapping.
- Superuser can assign, change or remove it in **Settings → Account Management →
  account Details → Kutipan Dashboard → Tetapkan nickname Dashboard**.
- Removing a mapping retains an inactive null entry. A later nickname login
  cannot undo this explicit revocation; superuser must assign it again.
- A nickname rename follows its stable ID. Inactive/deleted nicknames and
  mismatched account roles are not usable as Dashboard scope.
- An account without a usable mapping shows a setup message, not `RM0`.
  A legitimately empty month still shows zero.

Existing logged-out accounts cannot safely be inferred from historical nickname
names. Assign their mappings once as superuser if the migration has no valid
session to import. After that, no Collection login is needed to see Home totals.
Changing roles may require reassignment.

## Optional assignment when creating an account

Superuser can expand **Kutipan Dashboard** in **Create Closed Account** and
optionally select a nickname for a new user/admin. No nickname is preselected
or inferred from the account name. Skipping this step keeps the existing account
creation/activation flow and leaves the mapping absent, not explicitly revoked.
Manager accounts do not need a nickname mapping.

Choices are loaded only on intent from the authenticated, superuser-only
`GET /api/admin/users/dashboard-nicknames?role=user|admin` endpoint. It returns
only active, role-eligible nickname IDs/names, not passwords or customer data.
Changing the target role clears the selection and ignores stale choices. A
failed choices request can be retried or skipped without blocking account
creation. A failed create keeps the entered fields and selection.
The optional section uses a single full-width **Kutipan Dashboard · Pilihan**
disclosure row. Its selected nickname remains visible when the choices panel is
folded; explanatory copy and fields appear only when expanded. The native button
supports Enter/Space, exposes its expanded state and controlled panel, and has a
decorative chevron with reduced-motion support. Inside the expanded panel, a
separate **Tetapkan kemudian** action clears the selection without another
network request and returns focus to the disclosure.

Create Closed Account uses local 44px text/select controls and submit target,
8px label-to-control gaps and 16px field-grid gaps. Input text is 16px on mobile
and 14px from the existing medium breakpoint, including the optional nickname.
Shared Input styling, validation, activation and role behaviour are unchanged.

The existing `POST /api/admin/users` accepts optional `dashboardNicknameId`.
An omitted/null value skips assignment; a non-null value must be a UUID and is
allowed only for user/admin accounts. Creation never performs a separate
follow-up mapping request. The repository creates the account, revalidates the
nickname under a shared row lock, writes the mapping and its audit entry in one
transaction. Invalid/inactive/role-incompatible nicknames or a mapping audit
failure roll back that transaction before activation delivery begins. Normal
activation delivery and account-created auditing retain their existing behavior.

This adds no new migration or Collection login/write permission. The account
remains pending activation until the existing email activation flow completes.

## Account Management controls

Opening one account's Details loads its current Dashboard link, showing
`Belum ditetapkan`, `Dipautkan: <nickname>`, `Perlu semakan`, or `Tiada pautan`
without expanding the editor. No link requests are made for every account row.
Failed status requests show an explicit retry, not a guessed unlinked state.

The status uses a compact semantic badge: success tokens for an active link,
warning tokens for a link needing review, and neutral tokens for unset, removed,
loading or unavailable states. Each state retains explicit text and a decorative
icon; colour is not its only cue. The nearby closed action reads **Tetapkan
nickname Dashboard** for an unset/removed link and **Ubah nickname Dashboard**
when a nickname is already linked. Status/action share a row on wider screens and
stack on narrow screens; long nickname text wraps inside the badge. Existing
polite live announcements and save/remove protections remain unchanged.

The editor explains the selected nickname's own/team summary scope. Saving is
enabled only for an eligible non-empty selection different from the saved link;
failed writes retain the selection for a deliberate retry. Existing backend
superuser/role validation and audit requirements are unchanged.

Removing a link is a separate confirmed action, never a blank dropdown choice.
The confirmation names the saved nickname, explains the loss of Dashboard scope,
and makes clear that Collection records/receipts are not deleted. Cancellation
does not send a write. Removal still preserves the explicit null mapping that
prevents later nickname logins from silently granting access again.

Responses arriving after the account/role changes or Details close are ignored.
Closing the UI does not cancel a write already accepted by the server. Concurrent
edits by different superusers retain the existing last-write-wins behavior;
this frontend polish does not add optimistic version enforcement.

The primary Settings category navigation precedes the page heading consistently.
Account Management keeps its compact Settings chooser and its existing inner
tabs; other categories retain the wrapped desktop category row and mobile Sheet.
Category controls and the Sheet Close target are at least 44px. Selection,
unsaved-change badges, URL/storage persistence and role-filtered access remain
unchanged. A shared display label distinguishes **Backup Settings** (server
configuration) from **Backup & Restore** (operational tools), without merging or
renaming their IDs.

Edit Managed Account uses the same local44px field rhythm as account creation:
six native text/select controls, block labels with8px gaps,16px grid spacing and
16px mobile/14px medium-and-up field text. Its original maximum width, internal
scroll body and separate header/footer remain. Long usernames wrap within the
description; local Close/Cancel/Save targets are at least44px. This is not a
global Dialog/Input change. Save remains an explicit button, with the same
changed-only profile/role/status PATCH calls and saving guards. Existing
Close/Escape dismissal semantics are unchanged, including during a pending save.

Edit-account Save is enabled only for a semantically changed draft with valid
changed Username/Email fields. The dialog and save handler share
`getManagedUserEditState`: trim/case-only identity edits are no-ops; actual
profile updates retain changed-only normalized payloads. Inline errors are
associated with their inputs through `aria-invalid` and `aria-describedby`;
a polite footer status explains unchanged, invalid, ready and saving states.
Untouched legacy identity fields do not block unrelated access changes.
Full Name and non-pending Email can still be cleared to null; an originally
pending account's email cannot be cleared when that field is changed.
Uniqueness, authorization and account lifecycle validation remain server-side.
Failed requests retain the draft for explicit retry. The active editor shows a
single inline server-error alert above Save/Cancel rather than a duplicate toast.
It reuses normalized text/support references and keeps long messages in a named,
keyboard-scrollable bounded region; Save describes the actual error copy.
Open/close/retry clear feedback. A synchronous editor-session counter prevents a
late error from leaking into another account or a same-account reopen, and a
late success cannot close that replacement editor. A closed/replaced editor
keeps the existing notification fallback naming the original target. Save focus
is restored after failure only when disabling it dropped focus to the document
body; focus deliberately moved to Close or another control is left alone.
The existing profile/role/status requests remain sequential, not an atomic
transaction; a later failure can follow an already-saved earlier update.

Reset Password, Ban/Unban and Delete confirmations retain their existing named
AlertDialog, target username, impact explanations and safe initial Cancel focus.
Their local layout uses44px actions, left-aligned wrapped copy and an internally
scrollable details region separate from the footer. The named region is keyboard
reachable (Shift+Tab from Cancel, then PageDown), with a visible inset focus ring;
both actions remain reachable at320x480. Existing mobile action/Cancel order,
on-close focus handoff, immediate confirmation dismissal and request contracts
are unchanged. Confirmation presentation does not modify the shared AlertDialog
or its existing mutation hooks.

## Deployment and recovery

Run `npm run db:migrate` before starting this release. Production startup checks
for the new table. Development/disposable runtime bootstrap creates the same
table but leaves historical backfill to the reviewed migration.

No receipt, record, upload, balance or password is rewritten. Assignment/removal
and its audit entry commit atomically. Take the usual full database backup before
migration; the application's selective Collection export is not a replacement
for the database backup containing account ownership mappings.

## Verification

- `npm run test:collection:dashboard-postgres`: disposable local PostgreSQL,
  real migrations, historical backfill, verified-login persistence, explicit
  revocation, role/active guards, audit rollback, atomic account creation with
  optional mapping, skipped mapping without revocation, and real own/team/all
  monthly SQL.
- Service/route regressions:
  `collection-dashboard-summary.test.ts`,
  `collection-dashboard-summary.routes.test.ts`,
  `collection-dashboard-account.routes.test.ts`.
- Built frontend: `dashboard-account-scope.spec.ts` and the `Dashboard scope`
  / `Collection exit` cases in `dashboard-v79.spec.ts`.
- Nickname settings: `npm run test:visual:built -- --grep "Dashboard nickname" --workers=1`
  covers light/dark at 320/1366px, status before editing, unchanged-save guards,
  own/team explanations, confirmed removal, nested modal layering and focus,
  empty/inactive options, failed writes/retries and stale GET/PUT responses.
- Optional create-time mapping:
  `npm run test:visual:built -- --grep "Create account Dashboard nickname" --workers=1`
  covers explicit user/admin selection, unchanged skip payloads, role resets,
  slow/failed choices, failed create retry, folded selected-choice visibility,
  single-request duplicate protection and measured 44px controls/8px label gaps
  at 320/1366px in light/dark mode.
- Primary Settings navigation:
  `npm run test:visual:built -- --grep "Settings primary navigation|Settings dirty badge|Settings header" --workers=1`
  covers all nine synthetic categories, backup label distinction, a single
  heading, 44px controls, Escape/focus/reload, retained dirty values and role
  restrictions at 320/768/1366px in light/dark mode. No settings are saved.
- Edit account: `managed-account-editor.spec.ts` measures all six fields and
  label gaps at320/768/1366px in light/dark mode, checks keyboard/focus/cancel,
  maximum-length usernames, a320x480 viewport, and exact separate profile,
  role and status/ban PATCH contracts with pending duplicate guards. Fixtures
  never call a real backend or mutate production accounts.
  Feedback cases also cover canonical no-ops/reverts, inline error associations,
  optional null clears, pending/legacy identity rules and deliberate HTTP500/409
  failures followed by explicit retries with the retained draft.
  `managed-account-editor-errors.spec.ts` additionally covers role/status error
  retries, closed/switched/reopened editor races, long untrusted literal text,
  normalized support references and bounded keyboard scrolling at320x480.
- Confirmation dialogs: `account-confirmation-layout.spec.ts` covers all four
  action states at320/768/1366px in both themes, safe Cancel focus, keyboard
  dismissal/focus return, long usernames, real keyboard scrolling at320x480,
  fixed footer actions and exact resetPOST, ban/unbanPATCH and deleteDELETE
  contracts. Existing reset/delete deduplication is tested; no new ban lock is
  introduced by this presentation-only work.
- Collection exit uses shell navigation to Home (button, X or Escape), without
  a browser reload or account logout. The exit button remains available during
  a pending authentication request. Late dialog responses cannot restore local
  nickname state or emit stale authentication toasts after leaving.
  Leaving the dialog does not undo a request already accepted by the server.

All fixtures are synthetic and run locally; no production credentials or records
are used.
