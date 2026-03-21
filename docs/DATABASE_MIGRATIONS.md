# Database Migrations

## Current Model

This repository now has first-class Drizzle migration tooling, but the database is still in a hybrid state:

- Drizzle-managed schema definitions currently live in [shared/schema-postgres.ts](../shared/schema-postgres.ts).
- Generated Drizzle SQL migrations live in [drizzle/](../drizzle/).
- Legacy hand-written SQL files still exist in [server/sql/](../server/sql/).
- Several tables are still created and normalized by idempotent bootstrap modules under `server/internal/`.

That means Drizzle is ready to manage new schema work, but it is not yet the complete source of truth for every table in the database.

## Commands

- `npm run db:generate -- --name <migration_name>`
- `npm run db:generate:custom -- --name <migration_name>`
- `npm run db:migrate`
- `npm run db:migrate:cli`
- `npm run db:studio`
- `npm run db:introspect`

## Recommended Workflow

For Drizzle-managed tables:

1. Update [shared/schema-postgres.ts](../shared/schema-postgres.ts).
2. Generate a migration with `npm run db:generate -- --name <migration_name>`.
3. Review the generated SQL under [drizzle/](../drizzle/).
4. Apply it with `npm run db:migrate`.

For schema work that still touches legacy bootstrap-managed areas:

1. Prefer `npm run db:generate:custom -- --name <migration_name>`.
2. Keep the related bootstrap module idempotent until that table/domain is fully modeled in Drizzle.
3. If needed, use `npm run db:introspect` to help map legacy tables into typed schema definitions incrementally.

## Important Caveat

Avoid using `db:push` as the default workflow in this repository. The current Drizzle schema does not yet represent the full database, so a push-style sync would be a riskier fit than reviewed SQL migrations.

`npm run db:migrate` intentionally uses the repo's Node wrapper around Drizzle's runtime migrator instead of the raw Drizzle CLI. This has been more reliable in the current local environment and surfaces normal Node errors if a migration fails. `npm run db:migrate:cli` is still available for upstream debugging when needed.
