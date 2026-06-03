# Emergency Database Bootstrap

Use this only when production migrations cannot be run safely and the app must
temporarily rely on idempotent runtime compatibility bootstrap.

## Preconditions

- A recent database backup exists and has been restore-tested.
- The target deployment is in a maintenance window.
- Operators understand that runtime bootstrap can mutate schema at app startup.
- A rollback plan exists for the app release and database snapshot.

## Procedure

1. Stop app traffic or put the site in maintenance mode.
2. Set `SQR_DB_BOOTSTRAP_MODE` to `runtime`.
3. Enable the explicit production override in the process manager.
4. Start one app process only.
5. Confirm startup logs include the security warning and no migration errors.
6. Run smoke checks for login, collection reads, imports, and health.
7. Remove the override immediately after recovery.
8. Run `npm run db:migrate` as soon as the migration path is healthy again.
9. Restart with migration-first mode.

## Rollback

- Stop the app.
- Restore the previous app release.
- Restore the database snapshot if runtime bootstrap made incompatible schema
  changes.
- Remove the override from the process manager before restarting.

Target removal for this escape hatch is v2.0.
