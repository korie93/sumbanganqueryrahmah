# Database SSL Configuration Guide

This guide documents how SQR chooses PostgreSQL connection settings and how TLS is enabled for database traffic. It is written for production operators who need a predictable answer before changing `DATABASE_URL`, `PG_*`, or database certificate settings.

## Runtime Precedence

SQR supports two PostgreSQL connection modes:

1. `DATABASE_URL`

   When `DATABASE_URL` is set, the PostgreSQL pool receives it as the complete connection string. The URL must include host, user, database name, and, on production-like hosts, an embedded password.

   Important: `PG_PASSWORD` does not patch a passwordless `DATABASE_URL`. If the URL is missing a password in production-like runtime, startup fails before the pool is created.

2. `PG_*` variables

   When `DATABASE_URL` is empty, SQR builds the pool from `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, and `PG_DATABASE`.

TLS is controlled separately by `DATABASE_SSL`, `DATABASE_SSL_CA`, and `DATABASE_SSL_CA_FILE`. The resolved TLS config is applied to the PostgreSQL pool in both connection modes.

## SSL Defaults

| Runtime shape | `DATABASE_SSL` unset | `DATABASE_SSL=1` | `DATABASE_SSL=0` |
| --- | --- | --- | --- |
| Strict local development | TLS disabled | TLS enabled with certificate verification | TLS disabled |
| Production-like host | TLS enabled with certificate verification | TLS enabled with certificate verification | Startup fails |

Production-like means the app is not strict loopback local development. For example, binding `HOST=0.0.0.0`, using a production URL, or running with production-like deployment settings triggers the hardened path.

## Production Requirements

Use one of these patterns.

### Option A: `DATABASE_URL`

```env
DATABASE_URL=postgresql://sqr_app:GENERATE_ME_DB_PASSWORD_DO_NOT_USE_IN_PRODUCTION@db.production.example.com:5432/sqr_prod
DATABASE_SSL=1
```

This is the preferred option when the deployment platform provides a single managed database URL.

If your managed PostgreSQL provider requires a private root CA, provide it with one of:

```env
DATABASE_SSL_CA_FILE=/etc/sqr/postgres-ca.pem
```

or:

```env
DATABASE_SSL_CA="-----BEGIN CERTIFICATE-----..."
```

Prefer `DATABASE_SSL_CA_FILE` for real deployments so certificates do not get pasted into process manager commands or shell history.

### Option B: `PG_*` Variables

```env
DATABASE_URL=
PG_HOST=db.production.example.com
PG_PORT=5432
PG_USER=sqr_app
PG_PASSWORD=GENERATE_ME_DB_PASSWORD_DO_NOT_USE_IN_PRODUCTION
PG_DATABASE=sqr_prod
DATABASE_SSL=1
DATABASE_SSL_CA_FILE=/etc/sqr/postgres-ca.pem
```

Use this when credentials are managed as separate secrets.

## Certificate Verification

SQR always uses `rejectUnauthorized: true` when TLS is enabled. This means the PostgreSQL server certificate must chain to a trusted CA.

If connection attempts fail with certificate errors:

1. Confirm the PostgreSQL endpoint hostname matches the certificate subject or SAN.
2. Add the provider root CA through `DATABASE_SSL_CA_FILE`.
3. Restart the app and run the deployment health checks.
4. Do not disable `DATABASE_SSL` in production-like runtime; startup will fail by design.

## Verification Commands

Check the full HTTP runtime test suite:

```bash
npm run test:http
```

Run the focused database SSL contract directly:

```bash
npx tsx --test server/http/tests/database-ssl-config.test.ts
```

Run the post-deployment health gate against a deployed host:

```bash
PUBLIC_APP_URL=https://your-domain.example \
scripts/post-deploy-health-check.sh
```

The health gate verifies the HTTP surface after deploy. Database TLS is still validated at startup by the runtime config path before the app accepts traffic.

## Common Misconfigurations

| Misconfiguration | Result | Fix |
| --- | --- | --- |
| `DATABASE_URL` lacks a password while `PG_PASSWORD` is set | Startup fails in production-like runtime | Put the password in `DATABASE_URL` or remove `DATABASE_URL` and use `PG_*` |
| `DATABASE_SSL=0` on a production-like host | Startup fails | Set `DATABASE_SSL=1` or leave it unset |
| Private CA not configured | TLS connection fails certificate verification | Set `DATABASE_SSL_CA_FILE` |
| `PG_HOST` contains a full URL | Startup fails | Put the URL in `DATABASE_URL`, or use only the hostname in `PG_HOST` |
| Inline CA pasted into a shell command | Secret/certificate material may leak to logs or history | Store the CA in a locked-down file and use `DATABASE_SSL_CA_FILE` |

## Rollback

Documentation-only changes can be rolled back with:

```bash
git revert <commit-sha> --no-edit
```

If a production database TLS change causes connection failures, roll back configuration to the last known-good secret set and keep `DATABASE_SSL` enabled. For managed PostgreSQL certificate rotations, restore the previous CA file from the deployment secret store, restart the app, and re-run the post-deployment health gate.
