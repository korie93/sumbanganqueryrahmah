# Drizzle Migrations

Generated Drizzle SQL migrations and metadata live in this directory.

Current state:
- `shared/schema-postgres.ts` covers only the subset of tables already modeled in Drizzle.
- Additional tables are still provisioned by idempotent bootstrap code under `server/internal/*Bootstrap.ts`.
- Legacy hand-written SQL migrations still live in `server/sql/`.
- Those legacy SQL files are compatibility artifacts only; every legacy SQL-backed
  table must also remain covered by a reviewed Drizzle schema entry and a
  reviewed Drizzle migration, and `npm run verify:db-schema-governance` now
  fails if that pairing drifts.

Safe workflow:
1. Update `shared/schema-postgres.ts` for Drizzle-managed tables.
2. Run `npm run db:generate -- --name <migration_name>`.
3. Review the generated SQL before applying it.
4. Run `npm run db:migrate`.
5. Run `npm run verify:db-schema-governance` if the change affects table ownership or introduces new schema sources.

Until more of the schema is moved into Drizzle:
- Prefer `npm run db:generate:custom -- --name <migration_name>` for custom SQL when a change still depends on legacy bootstrap-managed tables.
- Do not treat `db:push` as a safe default workflow for this repository.

Notes:
- `npm run db:migrate` uses the repo's Node wrapper around Drizzle's runtime migrator.
- `npm run db:migrate:cli` keeps the raw Drizzle CLI available for debugging.
- Schema ownership is tracked in `scripts/db-schema-governance.manifest.mjs`.
