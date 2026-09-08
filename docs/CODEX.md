# Codex Guide

## Current Refactor Priorities

When making incremental changes in this repository, prefer this order:

1. keep the runtime boot path deterministic
2. centralize and validate configuration
3. narrow domain boundaries without breaking route contracts
4. decompose large route/controller modules by domain
5. keep CI reproducible with typecheck, tests, build, and smoke

## Runtime Truth

The source local server entrypoint is:

- `server/index-local.ts`

The shared app/runtime assembly lives in:

- `server/internal/local-runtime-environment.ts`

The built clustered runtime starts from:

- `server/cluster-local.ts`

## Required Verification

For runtime, route, or config changes, run the local regression path:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. `npm run smoke:ui`

If the change touches PostgreSQL migrations, bootstrap behavior, schema governance, or runtime database compatibility, also run:

- `npm run test:db-integration`

The ordinary repository sweep can run without PostgreSQL and reports unavailable
isolated database fixtures as skipped. CI runs the role-permission fixture again
after PostgreSQL startup/migrations with `ROLE_PERMISSIONS_POSTGRES_REQUIRED=1`;
Release Verification also sets this flag. In required mode, an unavailable
database is a failure, not a skip. To verify this fixture locally, set the flag
in your shell and run:

- `node --import tsx --test server/repositories/tests/role-permissions-postgres.integration.test.ts`

Use local PostgreSQL only. The fixture creates and cleans its own generated
database, using `PG_MAINTENANCE_DATABASE` (default `postgres`) for provisioning;
it does not use the application database as its test target.

For dependency, security, deployment, or release promotion changes, prefer the full local release gate:

- `npm run release:verify:local`

For deployment or production promotion work, also verify the target server checkout before install, migration, build, or restart:

- `bash scripts/verify-server-checkout.sh "$BRANCH"`

If the change touches authenticated navigation, run smoke with:

- `SMOKE_TEST_USERNAME`
- `SMOKE_TEST_PASSWORD`

The UI smoke API helper allows at most two Playwright transport retries for
`ECONNRESET` on `GET`/`HEAD` only. Writes are never replayed after a connection
reset. HTTP errors still reach the existing status assertions/429 policy, and
persistent connection failures still fail the gate. The socket-reset regression
tests run with `npm run test:scripts` without PostgreSQL or a browser install.

## Safe Refactor Style

- keep endpoints stable
- prefer extraction over rewrite
- introduce typed parsers before changing behavior
- reduce storage/service coupling with narrow ports
- update docs when entrypoints, config, or verification flow changes
