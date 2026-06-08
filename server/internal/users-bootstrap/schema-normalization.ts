import { sql } from "drizzle-orm";
import type { BootstrapSqlExecutor } from "./schema-types";

export async function normalizeUsersBootstrapRows(
  database: BootstrapSqlExecutor,
): Promise<void> {
  await database.execute(sql`
    UPDATE public.users
    SET
      role = CASE
        WHEN lower(trim(COALESCE(role, ''))) IN ('user', 'admin', 'manager', 'superuser')
          THEN lower(trim(COALESCE(role, '')))
        ELSE 'user'
      END,
      status = CASE
        WHEN lower(trim(COALESCE(status, ''))) IN ('pending_activation', 'active', 'suspended', 'disabled')
          THEN lower(trim(COALESCE(status, '')))
        WHEN password_hash ~ '^\\$2[aby]\\$'
          THEN 'active'
        ELSE 'pending_activation'
      END,
      must_change_password = COALESCE(must_change_password, false),
      password_reset_by_superuser = COALESCE(password_reset_by_superuser, false),
      two_factor_enabled = COALESCE(two_factor_enabled, false),
      two_factor_configured_at = CASE
        WHEN COALESCE(two_factor_enabled, false) = false THEN NULL
        ELSE two_factor_configured_at
      END,
      failed_login_attempts = GREATEST(COALESCE(failed_login_attempts, 0), 0),
      locked_at = CASE
        WHEN locked_at IS NULL THEN NULL
        ELSE locked_at
      END,
      locked_reason = CASE
        WHEN locked_at IS NULL THEN NULL
        ELSE NULLIF(trim(COALESCE(locked_reason, '')), '')
      END,
      locked_by_system = CASE
        WHEN locked_at IS NULL THEN false
        ELSE COALESCE(locked_by_system, false)
      END,
      created_at = COALESCE(created_at, now()),
      updated_at = COALESCE(updated_at, now()),
      activated_at = CASE
        WHEN activated_at IS NOT NULL THEN activated_at
        WHEN status = 'active' AND password_changed_at IS NOT NULL THEN password_changed_at
        WHEN status = 'active' THEN created_at
        ELSE activated_at
      END,
      is_banned = COALESCE(is_banned, false)
  `);
}
