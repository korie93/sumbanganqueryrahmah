# Production Runbook

This runbook captures the production defaults that must stay aligned with
runtime safety checks.

## Deployment Baseline

The preferred deployment path is the reviewed immutable artifact flow in
`docs/IMMUTABLE_RELEASES.md`. It avoids rebuilding from a mutable server checkout
and verifies the exact commit through `GET /api/health/version`.

- Verify the deployment checkout before install, migration, build, or restart:
  `bash scripts/verify-server-checkout.sh "$BRANCH"`.
- Run `npm run db:migrate` before app startup.
- Keep `SQR_DB_BOOTSTRAP_MODE` empty or set to `migration` on production-like
  hosts.
- Keep `SQR_ALLOW_RUNTIME_DB_BOOTSTRAP_IN_PRODUCTION` disabled except during a
  documented emergency recovery window.
- Use `pm2 reload sqr --update-env` or an equivalent supervisor restart after
  changing process environment.

## Legacy Main Update (Recovery Only)

Use this path only during documented recovery while migrating an older
single-host PM2 deployment. New routine deployments must use the immutable
release artifact flow.

```bash
cd ~/apps/sumbanganqueryrahmah

pm2 stop sqr

git fetch origin --prune
git switch main
git reset --hard origin/main
git log -1 --oneline

BRANCH=main
bash scripts/verify-server-checkout.sh "$BRANCH"

npm ci
npm run db:migrate
npm run build

pm2 restart sqr --update-env
curl -fsS http://127.0.0.1:5000/api/health/ready
pm2 status
pm2 logs sqr --lines 100 --nostream
```

Stop the deployment if the checkout gate fails, if migrations fail, or if the
readiness endpoint does not return healthy JSON. Do not continue by editing
tracked files or committing server-only fixes on the deployment host; fix the
repository, merge through GitHub, then repeat this update path.

Rollback uses the previous known-good commit only after the current failure is
captured:

```bash
git log --oneline -5
git reset --hard <previous-known-good-commit>
npm ci
npm run build
pm2 restart sqr --update-env
curl -fsS http://127.0.0.1:5000/api/health/ready
```

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

### Session revocation readiness recovery

The `session-revocation-store` degraded marker is owned by the revocation store,
not the general Redis PING monitor. After a connection/read failure, the store
checks recovery on Redis `ready` events and retries while idle. Recovery requires
a successful read-only `GET` in the configured revocation key namespace; socket
readiness or `PONG` alone does not clear it. The probe never writes a token,
deletes a key, or changes existing revocations.

- A single recovery probe runs at a time. The default retry delay and each
  connect/command deadline are five seconds. Timed-out connections are destroyed;
  shutdown cancels pending work and recovery timers.
- Session reads still fail closed during failures. A failed or interrupted
  revocation write keeps readiness degraded until a subsequent actual revocation
  write succeeds. A successful GET cannot prove EVAL/SET permissions or repair a
  failed write; no automatic replay of that failed revocation is performed.
- If readiness remains degraded after Redis is reachable, inspect sanitized
  `session_revocation_redis_failure` events and the Redis user's namespace/command
  permissions, including GET and EVAL/SET. Follow the normal account/session
  recovery workflow for the rejected operation. Do not bypass revocation checks
  or erase the health marker just to make a deployment pass.
- Other degraded services still independently block readiness. This recovery
  changes no database schema, frontend behavior, or environment requirements.

CI verifies idle reconnect and a real GET-denied ACL against its disposable Redis
service. `server/auth/tests/redis-session-revocation-live.integration.test.ts`
only runs when explicitly supplied an isolated loopback test URL; never point it
at production Redis (it creates a temporary ACL user and disconnects its own
fixture client).

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
