import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import type { SettingsBootstrapSqlExecutor } from "./settings-bootstrap-shared";

export async function ensureSettingsSchema(database: SettingsBootstrapSqlExecutor) {
  await database.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.setting_categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text UNIQUE NOT NULL,
      description text,
      created_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  await database.execute(sql`ALTER TABLE public.setting_categories ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`
    UPDATE public.setting_categories
    SET created_at = COALESCE(created_at, now())
  `);
  await database.execute(sql`ALTER TABLE public.setting_categories ALTER COLUMN created_at SET NOT NULL`);

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.system_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      category_id uuid NOT NULL REFERENCES public.setting_categories(id) ON DELETE CASCADE,
      key text UNIQUE NOT NULL,
      label text NOT NULL,
      description text,
      type text NOT NULL,
      value text NOT NULL,
      default_value text,
      is_critical boolean DEFAULT false,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  await database.execute(sql`ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`
    UPDATE public.system_settings
    SET updated_at = COALESCE(updated_at, now())
  `);
  await database.execute(sql`ALTER TABLE public.system_settings ALTER COLUMN updated_at SET NOT NULL`);

  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.setting_options (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      setting_id uuid NOT NULL REFERENCES public.system_settings(id) ON DELETE CASCADE,
      value text NOT NULL,
      label text NOT NULL
    )
  `);

  await cleanupSettingsForeignKeyOrphans(database);
  await ensureSettingsForeignKeysNotNull(database);
  await cleanupDuplicateSettingOptions(database);
  await ensureSettingOptionsIndexes(database);
  await ensureRoleSettingPermissionsSchema(database);
  await ensureSettingVersionsSchema(database);
  await ensureFeatureFlagsSchema(database);
}

async function cleanupSettingsForeignKeyOrphans(database: SettingsBootstrapSqlExecutor) {
  try {
    await database.execute(sql`
      DELETE FROM public.setting_options so
      WHERE so.setting_id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.system_settings s
          WHERE s.id = so.setting_id
        )
    `);

    await database.execute(sql`
      DELETE FROM public.system_settings s
      WHERE s.category_id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.setting_categories c
          WHERE c.id = s.category_id
        )
    `);
  } catch (fkCleanupErr) {
    logger.warn("settings foreign-key orphan cleanup skipped", { error: fkCleanupErr });
  }
}

async function ensureSettingsForeignKeysNotNull(database: SettingsBootstrapSqlExecutor) {
  try {
    await database.execute(sql`
      ALTER TABLE public.system_settings
      ALTER COLUMN category_id SET NOT NULL
    `);
  } catch (notNullErr) {
    logger.warn("system_settings category_id NOT NULL enforcement skipped", { error: notNullErr });
  }

  try {
    await database.execute(sql`
      ALTER TABLE public.setting_options
      ALTER COLUMN setting_id SET NOT NULL
    `);
  } catch (notNullErr) {
    logger.warn("setting_options setting_id NOT NULL enforcement skipped", { error: notNullErr });
  }
}

async function cleanupDuplicateSettingOptions(database: SettingsBootstrapSqlExecutor) {
  try {
    await database.execute(sql`
      WITH ranked AS (
        SELECT
          ctid,
          row_number() OVER (PARTITION BY setting_id, value ORDER BY id) AS rn
        FROM public.setting_options
      )
      DELETE FROM public.setting_options so
      USING ranked r
      WHERE so.ctid = r.ctid
        AND r.rn > 1
    `);
  } catch (dupCleanupErr: any) {
    logger.warn("setting_options duplicate cleanup skipped", { error: dupCleanupErr });
  }
}

async function ensureSettingOptionsIndexes(database: SettingsBootstrapSqlExecutor) {
  try {
    await database.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_setting_options_unique_value
      ON public.setting_options (setting_id, value)
    `);
  } catch (idxErr: any) {
    logger.warn("setting_options unique index was not created", { error: idxErr });
  }

  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_setting_options_setting_id
    ON public.setting_options (setting_id)
  `);
}

async function ensureRoleSettingPermissionsSchema(database: SettingsBootstrapSqlExecutor) {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.role_setting_permissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      role text NOT NULL,
      setting_key text NOT NULL,
      can_view boolean DEFAULT false,
      can_edit boolean DEFAULT false
    )
  `);
  await database.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_role_setting_permissions_unique
    ON public.role_setting_permissions (role, setting_key)
  `);
}

async function ensureSettingVersionsSchema(database: SettingsBootstrapSqlExecutor) {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.setting_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      setting_key text NOT NULL,
      old_value text,
      new_value text NOT NULL,
      changed_by text NOT NULL,
      changed_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  await database.execute(sql`ALTER TABLE public.setting_versions ADD COLUMN IF NOT EXISTS changed_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`
    UPDATE public.setting_versions
    SET changed_at = COALESCE(changed_at, now())
  `);
  await database.execute(sql`ALTER TABLE public.setting_versions ALTER COLUMN changed_at SET NOT NULL`);
  await database.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_setting_versions_key_time
    ON public.setting_versions (setting_key, changed_at DESC)
  `);
}

async function ensureFeatureFlagsSchema(database: SettingsBootstrapSqlExecutor) {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS public.feature_flags (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key text UNIQUE NOT NULL,
      enabled boolean NOT NULL DEFAULT false,
      description text,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `);
  await database.execute(sql`ALTER TABLE public.feature_flags ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now()`);
  await database.execute(sql`
    UPDATE public.feature_flags
    SET updated_at = COALESCE(updated_at, now())
  `);
  await database.execute(sql`ALTER TABLE public.feature_flags ALTER COLUMN updated_at SET NOT NULL`);
}
