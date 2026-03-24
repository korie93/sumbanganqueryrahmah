# Runtime Workflow

## Main Commands

- `npm run dev:server`
  Run the TypeScript local server entrypoint directly with `tsx`.
- `npm run build`
  Build the frontend and bundle the Node server entrypoints into `dist-local/`.
- `npm run start:built`
  Start the built clustered server from `dist-local/server/cluster-local.js`.
- `npm start`
  Alias for `npm run start:built`.

## Which Entrypoint Does What

- `server/index-local.ts`
  Source entrypoint used by `npm run dev:server`.
- `dist-local/server/index-local.js`
  Worker entrypoint used by the built clustered runtime.
- `server/cluster-local.ts`
  Source cluster supervisor that becomes `dist-local/server/cluster-local.js`.

## Shared Assembly

Both `server/index-local.ts` and `server/app.ts` use:

- `server/internal/local-runtime-environment.ts`

So the following are defined once and shared:

- body limits
- CORS
- maintenance guard
- adaptive protection middleware
- route registration
- WebSocket/runtime wiring

## Configuration Source

Validated runtime config lives in:

- `server/config/runtime.ts`
- Collection optimistic-concurrency API contract:
  - `docs/COLLECTION_CONCURRENCY_API.md`

Critical modules should prefer that config over direct `process.env` reads.

## Recommended Verification

Before merging runtime or routing refactors:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. Start the server:
   - source mode: `npm run dev:server`
   - built mode: `npm run start:built`
5. `npm run smoke:ui`
6. `npm run dr:drill`

For final release verification in one command:

- `npm run release:verify:local`

Release artifacts produced by that flow:

- `artifacts/release-readiness-local/server.log`
- `artifacts/release-readiness-local/monitor-stale-conflicts.json`
- `artifacts/release-readiness-local/smoke-ui/`
- `var/perf/collection-baseline-*.json`
- `var/perf/collection-baseline-*.md`

These directories are generated runtime output and are intentionally gitignored:

- `artifacts/`
- `var/perf/`

For stale-tab/429 health snapshots:

- `npm run monitor:stale-conflicts`

To persist the monitor snapshot to disk during staging or CI:

- set `MONITOR_OUTPUT_FILE`
- run `npm run monitor:stale-conflicts`

For scheduled/manual release verification in GitHub Actions:

- `.github/workflows/release-verification.yml`

For authenticated smoke:

- set `SMOKE_TEST_USERNAME`
- set `SMOKE_TEST_PASSWORD`
- run `npm run smoke:ui`
