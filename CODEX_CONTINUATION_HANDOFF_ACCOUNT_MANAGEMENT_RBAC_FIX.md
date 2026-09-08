# Account deletion and role permission continuation handoff

Updated 2026-09-08. COMPLETE. This replaces the old contradictory checkpoint notes. Both implementations, acceptance flows and final quality/documentation gates are verified. The repository snapshot below records verification before publication; the user subsequently authorized commit and push to main. Use current git status/log for publication state. Production deployment has not been performed.

## 1. PERMANENT GOAL

Fully fix exactly two Account Management problems in SQR: (1) an authorized superuser must be able to delete an eligible manager/user account from Settings -> Account Management -> Managed Account without receiving the current linked-record 409 conflict, while preserving required historical/business/audit data safely; and (2) Settings -> Role & Permission enable/disable changes must actually control the relevant role's visible and authorized system access, including menu/tab visibility and backend enforcement where applicable. Continue autonomously through repository audit, root-cause analysis, minimal safe implementation, focused tests, typecheck/lint/build, and final diff audit. Do not expand scope.

Authority: user-confirmed CODEX_GPT_6_ASTRA_ULTRA_ACCOUNT_MANAGEMENT_DELETE_AND_ROLE_PERMISSION_FIX.md in Downloads. This is the new two-bug task, not the earlier Delete500-only task.

## 2. ORIGINAL TWO BUGS

1. A superuser's eligible managed-account Delete returned a linked-record 409 when historical records referenced that account.
2. Saved role toggles did not consistently control menu/page/API access: manager Activity stayed unavailable and some disabled pages remained allowed.

The correction preserves history and genuine protected actions. It is not message suppression, reversible Disable or an example-account exception.

## 3. CURRENT REPOSITORY STATE

Snapshot at implementation verification, before the subsequent authorized commit/push:

- Workspace: C:/Users/Administrator/Desktop/SQR/sumbanganqueryrahmah.
- Branch: main; HEAD/baseline: 0a2cd2b9a1de2ce7718ced528fd7dc02037ac06f.
- Task began clean. No unrelated pre-existing user edits were present or overwritten.
- No staged changes, new commit or push. Current task has no commit/push authorization; older requests applied to older work.
- Git status: 65 modified tracked files and 11 untracked files; every path is listed below. New files are both documents, terminal migration/bootstrap helper, canonical resolver, frontend loader/test, backend shared invalidation/cache test and batch repository/PG test.
- Production untouched. Only generated guarded local PostgreSQL fixtures were created and cleaned. Artifacts are ignored local output.
- No live task process or pending agent edits at final quality completion. Earlier agents hit terminal quota/auth errors; root finished integration. Do not wait on them.
- PowerShell: add C:/Program Files/nodejs to PATH. Node 24.20, PostgreSQL 17. Limited RAM: heavy checks sequentially. Use apply_patch; never print .env.

## 4. BUG 1 ROOT CAUSE

Historical RESTRICT FKs intentionally prevented deleting the users row. The first reproduction was Collection creator attribution; source configuration and OSP creator/revision/result/reconciliation/private-owner dependencies have the same requirement. Retaining those FKs while hard deleting the actor is incompatible.

Implemented: terminal internal users.status='deleted', immutable ID/username/role, inert credentials/2FA, auth-proof cleanup, active-session revocation and deletion audit in one locked transaction. Operational lists and assignments exclude the actor; business/audit/history and private ownership are unchanged. Bootstrap, restore, mutation and DB guards prevent revival. Username uniqueness stays reserved against historical identity takeover.

Report sections 1-6 identify exact constraints, involved tables, before/after flows and preservation classification. No FK weakening or historical migration editing.

## 5. BUG 2 ROOT CAUSE

Canonical tab settings persisted, but duplicated navigation/manager rules overrode flags; Activity read role guards excluded manager; Search lacked tab enforcement. Shared import reads needed consumer-aware access. Out-of-order responses and worker-local caches could retain stale visibility. Multiple dirty role keys were separate writes.

Implemented path: Settings draft -> one validated superuser batch -> transaction on existing settings/version/audit tables -> post-commit scoped invalidation and existing WebSocket notification -> effective resolver -> menu/page/API. Legacy single role setting uses the same transaction. Protected controls remain protected and are read-only with reasons. Frontend/backend cache tests and live browser ON/OFF pass.

