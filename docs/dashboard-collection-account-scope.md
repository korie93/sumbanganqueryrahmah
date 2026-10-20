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
  revocation, role/active guards, audit rollback, real own/team/all monthly SQL.
- Service/route regressions:
  `collection-dashboard-summary.test.ts`,
  `collection-dashboard-summary.routes.test.ts`,
  `collection-dashboard-account.routes.test.ts`.
- Built frontend: `dashboard-account-scope.spec.ts` and the `Dashboard scope`
  / `Collection exit` cases in `dashboard-v79.spec.ts`.
- Collection exit uses shell navigation to Home (button, X or Escape), without
  a browser reload or account logout. The exit button remains available during
  a pending authentication request. Late dialog responses cannot restore local
  nickname state or emit stale authentication toasts after leaving.
  Leaving the dialog does not undo a request already accepted by the server.

All fixtures are synthetic and run locally; no production credentials or records
are used.
