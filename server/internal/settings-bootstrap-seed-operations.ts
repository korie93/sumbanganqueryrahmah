import { sql } from "drizzle-orm";
import {
  ADMIN_EDITABLE_SETTING_KEYS,
  MAINTENANCE_TYPE_OPTIONS,
  SETTINGS_CATEGORIES,
  buildSettingsSeedItems,
} from "./settings-bootstrap-seed";
import type {
  SettingsBootstrapSqlExecutor,
  SettingsCategorySeedItem,
  SettingsSeedItem,
} from "./settings-bootstrap-shared";

export async function seedSettingCategories(
  database: SettingsBootstrapSqlExecutor,
  categories: SettingsCategorySeedItem[] = SETTINGS_CATEGORIES,
) {
  for (const category of categories) {
    await database.execute(sql`
      INSERT INTO public.setting_categories (name, description)
      VALUES (${category.name}, ${category.description})
      ON CONFLICT (name) DO UPDATE SET
        description = EXCLUDED.description
    `);
  }
}

export async function seedSystemSettings(
  database: SettingsBootstrapSqlExecutor,
  settingsSeed: SettingsSeedItem[],
) {
  for (const setting of settingsSeed) {
    await database.execute(sql`
      INSERT INTO public.system_settings (
        category_id, key, label, description, type, value, default_value, is_critical, updated_at
      )
      VALUES (
        (SELECT id FROM public.setting_categories WHERE name = ${setting.categoryName}),
        ${setting.key},
        ${setting.label},
        ${setting.description},
        ${setting.type},
        ${setting.value},
        ${setting.defaultValue},
        ${setting.isCritical},
        now()
      )
      ON CONFLICT (key) DO UPDATE SET
        category_id = EXCLUDED.category_id,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        type = EXCLUDED.type,
        default_value = EXCLUDED.default_value,
        is_critical = EXCLUDED.is_critical
    `);
  }
}

export async function seedMaintenanceTypeOptions(database: SettingsBootstrapSqlExecutor) {
  const maintenanceTypeRes = await database.execute(sql`
    SELECT id
    FROM public.system_settings
    WHERE key = 'maintenance_type'
    LIMIT 1
  `);
  const maintenanceTypeId = String((maintenanceTypeRes.rows as any[])[0]?.id || "").trim();
  if (!maintenanceTypeId) {
    return;
  }

  await database.execute(sql`
    DELETE FROM public.setting_options
    WHERE setting_id = ${maintenanceTypeId}
  `);

  for (const option of MAINTENANCE_TYPE_OPTIONS) {
    await database.execute(sql`
      INSERT INTO public.setting_options (setting_id, value, label)
      VALUES (${maintenanceTypeId}, ${option.value}, ${option.label})
    `);
  }
}

export async function seedRoleSettingPermissions(
  database: SettingsBootstrapSqlExecutor,
  settingsSeed: SettingsSeedItem[],
) {
  for (const setting of settingsSeed) {
    await database.execute(sql`
      INSERT INTO public.role_setting_permissions (role, setting_key, can_view, can_edit)
      VALUES ('superuser', ${setting.key}, true, true)
      ON CONFLICT (role, setting_key) DO UPDATE SET
        can_view = EXCLUDED.can_view,
        can_edit = EXCLUDED.can_edit
    `);
    await database.execute(sql`
      INSERT INTO public.role_setting_permissions (role, setting_key, can_view, can_edit)
      VALUES ('admin', ${setting.key}, true, ${ADMIN_EDITABLE_SETTING_KEYS.has(setting.key)})
      ON CONFLICT (role, setting_key) DO UPDATE SET
        can_view = EXCLUDED.can_view,
        can_edit = EXCLUDED.can_edit
    `);
    await database.execute(sql`
      INSERT INTO public.role_setting_permissions (role, setting_key, can_view, can_edit)
      VALUES ('user', ${setting.key}, false, false)
      ON CONFLICT (role, setting_key) DO UPDATE SET
        can_view = EXCLUDED.can_view,
        can_edit = EXCLUDED.can_edit
    `);
  }
}

export async function seedEnterpriseSettings(database: SettingsBootstrapSqlExecutor) {
  const settingsSeed = buildSettingsSeedItems();

  await seedSettingCategories(database);
  await seedSystemSettings(database, settingsSeed);
  await seedMaintenanceTypeOptions(database);
  await seedRoleSettingPermissions(database, settingsSeed);
}
