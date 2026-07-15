# Backup Restore Runbook

## Restore Chunk Size

`RESTORE_CHUNK_SIZE` is a record-count setting. It controls how many records are
processed per restore chunk for large backup datasets. It is not a byte limit.

Runtime bounds:

- minimum: `1`
- default: `500`
- maximum: `5000`

Use a smaller value only when memory pressure is observed. Use a larger value
only after measuring restore duration and database write latency.

## Preflight

Before changing the chunk size for a restore, validate the backup file:

```bash
npx tsx scripts/validate-restore-chunk.ts --backup path/to/backup.json --chunk-size 500
```

The validator parses the backup JSON, counts array datasets, estimates chunk
count, and rejects plans that would create too many restore chunks.

## Restore Window Checklist

- Confirm backup encryption keys are available.
- Confirm the backup file parses successfully.
- Run the restore chunk validator.
- Put the app in maintenance mode if restoring into production.
- Monitor database CPU, locks, and app memory.
- Verify record counts after restore.

## Legacy Unencrypted Backups

Production rejects stored backup payloads that do not use an `enc:v*` envelope.
This prevents an unauthenticated legacy payload from being restored silently.

If a reviewed historical backup must be migrated, use the temporary emergency
override below for the shortest possible maintenance window:

```bash
BACKUP_ALLOW_LEGACY_UNENCRYPTED_READ=1
```

Before enabling it, verify the backup source, stored checksum, ownership, and
expected record counts. Export or migrate the payload into a newly encrypted
backup, then set the value back to `0` and restart the application. Never leave
the override enabled during normal production operation.
