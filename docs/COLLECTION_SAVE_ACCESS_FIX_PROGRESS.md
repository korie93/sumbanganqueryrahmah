# Collection save access fix - continuation notes

## Request and scope

Fix admin save rejection `Nickname tidak dibenarkan untuk akaun admin ini`
(reported reference `api-d885b641-8309-411`). Admin/user must save under their
verified nickname. Superuser must explicitly select an active nickname and save.
Preserve secure frontend/backend authorization. No general UI redesign.

Start commit: `fbf45737cad7979f984990561e66e7aa3d9c5374`; worktree was clean.
This document records the verified implementation checkpoint before publication.

## Status

COMPLETE locally on 2026-09-05. Final regression, build and browser rerun all passed.
No required implementation or verification remains for this scoped fix.
The user subsequently requested commit and push. Verify publication using the Git
history and remote branch; this file does not claim deployment or CI completion.

## Root causes and changes

- Browser storage was treated as nickname verification without checking the backend
  activity session. Added live `GET /api/collection/nickname-auth/session`; browser
  storage is now only a hint, never permission.
- Actual browser QA reproduced another cause: WebSocket close on page reload deleted
  the verified nickname while the HTTP login remained valid. Normal socket close,
  network error, heartbeat timeout, broadcast failure and server shutdown now clean
  transport state without deleting nickname verification. Logout, moderation,
  password reset, activity expiry and abuse handling remain enforced.
- Admin create authorization now checks the canonical active, password-verified
  nickname for the current login activity; it does not depend on report group setup.
- User create/update rejects another nickname, mismatched activity/username/role,
  inactive or scope-restricted nickname, reset password and stale verification.
  Admin group edits retain their existing scope but also require live verification.
- Password changes/reset revoke nickname sessions atomically. Status/scope changes
  revoke them within the existing repository transaction. Reverification updates
  verified_at and checks it against password_updated_at.
- Superuser has an explicit active-nickname picker, locked during submission.
  Switching nickname remounts the form and isolates customer details/receipts.
- Save access errors request nickname reauthentication, not a misleading network
  retry. Reauthentication with the same nickname preserves mounted form/receipt files.
- Idempotent create/update replay rechecks live access before returning cached data.
  Early multipart replay/rejection cleans only the new parser-owned uploads.
- JSON clients cannot inject parser-owned stored-receipt metadata to bypass upload
  validation, attach another record's receipt or trigger deletion of its file.
- No schema migration, dependency addition or general layout/CSS redesign.

The reported production Reference ID was not correlated with a retained server log;
the diagnosis is based on the exact rejection code and reproduced local behavior.

## Verification evidence

Passed on this fix:

- HTTP save/access and multipart security: 21 tests.
- Mutation handler replay/cleanup: 19 tests (includes forged JSON cleanup protection).
- WebSocket lifecycle: 52 tests; security suite: 246 tests.
  Final security rerun passed: `artifacts/collection-save-security-final.log`.
- Typecheck, client/server lint, production build, production sourcemap gate.
- Secret scan, browser-storage safety, repository hygiene, Collection amount and PII
  rollout contracts.
  The six new untracked task files were also scanned separately: no secret findings.
- Full `npm test` final rerun passed (exit 0), including the final stored-receipt
  injection regression: `artifacts/collection-save-regression-final.log`.
- Actual Chromium UI + local PostgreSQL: 11 checks passed, including matching and
  multipart receipt save for admin/user/superuser; refresh restoration; forged
  nickname rejection; stale browser-marker rejection; reauthentication retaining
  receipt/form; superuser selection and draft isolation; zero uncaught browser errors.
  Final-build evidence: `artifacts/collection-save-access-1788582570261_87e3c7/result.json`.
  The exact disposable QA database was dropped by its launcher after the run.
- Final build passed (exit 0): `artifacts/collection-save-build-final.log`.
  Final typecheck and lint of the last changed files also passed; browser QA above
  includes the stored-receipt guard. `git diff --check` and both QA script syntax
  checks passed. Existing `.env` files were neither printed nor staged.

QA limitation: external receipt scanning uses a deterministic clean test shim only
in the disposable QA server. This is not proof of a production antivirus deployment.
Local optional pgvector/PostGIS extensions were unavailable; Collection flows passed
without them. No claim of a complete application-wide penetration test.

## Reproduce / continue safely

### CI smoke follow-up after c0c2e684 (2026-09-05)

- Reported CI failed in `checkCollectionReceiptUiFlow` waiting for Customer Name.
  The script still injected a browser nickname marker instead of selecting the
  new superuser picker; the form intentionally does not exist before selection.
- Updated `scripts/ui-smoke.mjs` to select the exact active nickname in the UI,
  verify the form appears, and assert saved nickname plus authenticated actor.
  Added a regression contract. Application authorization and CI timeouts are unchanged.
- Added `--ui-smoke` to the isolated QA launcher. This mode applies migrations
  to its newly created database before running the full CI UI script, matching
  CI preparation. An initial bootstrap-only attempt failed earlier in General
  Search; the correctly migrated full run passed without skipping any phases.
- Passed: full UI smoke (exit 0), including receipt, backup/restore and logout;
  `npm run test:scripts` (331 JavaScript + 50 TypeScript tests), 17 targeted CI/smoke
  contract tests, script syntax, secret scan and `git diff --check`.
- Evidence: `artifacts/collection-smoke-picker-ui.log` and
  `artifacts/collection-smoke-picker-scripts.log`. Full-run server artifacts:
  `artifacts/collection-save-access-1788584764150_21b213/`.
  The exact disposable database was dropped after successful completion.
- This follow-up is verified locally only; publication and the next GitHub CI run
  must be checked separately. Reproduce with
  `node scripts/collection-save-access-qa-local.mjs --ui-smoke` after a local build.

Workspace: `C:\Users\Administrator\Desktop\SQR\sumbanganqueryrahmah`.
PowerShell Node PATH: `$env:Path = 'C:\Program Files\nodejs;' + $env:Path`.

1. Read this file and current git diff; preserve all task changes.
2. Confirm any running test/build handles are terminal before restarting.
3. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:security`.
4. Run `npm run build`, then `node scripts/collection-save-access-qa-local.mjs`.
   Requires local PostgreSQL and local permission to create a database.
   The launcher creates a unique `sqr_save_access_*` database and private artifact
   working directory, generates disposable credentials only in process environments,
   starts the built server, tests all roles, stops it and drops only its own database.
   Logs, synthetic receipts and results remain in its printed artifact directory.
5. For any subsequent changes, record new results here before claiming completion.
   Do not commit secrets or deploy without the relevant user request.

Notes persist in this workspace so another account/session can resume. Conversation
history, credentials and the goal itself do not automatically transfer across accounts.
