# Shared Module Boundaries

`shared/` currently contains modules used by both the browser bundle and the
Node runtime. Keep the boundary explicit:

- Browser-safe common modules are pure TypeScript constants, types, and Zod
  schemas with no Node.js, database, secret, filesystem, process, or network
  side effects.
- Server-only modules include Drizzle/PostgreSQL table definitions and runtime
  persistence types. Client code must never import these modules.
- Client-only shared modules should live under `shared/client/` if they are ever
  needed. There are no client-only shared modules today.

The repo still keeps compatibility imports such as `@shared/error-codes` and
`@shared/collection-amount-types` to avoid a risky large-bang import migration.
The target layout is documented in the subdirectory READMEs:

- `shared/common/` for browser-safe isomorphic contracts.
- `shared/server/` for server-only database/runtime contracts.
- `shared/client/` for browser-only shared helpers.

The `shared-boundary-contract` script test enforces the important safety rule:
client code cannot import server-only schema modules.
