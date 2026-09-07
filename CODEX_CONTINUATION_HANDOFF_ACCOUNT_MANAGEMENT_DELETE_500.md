# Account Management: Delete User 500

## Objective and scope

Fix only superuser deletion in Settings -> Account Management. Preserve hard-delete semantics, existing role/protected-target checks, historical data, audit attribution, and unrelated account/Collection/Billing behavior. No commit or push is authorized by this resumed implementation request.

Baseline: main at `1342fd2654b3dfdd01b83d7b6879312b54c2554e`, initially clean. Specification: `CODEX_GPT_6_ASTRA_ULTRA_ACCOUNT_MANAGEMENT_FIX_DELETE_USER_500_ONLY.md` supplied by the user. Active thread goal tracks implementation and verification.

## 1. Root cause

Request path: `useSettingsManagedUserAccountLifecycleActions` -> `auth-admin-api` -> `DELETE /api/admin/users/:id` -> `AuthAccountService` -> managed lifecycle operations -> Postgres auth storage -> auth repository -> managed-user mutation helper.

The old implementation invalidates sessions, independently deletes activation/reset tokens, then deletes the user, then independently writes ACCOUNT_DELETED audit. A rejected delete therefore leaves partial state; an audit failure can occur after deletion has committed.

The schema intentionally blocks deleting accounts referenced by Collection/Billing history. Migration 0035 explicitly defines `fk_collection_records_created_by_login_username` as ON DELETE RESTRICT. The old path treated this deterministic dependency as an unexpected 500 and committed auth cleanup before discovering the dependency.

## 2. Exact reproduced exception

Reproduced on baseline `1342fd26` using actual HTTP auth routes, service and repository against a fresh disposable PostgreSQL database. Drizzle `Error` wraps pg `DatabaseError` (name `error`), SQLSTATE `23503`, table `collection_records`, constraint `fk_collection_records_created_by_login_username`:

> update or delete on table "users" violates foreign key constraint "fk_collection_records_created_by_login_username" on table "collection_records"

HTTP 500, user/history still present, activation/reset tokens already deleted, active session already set inactive. Captured evidence: `artifacts/account-delete-reproduction.json`. This is an actual isolated reproduction, not access to production logs or the example request ID.

## 3. Files changed

- `server/repositories/auth-managed-user-mutation-utils.ts`: atomic deletion, session capture, mandatory audit, narrow FK classification.
- `server/repositories/auth-repository-types.ts`: internal deletion result and dependency-error type.
- `server/repositories/auth.repository.ts`, `server/storage/postgres/postgres-auth-account-storage.ts`, `server/storage-postgres-auth-types.ts`: pass the audit and atomic result through the existing storage boundary.
- `server/services/auth-account-managed-lifecycle-operations.ts`: deletion-only orchestration and safe 409 mapping; other mutations unchanged.
- `server/routes/auth/auth-admin-mutation-routes.ts`: deletion-only control-character validation and post-commit notification failure handling.
- `server/routes/auth/auth-route-session-utils.ts`: ensure closing/removal/cleanup still occur when notification throws; this is a direct delete-flow dependency, not a session redesign.
- `server/services/tests/auth-account-managed-operations.test.ts`: atomic delegation and failure/authorization regressions.
- `server/repositories/tests/auth-managed-user-delete-postgres.integration.test.ts`: real isolated PostgreSQL/HTTP/JWT tests.
- `scripts/account-management-delete-qa-local.mjs`: isolated full-migration browser acceptance runner.
- This handoff/report. Ignored artifacts are evidence, not source changes.

## 4. Delete flow before

Authenticate/authorize -> load target -> invalidate sessions -> independently remove activation/reset tokens -> attempt hard delete -> independently insert audit -> notify sockets. Failed delete could leave partial effects; failed audit/notification could follow committed deletion.

## 5. Delete flow after

Authenticate/authorize -> validate compatible TEXT ID -> load/check target -> transaction locks and rechecks manageable target role, captures active session IDs, deletes auth tokens and user using existing FK rules, writes mandatory audit -> commit -> notify/close sockets -> existing success payload. A failed user-delete FK becomes 409 after rollback; other failures remain genuine failures. Empty delete results cannot report success.

## 6. Database dependency handling

