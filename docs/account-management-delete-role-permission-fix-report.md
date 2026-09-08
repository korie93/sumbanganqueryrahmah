# Account Management: deletion and role permissions

Verification date: 2026-09-08. Baseline: `main`, `0a2cd2b9a1de2ce7718ced528fd7dc02037ac06f`.
This report covers only the two issues in the user-confirmed Account Management Delete and Role Permission specification. It records the completed local verification before publication. The user subsequently authorized commit and push to main; use git status/log for publication state. Production deployment has not been performed.

## 1. BUG 1 ROOT CAUSE

The existing hard-delete transaction reached deliberate historical foreign keys, notably `fk_collection_records_created_by_login_username` (`collection_records.created_by_login` -> `users.username`, migration 0035, DELETE RESTRICT). It translated that dependency into the linked-record 409 response. Source configuration, OSP actor references and private ownership introduce further RESTRICT dependencies (0052, 0054 and 0062). This was not a missing frontend refresh or a malformed eligible account ID.

The baseline real PostgreSQL reproduction is retained in `artifacts/account-rbac-delete-before.log`. The former 500-only fix correctly prevented an unhandled constraint error, but did not meet this task's newer requirement to delete an eligible account while preserving its history.

## 2. BUG 1 DELETE FLOW BEFORE

Settings confirmation -> authenticated, superuser-authorized DELETE -> validate manageable target -> lock account -> clear activation/reset proofs -> hard DELETE users -> historical FK rejection -> rollback -> controlled 409. The account remained visible and retained access because the transaction did not commit.

## 3. BUG 1 DELETE FLOW AFTER

The same endpoint and real confirmation now perform terminal account deletion. One transaction locks the eligible account, captures active session IDs, removes disposable access proofs, deactivates sessions, sanitizes credentials and sets the existing TEXT status to internal `deleted`, then writes the deletion audit. Failure rolls back everything. Post-commit socket notification/closure remains separate from the transaction.

The retained actor row is not an operational account: it is absent from management lists, reset queues, assignment selectors and current-account statistics. Its stable ID, username and role preserve historical attribution. Normal account controls cannot reactivate, rename or reuse it. This differs from reversible Disable; `deleted` is not added to the public writable account-status choices.

Success returns 200, closes the confirmation, shows the existing success toast and refreshes the account/reset lists. Repeat or already-deleted targets return 404. Self, superuser and the built-in non-login system actor remain protected. Valid legacy TEXT identifiers remain supported; malformed IDs are 400 and unknown printable IDs are 404.

## 4. BUG 1 DATABASE / HISTORY PRESERVATION

| Data/dependency | Handling | Reason |
| --- | --- | --- |
| users historical ID/username/role | Retain as immutable terminal actor | Preserve both username-based attribution and stable-ID ownership |
| Collection records, source configs, OSP targets/revisions/results/reconciliation/audit | No deletion or reassignment | Existing business history and foreign keys remain valid |
| OSP assigned admin and private client owner IDs | Retain original IDs | No transfer of private data to a replacement login |
| audit_logs and banned_sessions history | Retain; append successful deletion audit | Preserve accountability and investigation history |
| user_activity | Retain history; deactivate active sessions with ACCOUNT_DELETED | Revoke access without deleting login history |
| account_activation_tokens, password_reset_requests | Remove target proofs | These must no longer authorize account access |
| collection_nickname_sessions, admin_visible_nicknames | Remove target's current access associations | No residual nickname/session assignment authority |
| Backups | Preserve deleted status; restore inert credentials; do not overwrite an existing terminal actor with an older active row | Avoid restoration-based reactivation |

No historical FK, DELETE action or already-applied migration was changed. No blind cascade, orphaning, anonymization/reassignment of owners, or business-data purge was introduced. Username reuse continues to produce the existing `409 USERNAME_TAKEN`; that is distinct from the removed Delete conflict and deliberately prevents inheritance of another person's history.

## 5. BUG 1 AUTH / SESSION HANDLING

Deletion removes password/2FA capability and email, clears lock/reset flags, bans the terminal actor and revokes active sessions atomically. Existing authentication checks reject the terminal status; login returns the generic invalid-account/credential response and password-reset requests remain non-enumerating. Old cookies/JWTs cannot authorize subsequent requests.

Migration/bootstrap guards prevent terminal identity revival and issuance of new activation/reset/active-session state. Parent-account locking serializes new auth state with deletion. Ordinary credential/account updates exclude terminal rows; mutations racing a completed deletion return 404 before rename/unban/audit side effects. Socket transport failure cannot undo a committed deletion or restore access.