Report sections 7-12 document the complete persistence/resolver/cache/session/enforcement paths. Unrelated settings retain original behavior.

## 6. FILES CHANGED

Each row includes every requested per-file field. Global documentation checks are recorded separately.

| FILE | PURPOSE | WHAT CHANGED | WHY | STATUS | REMAINING WORK |
| --- | --- | --- | --- | --- | --- |
| `client/src/app/AppPageRenderer.tsx` | Page rendering | Wait for visibility and reject disabled page/section | Prevent unauthorized content and fallback bypass | Implemented; verified | None in scope |
| `client/src/app/monitorAccess.test.ts` | Page access regression | Update manager configurable Activity and explicit flag fixtures | Match supported dynamic access | Implemented; verified | None in scope |
| `client/src/app/monitorAccess.ts` | Page/monitor access | Use canonical resolver and authorized default page | Remove hardcoded allow/deny mismatches | Implemented; verified | None in scope |
| `client/src/app/navigation.test.ts` | Menu regression | Use actual configured flags for manager | Test fail-closed navigation | Implemented; verified | None in scope |
| `client/src/app/navigation.ts` | Navigation entries | Replace duplicated role arrays with canonical checks | Align menus with effective permission | Implemented; verified | None in scope |
| `client/src/app/useAppShellMonitorAccess.ts` | Monitor URL handling | Wait for permissions and reject explicit forbidden sections | Prevent direct-link bypass | Implemented; verified | None in scope |
| `client/src/app/useAppShellNavigation.ts` | Navigation handlers | Check requested feature/section before navigation | Honor disabled flags on clicks | Implemented; verified | None in scope |
| `client/src/app/useAppShellPageSync.ts` | Post-login page synchronization | Wait for loaded permissions | Avoid premature unauthorized defaults | Implemented; verified | None in scope |
| `client/src/app/useAppShellTabVisibility.ts` | Live permission loading | Role-scoped refresh, fail-closed loading, focus/online recovery | Prevent stale session UI | Implemented; verified | None in scope |
| `client/src/app/tab-visibility-loader.ts` | Async permission loader | Latest response wins; ignore failures/disposal; filter events | Avoid stale permission grants | Implemented; verified | None in scope |
| `client/src/app/tab-visibility-loader.test.ts` | Generic permission/loader regression | ON/OFF across roles/features and out-of-order/failure tests | Verify generic rather than example-account fix | Implemented; verified | None in scope |
| `client/src/components/navbar-utils.test.ts` | Navbar fixtures | Remove obsolete roles properties | Follow canonical NavigationEntry type | Implemented; verified | None in scope |
| `client/src/lib/api/settings.ts` | Settings client API | Add typed batch role-permission request | Save permission toggles atomically | Implemented; verified | None in scope |
| `client/src/pages/settings/settings-controller-utils.ts` | Settings sidebar access | Use canonical protected Backup check | Match existing superuser-only backend | Implemented; verified | None in scope |
| `client/src/pages/settings/useSettingsDraftState.tsx` | Draft saving | Group dirty role keys into one batch request | Prevent partial multi-permission saves | Implemented; verified | None in scope |
| `drizzle/meta/_journal.json` | Migration ordering | Append 0063 journal entry | Deploy new guards without editing old migrations | Implemented; verified | None in scope |
| `drizzle/0063_account_terminal_deletion.sql` | Terminal deletion DB invariants | Add immutable actor and auth-state guards | Prevent revival and concurrent fresh auth | Implemented; verified | None in scope |
| `scripts/account-management-delete-qa-local.mjs` | Disposable real-browser acceptance | Exercise terminal Delete and live Activity/Search ON/OFF | Verify UI/API/auth using actual application | Implemented; verified | None in scope |
| `scripts/db-migration-rollback.manifest.mjs` | Rollback governance | Register 0063 with deleted-identity preservation warnings | Prevent old-artifact/backup resurrection | Implemented; verified | None in scope |
| `server/auth/account-lifecycle.ts` | Account access normalization | Map internal deleted status to denied access | Keep public writable statuses unchanged | Implemented; verified | None in scope |
| `server/auth/guard-tab-visibility.ts` | Role cache | Add scoped generations and stale-read retry | Invalidate correct role without cache races | Implemented; verified | None in scope |
| `server/auth/guards.ts` | Backend authorization | Canonical feature checks and shared-consumer OR gates | Align API access with configured permissions | Implemented; verified | None in scope |
| `server/auth/role-permission-shared-invalidation.ts` | Worker cache invalidation | Subscribe to existing settings broadcast bus | Invalidate other worker role caches | Implemented; verified | None in scope |
| `server/auth/tests/account-lifecycle.test.ts` | Account status tests | Verify deleted always denied and not writable | Prevent normalization-based revival | Implemented; verified | None in scope |
| `server/auth/tests/guards.test.ts` | Existing cache tests | Use stable manually advanced test clock | Preserve original TTL assertion with extra reads | Implemented; verified | None in scope |
| `server/auth/tests/role-permission-cache.test.ts` | Permission cache tests | Test stale in-flight read and scoped worker invalidation | Verify propagation and unrelated-role isolation | Implemented; verified | None in scope |
| `server/config/system-settings.ts` | Permission descriptions | Explain manager Activity read-only capability | Make editable control accurately describe access | Implemented; verified | None in scope |
| `server/internal/collection-bootstrap-admin-visible-nicknames.ts` | Admin assignment bootstrap | Exclude deleted admin actors | Avoid recreating deleted access associations | Implemented; verified | None in scope |
| `server/internal/core-schema-bootstrap-activity.ts` | Fresh activity schema | Install deleted auth guard after table creation | Keep fresh bootstrap equivalent to migration | Implemented; verified | None in scope |
| `server/internal/local-server-composition-factory.ts` | Runtime composition | Subscribe permission invalidation before browser broadcasts | Avoid notification-before-cache-clear race | Implemented; verified | None in scope |
| `server/internal/local-server-route-registration.ts` | Search route wiring | Inject existing tab guard | Enforce Search permission in real server | Implemented; verified | None in scope |
| `server/internal/users-bootstrap/schema-credentials.ts` | Legacy credential hardening | Skip terminal accounts | Do not replace inert deleted credentials | Implemented; verified | None in scope |
| `server/internal/users-bootstrap/schema-normalization.ts` | Bootstrap normalization | Preserve internal deleted status | Do not normalize terminal actor back to active | Implemented; verified | None in scope |
| `server/internal/users-bootstrap/schema-system-actor.ts` | System actor bootstrap | Do not update a terminal identity | Prevent bootstrap revival of retained actors | Implemented; verified | None in scope |
| `server/internal/users-bootstrap/schema.ts` | Users schema entry point | Install deletion guards | Cover fresh local/bootstrap installations | Implemented; verified | None in scope |
| `server/internal/users-bootstrap/schema-deleted-account.ts` | Bootstrap DB invariants | Equivalent readable 0063 guard SQL | Maintain migration/bootstrap consistency | Implemented; verified | None in scope |
| `server/repositories/activity-repository-ban-operations.ts` | Operational banned accounts | Exclude deleted users from current banned list | Keep historical actors out of account controls | Implemented; verified | None in scope |
| `server/repositories/analytics.repository.ts` | Current-account counts | Exclude deleted users from totals/banned/role counts | Avoid counting historical actors as live accounts | Implemented; verified | None in scope |
| `server/repositories/auth-managed-user-mutation-utils.ts` | Account deletion transaction | Terminal actor, proof cleanup, session revocation and audit | Delete eligible accounts without destroying history | Implemented; verified | None in scope |
| `server/repositories/auth-managed-user-read-query-utils.ts` | Management list queries | Exclude deleted targets/reset queues | Remove deleted accounts from operational UI | Implemented; verified | None in scope |
| `server/repositories/auth-managed-user-read-utils.ts` | Account/role selectors | Filter deleted rows | Prevent stale operational target selection | Implemented; verified | None in scope |
| `server/repositories/auth-repository-types.ts` | Deletion result types | Remove obsolete historical FK conflict exception | Terminal deletion no longer uses hard-delete conflict | Implemented; verified | None in scope |
| `server/repositories/auth-user-repository-write-utils.ts` | Account/credential writes | Exclude deleted rows and return actual updated row | Prevent stale mutation success and revival | Implemented; verified | None in scope |
| `server/repositories/backups-restore-core-datasets-utils.ts` | User backup restore | Accept terminal status with inert auth fields | Preserve identity without restoring access | Implemented; verified | None in scope |
| `server/repositories/collection-admin-assignment-utils.ts` | Admin nickname assignment | Reject/filter terminal admins | Do not assign new access to deleted accounts | Implemented; verified | None in scope |
| `server/repositories/collection-repository-admin-operations.ts` | Collection admin selectors | Exclude terminal admins | Keep actor history separate from selectable accounts | Implemented; verified | None in scope |
| `server/repositories/settings-repository-view-utils.ts` | Effective settings presentation | Mask protected controls false/read-only with reason | Avoid misleading editable no-op controls | Implemented; verified | None in scope |
| `server/repositories/settings.repository.ts` | Settings persistence/resolution | Delegate role writes and apply canonical effective visibility | Use one permission model; other settings unchanged | Implemented; verified | None in scope |
| `server/repositories/settings-role-permission-mutations.ts` | Atomic permission persistence | Validate/lock/save values, versions and audit in one transaction | Prevent partial saves and unauthorized permission writes | Implemented; verified | None in scope |
| `server/repositories/tests/auth-managed-user-delete-postgres.integration.test.ts` | Real PG deletion tests | History-preserving success, rollback, auth/protection/restore cases | Prove new semantics beyond prior 409-only task | Implemented; verified | None in scope |
| `server/repositories/tests/backups-restore-user-access.test.ts` | Backup access regression | Verify terminal identity/inert credentials | Prevent backup-based login revival | Implemented; verified | None in scope |
| `server/repositories/tests/role-permissions-postgres.integration.test.ts` | Real PG permission tests | Persistence, batch rollback, concurrency, restart and API cases | Verify canonical storage and authorization end to end | Implemented; verified | None in scope |
| `server/routes/activity-read-routes.ts` | Activity read access | Permit manager through existing configurable read guard | Enable Activity without moderation privileges | Implemented; verified | None in scope |
| `server/routes/imports-read-routes.ts` | Shared import read access | Accept enabled Import/Saved/Viewer/Analysis consumers as applicable | Do not couple read feature to disabled upload tab | Implemented; verified | None in scope |
| `server/routes/imports-route-context.ts` | Import guard types | Support alternative read feature arguments | Wire shared-consumer authorization safely | Implemented; verified | None in scope |
| `server/routes/search.routes.ts` | Search endpoint access | Require Search tab on search endpoints | Prevent disabled Search API bypass | Implemented; verified | None in scope |
| `server/routes/settings-mutation-routes.ts` | Settings write routes | Strict validated superuser-only batch endpoint | Authorize atomic permission writes | Implemented; verified | None in scope |
| `server/routes/settings-read-routes.ts` | Visibility response | Add no-store cache header | Avoid stale browser permission responses | Implemented; verified | None in scope |
| `server/routes/settings-route-context.ts` | Settings dependency types | Allow role-scoped cache invalidation | Keep service/guard contract consistent | Implemented; verified | None in scope |
| `server/routes/tests/permission-matrix.integration.test.ts` | API permission regression | Wire Search tab guard and configurable manager Activity | Keep protection matrix aligned with intended access | Implemented; verified | None in scope |
| `server/routes/tests/search.routes.integration.test.ts` | Search route harness | Provide newly required guard dependency | Retain search behavior tests without changing algorithm | Implemented; verified | None in scope |
| `server/services/auth-account-authentication-operations.ts` | Login | Reject deleted like unknown credentials | Prevent login and account enumeration | Implemented; verified | None in scope |
| `server/services/auth-account-managed-lifecycle-operations.ts` | Managed account service | Terminal Delete rules, protected actor and stale-mutation 404 | Preserve authorization and avoid false success | Implemented; verified | None in scope |
| `server/services/auth-account-password-reset-operations.ts` | Password reset | No-op/reject terminal targets | Prevent reset-based revival | Implemented; verified | None in scope |
| `server/services/auth-account-service-policies.ts` | Managed target lookup | Treat deleted target as not found | Keep normal account controls from terminal actors | Implemented; verified | None in scope |
| `server/services/auth-account-token-utils.ts` | Activation/reset tokens | Reject terminal target token records | Prevent stale token authorization | Implemented; verified | None in scope |
| `server/services/settings.service.ts` | Permission orchestration | Delegate batch/single role writes; invalidate/broadcast after commit | Avoid partial state notifications | Implemented; verified | None in scope |
| `server/services/tests/app-navigation.test.ts` | Protected navigation regression | Assert Backup remains superuser-only | Match genuine backend boundary | Implemented; verified | None in scope |
| `server/services/tests/auth-account-managed-operations.test.ts` | Managed service regression | Remove old conflict expectation; add stale Delete mutation checks | Verify correct failure/no-side-effect behavior | Implemented; verified | None in scope |
| `server/storage-postgres-activity-settings-types.ts` | Storage contract | Add typed role-permission batch method | Preserve layered service/storage wiring | Implemented; verified | None in scope |
| `server/storage/postgres/postgres-settings-storage.ts` | Storage facade | Ensure settings schema then delegate batch | Use existing repository architecture | Implemented; verified | None in scope |
| `shared/schema-postgres-core.ts` | Account schema documentation | Document internal terminal status on existing TEXT field | Explain 0063 without new public status/column | Implemented; verified | None in scope |
| `shared/user-roles.ts` | Supported manager modules | Include configurable read-only Activity | Remove obsolete module exclusion | Implemented; verified | None in scope |
| `shared/role-feature-access.ts` | Canonical effective feature policy | Known features/roles, protected boundaries, boolean flags | Unify frontend/backend permission decisions | Implemented; verified | None in scope |
| `CODEX_CONTINUATION_HANDOFF_ACCOUNT_MANAGEMENT_RBAC_FIX.md` | Continuation handoff | Replace stale checkpoints with verified state and full inventory | Allow another session to resume without repeating work | Documented | None in scope |
| `docs/account-management-delete-role-permission-fix-report.md` | Required final report | Record all 18 findings/evidence/deployment sections | Provide an auditable task handoff | Documented | None in scope |