| Existing dependency | Intended existing action |
| --- | --- |
| Activation/reset tokens and user_activity by user ID | CASCADE |
| Banned/nickname sessions by activity ID | CASCADE |
| Admin nickname visibility by user ID | CASCADE; keep nickname/team identities |
| Nickname/group creator and daily target/calendar/audit attribution | SET NULL; retain records/snapshots |
| Collection record creator | RESTRICT |
| Source/legacy OSP configuration, target creator/updater/deleter, revisions | RESTRICT |
| Saved target assigned admin, private client result owner and actor, OSP reconciliation history | RESTRICT |
| General audit logs, imports/Saved creator, AI/backup/job creator, settings/idempotency/purge snapshots | No user FK; preserve |

No business records are deleted/reassigned to force success. Existing hard-delete activity CASCADE includes inactive login activity; audit/business history is preserved. Existing daily-reporting SET NULL rules and username snapshots are unchanged. Nickname/team membership identity remains independent from deleted login accounts.

## 7. Transaction safety

Real PostgreSQL tests compare full before/after state on Collection/source/Billing conflicts and injected audit failure. An audit-trigger SQLSTATE 23503 remains HTTP 500 (not incorrectly converted to dependency 409) and rolls back. A BEFORE DELETE trigger that cancels deletion also rolls back and cannot emit success/audit. Concurrent requests commit exactly one deletion/audit, with responses 200 and 404. No migration/constraint modifications are required.

## 8. Authorization / protected-account checks

All superuser targets are already forbidden by manageable-role policy, including self and the last superuser; the explicit lifecycle self-delete guard remains. There is no separate system/seed-account exclusion; the test preserves a system account referenced by real history using its existing FK restriction rather than inventing a rule. Backend guards deny anonymous and user/manager/admin callers, including forged body identities/roles. Client body identity is ignored.

IDs are TEXT, including legacy identifiers, not a PostgreSQL UUID column. Valid UUIDs and legacy text IDs still work; unknown IDs return 404. Empty/oversized/control-character IDs return 400; encoded NUL cannot reach the database decoder. UUID-only enforcement would break the existing identity contract and was deliberately not introduced. Existing CSRF/rate limits/request-correlation/session guards remain in place.

## 9. Session / token handling

Successful deletion removes target activation/reset/session records via the transaction and existing cascades, including banned/nickname sessions. JWT/cookie authentication is denied afterward by existing fresh database guards. Sockets are notified only after commit; transport failures cannot produce a false HTTP 500, skip closing, or retain the revoked client in the live registry. Conflict/audit rollback does not revoke the target's sessions or tokens. Unrelated users' tokens remain.

## 10. Audit logging

ACCOUNT_DELETED remains mandatory with actor username, target ID, role/status/ban metadata, timestamp and request ID from existing request context. Historical audit snapshots remain untouched. Audit insert is now inside the deletion transaction. No audit FK was removed, and no new PII/secrets are added to audit metadata.

## 11. Frontend behavior

No client source/CSS/layout changes. The real existing confirmation returns 200, closes the dialog, shows Account Deleted, refreshes managed users and pending reset requests, and keeps the deleted user absent after full reload. For historical dependencies, the existing Settings error toast uses ACCOUNT_UNAVAILABLE as its title and displays the safe API message advising disabling the account instead; the account/history/tokens/session remain. No unhandled browser runtime errors were observed.

## 12. Tests added / updated

The required matrix is covered by new PostgreSQL tests and the real browser runner: eligible ordinary/admin/manager deletion; activation/reset/active and banned/nickname sessions; admin visibility CASCADE; nickname/group attribution SET NULL and membership preservation; Collection/source/OSP creator, assigned admin and private Table B owner RESTRICT; self/all-superuser denial; system historical restriction; unknown UUID/legacy/malformed IDs; unauthorized forged identities; audit attribution; injected audit and canceled-delete rollback; post-commit socket race; duplicate requests; browser success/list/reset refresh and safe conflict display.

## 13. Commands run and results

On Windows, add `C:\Program Files\nodejs` to PATH first.

```powershell
$deleteTestFiles = @(rg --files server/auth/tests server/services/tests server/routes/tests client/src/pages/settings client/src/lib/api/tests -g '*auth*test.ts' -g '*managed*test.ts' -g '*api-contracts*test.ts' -g '*guards*test.ts' -g '*account*test.ts')
node --import tsx --test --test-concurrency=2 @deleteTestFiles server/http/tests/csrf.test.ts server/routes/tests/permission-matrix.integration.test.ts server/repositories/tests/auth-managed-user-delete-postgres.integration.test.ts
node --import tsx --test --test-concurrency=1 server/repositories/tests/auth-managed-user-delete-postgres.integration.test.ts server/routes/tests/auth-route-session-utils.test.ts
node scripts/account-management-delete-qa-local.mjs
npm run typecheck
npm run lint
npm run build
git diff --check
npm run verify:secrets
node scripts/verify-repo-hygiene.mjs
```

