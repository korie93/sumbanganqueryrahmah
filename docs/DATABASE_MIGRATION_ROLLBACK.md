# Database Migration Rollback Runbook

SQR uses reviewed forward Drizzle SQL migrations under `drizzle/`. Existing
historical migrations create and reshape production tables, so automated
`DROP`-style down migrations would be data-destructive unless they run after a
verified backup. The supported rollback path is therefore backup restore plus
application artifact rollback.

## Before Running Migrations

1. Take a PostgreSQL backup immediately before `npm run db:migrate`.
2. Record the backup identifier, release artifact, previous artifact, and
   current `public.__drizzle_migrations` rows.
3. Run `npm run verify:db-migration-rollback`; it must report full manifest
   coverage before deployment continues.
4. Acquire the normal migration advisory lock by using `npm run db:migrate`.

## Rollback Trigger

Rollback if a migration causes startup readiness failure, schema verification
failure, login or collection read/write failure, or data integrity checks fail.

## Rollback Procedure

1. Stop application workers or put the service into maintenance mode.
2. Restore the verified pre-migration PostgreSQL backup into the target
   database.
3. Deploy or restart the previous stable application artifact.
4. Confirm `public.__drizzle_migrations` matches the restored backup state.
5. Run `npm run smoke:preflight`.
6. Manually verify login, dashboard read paths, collection list/read paths, and
   receipt preview/download.

## Governance

Rollback coverage is tracked in
`scripts/db-migration-rollback.manifest.mjs`. Every SQL file under `drizzle/`
must have a manifest entry before CI passes. Future migrations may add a
`reversible-down` plan with a checked-in down SQL file, but a verified backup is
still mandatory before running it.