## 7. DATABASE / MIGRATION

Required migration: drizzle/0063_account_terminal_deletion.sql, registered in journal and rollback manifest. Adds terminal-identity and fresh-auth-state guards, not new columns/tables/FK actions. Equivalent bootstrap: schema-deleted-account.ts. No permission schema change or backfill.

Applied only in disposable local full-migration browser fixtures; bootstrap invariants also tested in real local PG. NOT applied to production. Existing migrations unchanged.

Deployment: verified backup, stop old workers, verify target, npm run db:migrate, then only updated workers. Old bootstrap does not understand terminal accounts. Do not restore older active identities or roll back to old code after deletions; preserve/reapply terminal identities and revocations through a reviewed forward fix. See report section 14 and special 0063 rollback entry.

## 8. TEST STATUS

Current-task evidence (counts overlap; do not sum as unique tests):

| Check | Result | Evidence under artifacts/ |
| --- | --- | --- |
| Baseline linked-history Delete | Old 409 reproduced before fix | account-rbac-delete-before.log |
| Baseline permission mismatch | Activity true ignored; Search false ignored | account-rbac-permission-before.log |
| Final PG Delete + permissions | 19 pass, zero failures/skips | account-rbac-final-postgres.log |
| Permission rerun after final scope cleanup | 1 comprehensive test pass, zero skips | account-rbac-permission-final.log |
| Account/auth/session/CSRF/backup | 109 pass, zero skips | account-rbac-account-regression.log |
| Permission/menu/API regression | 87 pass, zero skips | account-rbac-permission-regression.log |
| Frontend/backend cache | 5 pass | account-rbac-permission-cache.log |
| Affected Activity/Settings/Imports/shell/account | 335 pass, zero skips | account-rbac-affected-regression.log |
| All client .test.ts | 379 files, 11 batches, 1531 pass, zero failures/skips | account-rbac-client-all.log |
| Actual browser | 10 checks PASS; pageErrors=[] | account-management-delete-1788823836702_afa781/qa-result.json |

