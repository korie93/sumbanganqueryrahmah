# Disaster Recovery Drill

This runbook verifies backup create/export integrity and optional restore behavior against a live local/staging environment.

## Command

```bash
npm run dr:drill
```

For a full local pre-release gate (tests + smoke + drill):

```bash
npm run release:verify:local
```

## Required Environment

- `DRILL_BASE_URL` (or `SMOKE_BASE_URL`)
- `DRILL_SUPERUSER_USERNAME` (or `SMOKE_TEST_USERNAME`)
- `DRILL_SUPERUSER_PASSWORD` (or `SMOKE_TEST_PASSWORD`)

## Optional Flags

- `DRILL_RUN_RESTORE=1`
  - Enables restore execution.
  - Default is `0` (create/export/integrity verification only).
- `DRILL_KEEP_BACKUP=1`
  - Keeps the drill-created backup instead of deleting it.
  - Default is `0`.
- `DRILL_TIMEOUT_MS`
  - Request timeout per API call (default `15000` ms).

## What The Drill Verifies

1. Login succeeds and auth/csrf cookies are issued.
2. Backup listing is accessible with superuser role.
3. Backup creation succeeds.
4. Backup metadata can be fetched.
5. Export payload checksum matches a recomputed SHA-256 of `backupData`.
6. Optional restore succeeds when enabled.
7. Drill backup is deleted unless `DRILL_KEEP_BACKUP=1`.
8. Session logout is attempted at the end.

## Safety Notes

- Run restore in staging first (`DRILL_RUN_RESTORE=1`) before production-like environments.
- Use a dedicated drill superuser account to avoid single-session lock contention.
- Keep generated logs/artifacts from the run for audit evidence.
