# Database Index Naming

SQR keeps deployed PostgreSQL index names stable because migrations, runtime
bootstrap checks, and rollback validation reference them directly.

Do not rename an existing index for style only; a rename requires a reviewed
migration, a rollback step, and bootstrap compatibility for already-deployed
databases.

## Naming Pattern

- New non-unique indexes use `idx_<table>_<column_or_purpose>`.
- New unique indexes use `idx_<table>_<column_or_purpose>_unique`.
- Expression indexes include the expression in plain language, for example
  `idx_users_username_lower`.
- Composite indexes list columns in query order, for example
  `idx_collection_records_payment_created_id`.
- Drizzle property names may be concise TypeScript identifiers, but the SQL name
  passed to `index(...)` or `uniqueIndex(...)` is the compatibility contract.

## Known Stable Exceptions

These predate the current `idx_` convention and remain stable intentionally:

- `setting_categories_name_unique`
- `system_settings_key_unique`
- `feature_flags_key_unique`

Changing those names would not improve runtime behavior and would add migration
risk, so future work should keep them unless a functional migration requires a
rename.