Tests added/extended are listed individually above. No remaining scoped failure. Fault-injection tests deliberately log an internal audit failure while asserting safe HTTP 500/full rollback; this is expected. Earlier browser failures were corrected fixture assumptions, not outstanding product defects.

Exact primary commands, with Node in PATH:

```powershell
node --import tsx --test --test-concurrency=1 server/repositories/tests/auth-managed-user-delete-postgres.integration.test.ts server/repositories/tests/role-permissions-postgres.integration.test.ts
node --import tsx --test --test-concurrency=1 server/repositories/tests/role-permissions-postgres.integration.test.ts
node --import tsx --test --test-concurrency=1 client/src/app/tab-visibility-loader.test.ts server/auth/tests/role-permission-cache.test.ts
node scripts/account-management-delete-qa-local.mjs
```

Browser runner requires a fresh build, local PG and supported Chromium. It creates an isolated generated database/workspace and exercises actual cookie/CSRF auth. Do not aim it at production.

Affected 335-test selection:

```powershell
$affectedTests = @(rg --files client/src server | Where-Object { $_ -match '(activity|settings|imports|monitorAccess|navigation|tab-visibility|auth-account-managed-operations).*test\.ts$' -and $_ -notmatch 'postgres|100k' })
node --import tsx --test --test-concurrency=1 @affectedTests
```