## 6. BUG 1 TESTS

The current real PostgreSQL deletion suite passes 18 tests with zero skips: eligible manager/admin/user, Collection/source/Billing/private ownership, ephemeral cleanup, retained history, self/superuser/system protection, unauthorized/forged roles, malformed/unknown/legacy IDs, concurrent deletion, audit exactly once, sanitized failures with full rollback, old JWT/socket revocation, terminal mutation/token/session guards, bootstrap and backup restore.

The real browser also passes ordinary-user and history-linked-manager confirmation, success toast/dialog closure, account and pending-reset refresh, full reload, former cookie rejection and fresh password-login rejection. Admin deletion is verified through the actual PostgreSQL-backed API suite, not claimed as a separate browser scenario.

Evidence: `artifacts/account-rbac-final-postgres.log`, `artifacts/account-rbac-account-regression.log` (109 passing selected account/auth/session/CSRF/backup tests), `artifacts/account-rbac-affected-regression.log` (includes stale-mutation regression), and the browser artifact below. Suite counts overlap and must not be summed as unique tests.

## 7. BUG 2 ROOT CAUSE

The `tab_<role>_<feature>_enabled` settings were persisted, but access was decided inconsistently. Navigation role arrays and manager page/monitor helpers hardcoded Activity off; some approved manager pages ignored a configured false. Activity read routes excluded manager before the dynamic tab guard. Search endpoints lacked the tab guard. Shared import reads could wrongly depend on the Import tab when Saved/Viewer/Analysis was the enabled consumer.

Baseline resolver execution in `artifacts/account-rbac-permission-before.log` demonstrates manager Activity=false despite its saved flag=true, and manager Search page=true despite its flag=false. Permission refreshes also needed protection against stale in-flight responses and worker-local caches. Finally, multiple dirty permission toggles were previously saved as separate requests, permitting partial saves.

## 8. BUG 2 PERMISSION STORAGE

The existing `system_settings`, `role_setting_permissions` and `setting_versions` tables remain the storage model; no new permission schema or duplicate seed rows were added. A superuser-only `PATCH /api/settings/role-permissions` validates all boolean keys, locks them in deterministic order and commits changed values, versions and audits in one transaction. Invalid/protected/duplicate keys reject the whole operation. Unchanged values produce no extra versions/audits. Overlapping concurrent saves cannot interleave into a mixed permission state.

The frontend sends all dirty role toggles in one batch. The legacy single-setting path delegates tab keys to the same implementation. Existing critical confirmation is retained. Unrelated, non-permission settings retain their previous save behavior; this task does not claim that arbitrary mixed-category settings saves are newly atomic.

## 9. BUG 2 PERMISSION RESOLUTION

`shared/role-feature-access.ts` is the shared effective-access resolver: normalized known feature + supported role + genuine protected boundary + persisted true flag. Missing/unknown values deny access. Superuser retains existing protected access. The repository returns effective visibility, not a second hardcoded manager allowlist that can override editable flags.

Protected Audit/Backup remain superuser-only. Settings stays admin/superuser with account and role mutations superuser-only. Manager Saved/Viewer/System Monitor remain outside existing supported role boundaries. Such controls are read-only with an explanation, rather than appearing editable while having no effect. Manager Activity is configurable read-only access, not a grant of moderation or exact network details.

## 10. BUG 2 SIDEBAR / ROUTE / BACKEND ENFORCEMENT

Navigation and page/monitor-section checks use the shared resolver and wait for permission loading. Disabled content is not rendered. Explicit disabled Activity URLs return the forbidden page; ordinary disabled Search URLs retain the existing authorized-home fallback. Neither grants access to the disabled feature.

Backend tab guards use the same resolver. Manager Activity read endpoints participate in configurable access while investigation, bans and other protected actions keep their existing role checks and IP masking. Search endpoints now enforce Search permission. Shared import read endpoints accept an enabled consuming feature; upload/mutation authorization and underlying data scope are unchanged. Tampering with local state or request role fields does not grant backend authority.

## 11. BUG 2 CACHE / SESSION PROPAGATION

After a successful transaction, only changed roles are invalidated and existing settings notifications are broadcast. Generation checks discard stale in-flight server reads. Existing shared-worker WebSocket transport invalidates the corresponding worker cache before browser notification. No unrelated distributed-cache infrastructure was added.

The browser reloads only relevant role settings, rejects out-of-order responses, fails closed on errors and ignores responses after disposal. Focus/online refresh recovers missed notifications. Visibility responses are `Cache-Control: no-store`. A fresh login reads persisted settings; startup seed verification confirms saved values survive bootstrap. The browser acceptance verifies live OFF/ON without manually refreshing the existing manager page.