Broad focused regression: 314 passed, 0 failed/skipped (`artifacts/account-delete-regression.log`). Subsequent strengthened PostgreSQL/session suite: 20 passed, 0 failed/skipped (`artifacts/account-delete-postgres.log`; overlap with the 314, not an additive unique-test count). Initial 10 service tests also passed. Final browser acceptance PASS at `artifacts/account-management-delete-1788768938708_a39803/qa-result.json`: all six checks, including real missing-CSRF denial, with no page errors. Confirmation/success/conflict screenshots retained there; conflict screenshot was visually inspected. Earlier browser harness failures are documented above and are superseded by this final passing run.

## 14. Typecheck / lint / build status

Typecheck PASS on final code/tests (`artifacts/account-delete-typecheck.log`). Full client/server lint PASS (`artifacts/account-delete-lint.log`). Build PASS after final production code change (`artifacts/account-delete-build.log`, build manifest `20260907T081107Z`, dirty-source baseline 1342fd26); includes CSP and production sourcemap gates. Secret scan, repository hygiene and `git diff --check` PASS. No dependencies upgraded.

## 15. Migration / deployment notes

No new migration, schema change, FK change, data backfill or production data repair. Deploy the eventual committed code using the existing build/restart process. This task did not pull, restart or mutate the user's server. An account with protected historical ownership must be disabled through the existing account controls if access must end; Delete intentionally remains blocked with 409 rather than destroying history.

QA creates only guarded random-name loopback databases, applies existing migrations, isolates uploads/mail/quarantine and credentials, and removes its disposable databases afterward. A final read-only catalog check found zero remaining `sqr_auth_delete_*` or `sqr_account_delete_*` databases. Screenshots/result logs stay in ignored artifacts. No real-user test deletion occurred. A live account affected by the old failure is not silently modified by this patch.

## 16. Out-of-scope findings

The account search field reset during a browser attempt before deletion, preventing the expected search request. The existing filter-state synchronization can overwrite local input; no search code was changed. Acceptance therefore uses the already-visible fixture rows on the first page, still exercising the actual confirmation and DELETE interaction. The QA's initial expected error-toast title was corrected to match the existing Settings API-code convention; no production UI behavior was changed to make the test pass.

The existing confirmation text says activity history remains, while the established database hard-delete FK cascades login activity. This pre-existing wording/schema discrepancy was not used to redesign deletion semantics; audit and business history remain protected. Local optional PostGIS is unavailable; its existing startup warning did not prevent auth/browser acceptance.

## 17. Scope audit and continuation

Main at baseline HEAD 1342fd2654b3dfdd01b83d7b6879312b54c2554e; changes remain uncommitted, not pushed. Initially clean; no user changes overwritten. All production edits are on the delete flow or its direct socket-cleanup dependency. No login/create/edit/reset/role business rules, Billing/Collection calculations, frontend layouts, environment files, dependencies, migrations, or CI workflows were changed. No debug logging or raw SQL details added to browser responses. Existing error logging remains for genuine failures.

Continuation: implementation and required verification are finished; there are no pending migration/test/implementation steps. Inspect current git status before any later commit/push request. Do not repeat the original reproduction, widen scope, deploy, commit or push without the relevant new user request. Local baseline remains HEAD 1342fd26 and all 12 changed/new source/report files are uncommitted; ignored evidence is not staged.

## 18. Final verdict / Definition of Done

- [x] Exact 500 exception and partial-state cause reproduced.
- [x] Eligible hard delete succeeds for user/admin/manager.
- [x] Historical/business/audit integrity and intended dependency actions preserved.
- [x] Transaction rollback, failed audit and canceled delete verified.
- [x] Existing authorization/protected-target behavior and session/token revocation verified.
- [x] Unknown/malformed IDs handled; legacy TEXT IDs retained.
- [x] Real browser confirmation, list/reset refresh, safe error and reload verified.
- [x] Focused tests added; 314 regressions plus final strengthened 20-test suite pass.
- [x] Typecheck and final production build pass.
- [x] Final lint/browser-with-CSRF/secret/hygiene checks captured.
- [x] Migration requirement and final production diff audited; no unrelated feature fixed.

COMPLETE
