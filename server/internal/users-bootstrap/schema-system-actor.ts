import { sql } from "drizzle-orm";
import {
  USERS_BOOTSTRAP_LEGACY_CREATED_BY,
  USERS_BOOTSTRAP_SYSTEM_ACTOR_USERNAME,
} from "./constants";
import type { BootstrapSqlExecutor } from "./schema-types";

const SYSTEM_ACTOR_USER_ID = "system-user";
const SYSTEM_ACTOR_USERNAME = USERS_BOOTSTRAP_SYSTEM_ACTOR_USERNAME;
const SYSTEM_ACTOR_FULL_NAME = "System Actor";
const SYSTEM_ACTOR_PASSWORD_HASH = "$2b$12$jHDoINM4IPl88oSr7lb3Z.aVlpBWVraltDnPv1ibuuu2gd2vLxpAm";

export async function ensureSystemActorBootstrapUser(
  database: BootstrapSqlExecutor,
): Promise<void> {
  await database.execute(sql`
    INSERT INTO public.users (
      id,
      username,
      full_name,
      role,
      password_hash,
      status,
      must_change_password,
      password_reset_by_superuser,
      two_factor_enabled,
      failed_login_attempts,
      locked_by_system,
      created_by,
      is_banned,
      created_at,
      updated_at
    )
    SELECT
      ${SYSTEM_ACTOR_USER_ID},
      ${SYSTEM_ACTOR_USERNAME},
      ${SYSTEM_ACTOR_FULL_NAME},
      'user',
      ${SYSTEM_ACTOR_PASSWORD_HASH},
      'disabled',
      false,
      false,
      false,
      0,
      false,
      ${SYSTEM_ACTOR_USERNAME},
      false,
      now(),
      now()
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.users
      WHERE lower(username) = ${SYSTEM_ACTOR_USERNAME}
    )
  `);
  await database.execute(sql`
    UPDATE public.users
    SET
      username = ${SYSTEM_ACTOR_USERNAME},
      full_name = ${SYSTEM_ACTOR_FULL_NAME},
      role = 'user',
      password_hash = ${SYSTEM_ACTOR_PASSWORD_HASH},
      status = 'disabled',
      must_change_password = false,
      password_reset_by_superuser = false,
      two_factor_enabled = false,
      two_factor_secret_encrypted = NULL,
      two_factor_configured_at = NULL,
      failed_login_attempts = 0,
      locked_at = NULL,
      locked_reason = NULL,
      locked_by_system = false,
      created_by = CASE
        WHEN lower(trim(COALESCE(created_by, ''))) IN ('', ${USERS_BOOTSTRAP_LEGACY_CREATED_BY})
          THEN ${SYSTEM_ACTOR_USERNAME}
        ELSE created_by
      END,
      is_banned = false,
      created_at = COALESCE(created_at, now()),
      updated_at = COALESCE(updated_at, now()),
      password_changed_at = NULL,
      activated_at = NULL,
      last_login_at = NULL
    WHERE lower(username) = ${SYSTEM_ACTOR_USERNAME}
  `);
  await database.execute(sql`
    UPDATE public.users
    SET created_by = ${SYSTEM_ACTOR_USERNAME}
    WHERE lower(trim(COALESCE(created_by, ''))) = ${USERS_BOOTSTRAP_LEGACY_CREATED_BY}
  `);
}
