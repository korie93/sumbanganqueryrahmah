# PostgreSQL Read Replica Plan

## Current State

SQR supports an optional `DATABASE_REPLICA_URL`. When present, the runtime
creates a read pool and exposes `dbRead` for safe read-heavy paths. If the
replica is unavailable, reads fall back to the primary pool and degraded health
is recorded.

Primary remains authoritative for:

- migrations
- writes
- auth and session decisions
- audit logging
- backup and restore
- PII rewrite/retirement jobs

## Rollout

1. Provision a PostgreSQL replica using the managed database platform or DBA
   process.
2. Create a least-privilege read-only role outside application migrations.
3. Configure `DATABASE_REPLICA_URL` with that read-only endpoint.
4. Match primary database TLS verification settings.
5. Deploy to staging and confirm health stays ready.
6. Run read-heavy smoke flows and compare primary load before/after.
7. Promote to production during a normal release window.

## Monitoring

Watch for:

- replica connection failures
- primary fallback counters
- replication lag from the database platform
- query latency changes on read-heavy pages

Replica fallback preserves correctness but reduces capacity isolation. Treat
repeated fallback as a database operations incident.

## Rollback

Remove `DATABASE_REPLICA_URL` from the process environment and restart the app.
All reads return to primary. No database migration is required.

## Analytics Role Boundary

The application does not create analytics or read-only DB users in migrations.
Passwords and grants are environment-specific secrets and should be managed in
the database control plane or a DBA-owned migration outside this app repo.
