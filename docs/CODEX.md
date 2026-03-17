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

For runtime, route, or config changes, run:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. `npm run smoke:ui`

If the change touches authenticated navigation, run smoke with:

- `SMOKE_TEST_USERNAME`
- `SMOKE_TEST_PASSWORD`

## Safe Refactor Style

- keep endpoints stable
- prefer extraction over rewrite
- introduce typed parsers before changing behavior
- reduce storage/service coupling with narrow ports
- update docs when entrypoints, config, or verification flow changes