All-client execution, groups of 35 to fit memory:

```powershell
$clientTests = @(rg --files client/src | Where-Object { $_ -match '\.test\.ts$' })
for ($testOffset = 0; $testOffset -lt $clientTests.Count; $testOffset += 35) {
  $testEnd = [math]::Min($testOffset + 34, $clientTests.Count - 1)
  $testBatch = @($clientTests[$testOffset..$testEnd])
  node --import tsx --test --test-concurrency=1 @testBatch
  if ($LASTEXITCODE -ne 0) { throw 'Client test batch failed.' }
}
```

No claim that the full server suite, hosted release-readiness workflow or production smoke was run.

## 9. BUILD STATUS

Final npm run typecheck, npm run lint and npm run build: PASS after the last code edit (removal of unrelated ordinary-settings transaction wrapper). Logs: artifacts/account-rbac-typecheck.log, account-rbac-lint.log and account-rbac-build.log. Production sourcemap gate passes with zero maps; non-fatal Vite CSS timing advisory only.

npm run verify:db-schema-governance: PASS (56 tables). npm run verify:db-migration-rollback: PASS (63/63). node --check scripts/account-management-delete-qa-local.mjs: PASS. Final npm run verify:secrets, npm run verify:repo-hygiene and git diff --check: PASS. Inventory matches all 76 git-status paths, with no omissions or extras.