## 12. BUG 2 TESTS

Real PostgreSQL integration verifies persistence, ON/OFF cached authorization, legacy single and atomic batch writes, concurrent saves, rollback of a second-key audit failure, safe error responses, idempotency, unchanged roles/features, protected and unauthorized writes, bootstrap persistence and shared-read consumer access. It uses real storage/routes/guards with a test authentication harness; full cookie/CSRF authentication is covered by the separate actual-browser run.

Generic frontend tests cover seven configurable features across manager/admin/user, both states; cache tests cover stale responses, fail-closed disposal, role-scoped events and cross-worker invalidation. Affected regressions pass 335 tests. All 379 client `.test.ts` files pass 1,531 tests in 11 sequential batches, zero failures/skips. This is not a claim that the complete server suite or hosted release-readiness workflow was run.

Browser evidence: `artifacts/account-management-delete-1788823836702_afa781/qa-result.json` reports PASS, 10 checks and no unhandled page errors. It covers actual Settings Activity/Search saves, live menu/page/API access, OFF direct URLs/API denial, fresh login and protected manager boundaries. Screenshots are alongside that JSON. Generated local databases were removed after testing; no real accounts were deleted.

## 13. FILES CHANGED

The complete per-file purpose/change/reason/status inventory is in [the continuation handoff](../CODEX_CONTINUATION_HANDOFF_ACCOUNT_MANAGEMENT_RBAC_FIX.md#6-files-changed). Changes follow existing route -> service -> repository boundaries. Most cross-module edits are small access guards or exclusion of deleted actors from operational selectors; business calculations are untouched.

## 14. MIGRATION / DEPLOYMENT NOTES

New migration: `drizzle/0063_account_terminal_deletion.sql`; journal and rollback manifest updated. It installs terminal-identity/auth-state guards in existing tables, with equivalent fresh-install bootstrap. No new account column, FK rewrite, permission schema or backfill is required. The full migration chain was exercised only in disposable local browser fixtures. Production migration has NOT been run.

For an authorized deployment:

1. Preserve a verified PostgreSQL backup and both release artifacts. Stop old workers and prevent writes; do not mix an old bootstrap with terminal account rows.
2. Deploy this source/artifact and run the existing `npm run db:migrate` against the explicitly verified target database using normal deployment credentials. Do not print credentials or use the disposable QA runner against production.
3. Start only updated workers. Verify login, tab visibility, protected APIs, history reads and receipt paths; use approved disposable accounts for any destructive acceptance test.
4. Confirm deleted usernames stay absent from management and cannot log in, and original private ownership/attribution remain unchanged.

Prefer a forward fix if rollback is needed. Do not simply drop the guards or run the previous artifact after accounts have been deleted. A pre-migration backup cannot know about later deletions: preserve/reapply their identity and revocation ledger before any reviewed restore is exposed to traffic. The 0063 rollback manifest records this boundary. A standard old-artifact restore is safe only if no deletion occurred after that verified backup.

## 15. TYPECHECK / LINT / BUILD STATUS

Final `npm run typecheck`, `npm run lint` and `npm run build` all PASS after the final scope-only removal of an unrelated non-permission transaction wrapper. The current PostgreSQL permission integration was rerun afterwards and also PASS. Evidence: `artifacts/account-rbac-typecheck.log`, `account-rbac-lint.log`, `account-rbac-build.log` and `account-rbac-permission-final.log`.

Schema governance PASS (56 classified tables, explicit FK actions); rollback governance PASS (63/63 migrations); QA runner syntax PASS. Final secret scan, repository hygiene and diff whitespace checks PASS. The documentation inventory matches all 76 changed/untracked paths with no omissions or extras. Build output has a non-fatal Vite CSS plugin timing advisory; production sourcemap gate passes with zero map files.

## 16. OUT-OF-SCOPE FINDINGS

No unrelated finding was intentionally fixed. The build timing advisory is informational. Prior historical Billing/source validity and release-readiness tasks were not reopened. No dependency, CI workflow, UI/CSS redesign, search algorithm or Billing/Collection calculation change is included.

## 17. SCOPE AUDIT

Exactly two issues are addressed. No unrelated user changes were overwritten; the task began on a clean worktree. Applied historical migrations, private ownership and business history are preserved. No secrets were intentionally added, production data changed, or commits/pushes made. A generic non-permission settings transaction change discovered during final review was removed to keep this patch within scope.

## 18. FINAL VERDICT

COMPLETE
