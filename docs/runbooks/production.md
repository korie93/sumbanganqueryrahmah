# Production Runbook

This runbook captures the production defaults that must stay aligned with
runtime safety checks.

## Deployment Baseline

- Verify the deployment checkout before install, migration, build, or restart:
  `bash scripts/verify-server-checkout.sh "$BRANCH"`.
- Run `npm run db:migrate` before app startup.
- Keep `SQR_DB_BOOTSTRAP_MODE` empty or set to `migration` on production-like
  hosts.
- Keep `SQR_ALLOW_RUNTIME_DB_BOOTSTRAP_IN_PRODUCTION` disabled except during a
  documented emergency recovery window.
- Use `pm2 reload sqr --update-env` or an equivalent supervisor restart after
  changing process environment.

## Redis TLS

Production-like hosts must use Redis-backed runtime state for rate limiting,
2FA replay protection, session revocation, and optional WebSocket fan-out.

Required posture:

- Use a `rediss://` endpoint for non-loopback production Redis.
- Keep certificate verification enabled.
- If Redis uses a private CA, set `NODE_EXTRA_CA_CERTS` in the process manager
  to the Redis CA PEM file path.
- Do not set process-wide TLS verification bypasses.
- Loopback `redis://127.0.0.1` is acceptable only when Redis is bound to
  localhost, protected mode is enabled, and the process is single-host.

Verification:

```bash
redis-cli --tls --cacert /path/to/redis-ca.crt -h localhost -p 6380 ping
pm2 env 0 | grep -E 'NODE_EXTRA_CA_CERTS|SQR_REDIS|SQR_RATE_LIMIT_STORE'
curl -fsS http://127.0.0.1:5000/api/health/ready
```

Expected app behavior during Redis outage:

- Session revocation checks fail closed.
- Protected requests can be rejected instead of silently downgrading to memory.
- Treat repeated Redis degraded logs as an infrastructure incident.

## Session Secret Rotation

Planned rotation uses a manual compatibility window:

1. Generate a new active session secret in the secret manager.
2. Move the previous active secret into `SESSION_SECRET_PREVIOUS`.
3. Restart every app process in the same maintenance window.
4. Verify login, logout, and authenticated API calls.
5. Keep previous entries only for the intended session TTL overlap.
6. Remove stale previous entries and restart again.

Emergency compromise rotation skips the compatibility window:

1. Replace the active session secret.
2. Clear `SESSION_SECRET_PREVIOUS`.
3. Restart every app process.
4. Expect all existing sessions to be invalidated.

See also `docs/SECRET_ROTATION.md` and `docs/KEY-ROTATION-RUNBOOK.md`.

## Read Replica

`DATABASE_REPLICA_URL` is optional. When configured, the app creates a read
pool for safe read-heavy paths and falls back to primary on replica failure.

Operational rules:

- Use the same TLS verification posture as primary PostgreSQL.
- Prefer a least-privilege read-only DB user for the replica endpoint.
- Keep migrations, writes, auth, audit, backup, and restore on primary.
- Watch health/degraded-state output for replica fallback events.

See `docs/database/read-replica-plan.md`.

## Emergency Database Bootstrap

Runtime database bootstrap in production is an escape hatch, not the supported
deployment path. If it must be enabled, the app emits
`DANGEROUS_RUNTIME_DB_BOOTSTRAP_ACTIVE` and prints a startup security warning.

Use the dedicated procedure in `docs/runbooks/emergency-db-bootstrap.md`.