## 10. EXACT NEXT ACTIONS

1. No implementation or scoped verification remains. Deliver the completed outcome/report and close the active goal.
2. The user has now requested commit/push. Publish only this reviewed scope (never secrets), and verify local HEAD matches origin/main afterwards; current git state is authoritative for completion of that publication.
3. Deployment is separate and requires an applicable request plus the migration/old-worker precautions in report section 14. Do not rerun destructive acceptance against real accounts.

## 11. DO NOT REPEAT

Do not restart the old Delete500-only task or reinstate linked-record Delete409. Do not repeat completed root-cause audits or browser runs because old checkpoint notes mentioned failures. Full client suite and final quality are finished, not running. Atomic role batching, stale account-mutation 404 checks and bootstrap/restore invariants are implemented and tested. No unknown live process handle remains. Do not wait on terminal agents.

## 12. SCOPE LOCK

Exactly deletion with history preservation and configurable role enforcement. No unrelated fixes, schema rearchitecture, dependency/CI/CSS/layout work, Billing/Collection calculations, Search algorithms, ownership transfers or old release task reopening. Keep .env ignored/unchanged. Do not edit applied migrations. Existing protected actions remain protected.

## 13. DEFINITION OF DONE

### BUG 1

- [x] Exact linked-record 409 root cause identified
- [x] Eligible manager deletion succeeds
- [x] Eligible admin/user deletion behavior remains correct according to current product rules
- [x] Historical business/audit data preserved
- [x] No blind cascade
- [x] Transaction safety verified
- [x] Session/auth revocation verified where applicable
- [x] Protected accounts remain protected
- [x] Frontend refresh works
- [x] Focused deletion tests pass

### BUG 2

- [x] Permission setting persists correctly
- [x] Canonical resolver reads the configured permission
- [x] Manager Activity enable works
- [x] Manager Activity disable works
- [x] Sidebar/menu follows permission
- [x] Direct route follows permission
- [x] Backend authorization follows permission where applicable
- [x] Cache/session propagation works correctly
- [x] Other roles are unaffected
- [x] Other permissions are unaffected
- [x] No hardcoded example-account fix
- [x] Focused permission tests pass

### GLOBAL

- [x] Typecheck passes
- [x] Lint passes where applicable
- [x] Relevant unit tests pass
- [x] Relevant integration tests pass
- [x] Build passes
- [x] Migration requirement audited
- [x] Final diff reviewed
- [x] No unrelated user changes overwritten
- [x] No unrelated issue intentionally fixed

Required 18-section report: [account-management-delete-role-permission-fix-report.md](docs/account-management-delete-role-permission-fix-report.md).
