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
The selected nickname remains visible when the choices panel is folded, with a
separate **Tetapkan kemudian** action that clears the selection without another
network request.

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
  and single-request duplicate protection at 320/1366px in light/dark mode.
- Collection exit uses shell navigation to Home (button, X or Escape), without
  a browser reload or account logout. The exit button remains available during
  a pending authentication request. Late dialog responses cannot restore local
  nickname state or emit stale authentication toasts after leaving.
  Leaving the dialog does not undo a request already accepted by the server.

All fixtures are synthetic and run locally; no production credentials or records
are used.
