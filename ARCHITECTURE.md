# Architecture

## Runtime Entry Points

- `server/index-local.ts`
  Main local server entrypoint. It loads environment variables, builds the full Express/WebSocket runtime through `createLocalRuntimeEnvironment()`, then starts the HTTP server.
- `server/cluster-local.ts`
  Built/runtime cluster entrypoint. It now also loads `dotenv/config`, supervises worker processes, and forks `dist-local/server/index-local.js`.
- `server/app.ts`
  Thin app export for tooling/tests. It uses the same runtime assembly as `index-local.ts`, so middleware and route registration no longer drift.

## Shared App Assembly

The full HTTP/WebSocket runtime is built in:

- `server/internal/local-runtime-environment.ts`

This factory is responsible for:

- creating `Express`, `http.Server`, and `WebSocketServer`
- wiring runtime monitor and circuit protection
- creating services/repositories/auth guards
- registering the HTTP pipeline through `server/internal/local-http-pipeline.ts`
- registering route families through `server/internal/local-server-composition.ts`

That means there is now one place that defines:

- body parser limits
- uploads serving rules
- adaptive protection middleware
- maintenance guard
- route registration order

## Request Flow

The codebase is still transitional, but the target request flow is now clearer:

`routes -> grouped route handlers/controllers -> services -> repositories/storage -> PostgreSQL`

Current status:

- `auth` and `collection` routes are decomposed into grouped route modules
- business logic lives in services
- PostgreSQL access lives in repositories plus `PostgresStorage`
- some domains still use `PostgresStorage` as a facade while repository extraction continues

## Configuration

Validated runtime configuration is centralized in:

- `server/config/runtime.ts`

Core modules no longer read critical environment variables directly. The runtime config now drives:

- app host/port/body limits
- PostgreSQL connection settings
- auth/session secrets and cookie mode
- Ollama host/models/timeouts
- AI gate limits and cache thresholds
- runtime cache TTL defaults

`.env.example` is intended to match these runtime config inputs.

## Domain Boundaries

High-traffic route families are grouped by responsibility:

- `server/routes/auth/*`
  - session/login/me
  - activation/password reset
  - admin account management
- `server/routes/collection/*`
  - nickname auth + nickname CRUD
  - admin group/assignment management
  - records/reporting/receipt delivery

Service boundaries are also being narrowed incrementally with storage ports such as:

- `AuthAccountStorage`
- `AiSearchStorage`

This reduces compile-time coupling without replacing the existing PostgreSQL adapter.

## CI and Verification

The repository uses:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run smoke:ui`

The intended CI flow is:

1. install dependencies
2. typecheck
3. run unit/integration test suites
4. build frontend and server bundles
5. boot the built server against a seeded PostgreSQL service
6. run browser smoke tests

## Documentation Pointers

- `docs/QA_FINAL_CHECKLIST.md`
  Release/manual QA checklist
- `docs/RUNTIME_WORKFLOW.md`
  Local run/build/smoke workflow
