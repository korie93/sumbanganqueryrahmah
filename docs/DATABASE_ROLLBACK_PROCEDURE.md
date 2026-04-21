# Database Rollback Procedure

This runbook exists for reviewed production rollback decisions when a database migration fails or a newly applied schema change must be reversed.

The repository is still hybrid:

- reviewed Drizzle SQL lives in [`drizzle/`](../drizzle/)
- several tables are still normalized by runtime bootstrap modules under [`server/internal/`](../server/internal/)

Because of that hybrid model, rollback must stay explicit and operator-reviewed instead of relying on a blanket automated "down migration" flow.

## Pre-Flight Checks

Before applying reviewed schema changes in a non-local environment:

1. Run `npm run db:check`.
2. Run `npm run verify:db-schema-governance`.
3. Run `npm run test:db-integration` when the change touches bootstrap-managed or hybrid tables.
4. Capture a backup that can be restored independently of the app rollout.
5. Review the exact SQL files being applied and note whether they:
   - add or drop constraints
   - backfill or rewrite existing data
   - depend on bootstrap-managed tables
   - need follow-up application code deployed in the same release

## When to Roll Back

Use rollback when one of these happens after migration apply:

- the app fails readiness or health checks because of schema incompatibility
- a backfill or constraint causes live request failures
- a migration partially succeeds and leaves the schema in an unexpected state
- application code must be reverted and the new schema is not backward-compatible

## Preferred Rollback Order

1. Stop or quiesce traffic if the failure is actively mutating data.
2. Preserve evidence first:
   - copy the failing migration logs
   - capture `SELECT * FROM public.__drizzle_migrations ORDER BY created_at;`
   - capture schema details for affected tables and constraints
3. Decide whether the safest move is:
   - application rollback only, while keeping the schema
   - targeted SQL rollback for the last migration
   - full database restore from the pre-flight backup

## Safe Rollback Paths

### A. Application Rollback Only

Use this when the schema change is backward-compatible and the failure is in app logic.

1. Revert the application deployment.
2. Keep the migrated schema in place.
3. Verify the reverted app still passes health checks and critical flows.

### B. Targeted SQL Rollback

Use this only for reviewed reversible migrations where the data impact is understood.

1. Connect to PostgreSQL with an operator account.
2. Open a transaction when the rollback SQL is transactional and bounded.
3. Reverse only the reviewed change set for the affected migration.
4. Remove or correct the corresponding row in `public.__drizzle_migrations` only if the schema was fully reverted.
5. Re-run:
   - `npm run db:check`
   - `npm run verify:db-schema-governance`

Do not blindly delete migration ledger rows if the schema or data was only partially reverted.

### C. Restore From Backup

Use this when the migration rewrote data, partially corrupted state, or cannot be safely reversed with bounded SQL.

1. Stop app instances that can still write to the affected database.
2. Restore the last known good backup using the reviewed backup/restore path.
3. Re-apply only the migrations that are still required and known-safe.
4. Bring app instances back gradually and verify critical routes.

## Post-Rollback Validation

After any rollback path:

1. Confirm `GET /api/health/live` and critical authenticated routes succeed.
2. Confirm `public.__drizzle_migrations` matches the actual schema state.
3. Run targeted integration tests for the affected domain before the next redeploy.
4. Document:
   - what failed
   - whether the rollback was app-only, SQL, or full-restore
   - whether a replacement reviewed migration is required

## Notes

- Do not use `db:push` as an emergency repair tool in this repository.
- Prefer a forward fix over rollback when the migration is already safely applied and the app can be made compatible with a smaller code change.
- For hybrid bootstrap-managed tables, always verify the matching bootstrap module still converges on the intended final schema after rollback.
