# Server-Only Shared Modules

Target home for server-only shared contracts such as Drizzle/PostgreSQL table
definitions and persistence-row types.

Client code must not import server-only modules. The current server-only module
family is:

- `shared/schema-postgres.ts`
- `shared/schema-postgres-core.ts`
- `shared/schema-postgres-collection.ts`
- `shared/schema-postgres-ai.ts`
- `shared/schema-postgres-settings.ts`

Move these files into this directory only as a dedicated migration PR that also
updates Drizzle config, schema governance tests, and import paths.
