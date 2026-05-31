# Database Cascade Delete Review

Last reviewed: 2026-05-31

This document records every intentional `onDelete: "cascade"` rule in the PostgreSQL Drizzle schema. Cascade deletes are acceptable only for strictly dependent child rows whose lifetime is owned by the parent row. Do not add or remove cascades without a migration, rollback plan, and data-loss review.

## Current Cascades

| File | Child table.column | Parent | Rationale |
| --- | --- | --- | --- |
| `shared/schema-postgres-core.ts` | `account_activation_tokens.user_id` | `users.id` | Activation tokens have no value after the user is deleted. |
| `shared/schema-postgres-core.ts` | `password_reset_requests.user_id` | `users.id` | Password reset records are user-scoped security artifacts. |
| `shared/schema-postgres-core.ts` | `data_rows.import_id` | `imports.id` | Imported rows are owned by the import batch. |
| `shared/schema-postgres-core.ts` | `user_activity.user_id` | `users.id` | Activity rows are user-scoped session records. |
| `shared/schema-postgres-core.ts` | `banned_sessions.activity_id` | `user_activity.id` | Ban rows depend on the activity/session row. |
| `shared/schema-postgres-core.ts` | `backup_payload_chunks.backup_id` | `backups.id` | Backup chunks are not meaningful without the backup manifest. |
| `shared/schema-postgres-collection.ts` | `collection_record_receipts.collection_record_id` | `collection_records.id` | Receipt metadata belongs to a single collection record. |
| `shared/schema-postgres-collection.ts` | `admin_group_members.admin_group_id` | `admin_groups.id` | Group membership is owned by the group. |
| `shared/schema-postgres-collection.ts` | `collection_nickname_sessions.activity_id` | `user_activity.id` | Nickname verification sessions are tied to a login activity. |
| `shared/schema-postgres-collection.ts` | `admin_visible_nicknames.admin_user_id` | `users.id` | Visibility grants must disappear with the admin user. |
| `shared/schema-postgres-collection.ts` | `admin_visible_nicknames.nickname_id` | `collection_staff_nicknames.id` | Visibility grants must disappear with the nickname. |
| `shared/schema-postgres-ai.ts` | `data_embeddings.import_id` | `imports.id` | Embeddings are derived from import data. |
| `shared/schema-postgres-ai.ts` | `data_embeddings.row_id` | `data_rows.id` | Embeddings are derived from one data row. |
| `shared/schema-postgres-ai.ts` | `ai_messages.conversation_id` | `ai_conversations.id` | Messages are owned by the conversation. |
| `shared/schema-postgres-settings.ts` | `system_settings.category_id` | `setting_categories.id` | Settings are grouped under a seeded category. |
| `shared/schema-postgres-settings.ts` | `setting_options.setting_id` | `system_settings.id` | Setting options are owned by the setting definition. |

## Explicit Non-Cascades

- `collection_records.created_by_login` uses `restrict` so deleting a user cannot erase collection records.
- Collection daily target/calendar audit actor fields use `set null` so historical operational records survive user deletion.
- `audit_logs` has no foreign-key cascade because audit evidence must not be deleted implicitly.
- `backup_jobs.backup_id` is not cascade-bound so job history can survive backup object cleanup.

## Change Rules

1. Prefer `restrict` for business records, audit trails, and user-created financial records.
2. Prefer `set null` for historical actor references where the record must survive but the actor may be removed.
3. Use `cascade` only for dependent rows that cannot be interpreted without the parent.
4. Add or remove cascade behavior only through an explicit migration and a rollback migration.
5. Add an integration test for any new cascade involving user, collection, backup, or audit data.
