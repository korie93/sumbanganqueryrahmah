import { sql, type SQLWrapper } from "drizzle-orm";
import { db } from "../db-postgres";

export const RUNTIME_REQUIRED_SCHEMA_TABLES = [
  "account_activation_tokens",
  "admin_group_members",
  "admin_groups",
  "admin_visible_nicknames",
  "aeon_branch_postcodes",
  "aeon_branches",
  "ai_category_rules",
  "ai_category_stats",
  "ai_conversations",
  "ai_messages",
  "audit_logs",
  "backup_jobs",
  "backup_payload_chunks",
  "backups",
  "banned_sessions",
  "collection_daily_calendar",
  "collection_daily_targets",
  "collection_nickname_sessions",
  "collection_record_daily_rollup_refresh_queue",
  "collection_record_daily_rollups",
  "collection_record_monthly_rollups",
  "collection_record_receipts",
  "collection_records",
  "collection_staff_nicknames",
  "data_embeddings",
  "data_rows",
  "feature_flags",
  "imports",
  "monitor_alert_incidents",
  "mutation_idempotency_keys",
  "password_reset_requests",
  "role_setting_permissions",
  "setting_categories",
  "setting_options",
  "setting_versions",
  "system_settings",
  "user_activity",
  "users",
] as const;

type RuntimeSchemaVerificationExecutor = {
  execute: (query: string | SQLWrapper) => Promise<{ rows?: unknown[] } | unknown[]>;
};

function resultRows(result: { rows?: unknown[] } | unknown[]) {
  return Array.isArray(result) ? result : result.rows ?? [];
}

export async function findMissingRuntimeSchemaTables(
  executor: RuntimeSchemaVerificationExecutor,
  requiredTables: readonly string[] = RUNTIME_REQUIRED_SCHEMA_TABLES,
): Promise<string[]> {
  const uniqueRequiredTables = Array.from(
    new Set(requiredTables.map((table) => table.trim()).filter(Boolean)),
  );
  if (uniqueRequiredTables.length === 0) {
    return [];
  }

  const result = await executor.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name IN (${sql.join(uniqueRequiredTables.map((table) => sql`${table}`), sql`, `)})
  `);
  const existingTables = new Set(
    resultRows(result)
      .map((row) => String((row as { table_name?: unknown }).table_name || "").trim())
      .filter(Boolean),
  );

  return uniqueRequiredTables.filter((table) => !existingTables.has(table));
}

export async function verifyRuntimeSchemaReady(
  executor: RuntimeSchemaVerificationExecutor = db,
  requiredTables: readonly string[] = RUNTIME_REQUIRED_SCHEMA_TABLES,
): Promise<void> {
  const missingTables = await findMissingRuntimeSchemaTables(executor, requiredTables);
  if (missingTables.length === 0) {
    return;
  }

  throw new Error(
    `Database schema is not migration-ready for runtime startup. Missing public tables: ${missingTables.join(", ")}. Run npm run db:migrate before starting the production server.`,
  );
}
