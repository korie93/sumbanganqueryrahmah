import { db } from "../db-postgres";
import { sql } from "drizzle-orm";
import {
  type MaintenanceState,
  type SettingsOption,
  type SystemSettingCategory,
  type SystemSettingItem,
  ROLE_TAB_SETTINGS,
  roleTabSettingKey,
} from "../config/system-settings";
import {
  buildSettingsCategories,
  buildSystemSettingItem,
  mapSettingOptions,
} from "./settings-repository-view-utils";
import {
  applySettingConstraints,
  asTruthySetting,
  buildAppConfig,
  buildMaintenanceState,
  isAdminMaintenanceEditableKey,
  normalizeSettingValue,
  parseSettingType,
  TRUTHY_SETTING_VALUES,
} from "./settings-repository-value-utils";

function buildTextInList(values: string[]) {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

function queryRows<T extends Record<string, unknown>>(result: { rows?: unknown[] }): T[] {
  return Array.isArray(result.rows) ? (result.rows as T[]) : [];
}

function firstQueryRow<T extends Record<string, unknown>>(result: { rows?: unknown[] }): T | undefined {
  return queryRows<T>(result)[0];
}

export class SettingsRepository {
  private async isAdminMaintenanceEditingEnabled(): Promise<boolean> {
    const result = await db.execute(sql`
      SELECT value
      FROM public.system_settings
      WHERE key = 'admin_can_edit_maintenance_message'
      LIMIT 1
    `);

    const row = firstQueryRow<{ value?: unknown }>(result);
    return TRUTHY_SETTING_VALUES.has(String(row?.value ?? "").trim().toLowerCase());
  }

  async getSettingsForRole(role: string): Promise<SystemSettingCategory[]> {
    const rows = await db.execute(sql`
      SELECT
        c.id as category_id,
        c.name as category_name,
        c.description as category_description,
        s.id as setting_id,
        s.key,
        s.label,
        s.description,
        s.type,
        s.value,
        s.default_value,
        s.is_critical,
        s.updated_at,
        COALESCE(p.can_view, false) as can_view,
        COALESCE(p.can_edit, false) as can_edit
      FROM public.setting_categories c
      JOIN public.system_settings s ON s.category_id = c.id
      LEFT JOIN public.role_setting_permissions p
        ON p.setting_key = s.key
       AND p.role = ${role}
      WHERE COALESCE(p.can_view, false) = true
      ORDER BY c.name, s.label
    `);

    const settingIds = queryRows<{ setting_id?: unknown }>(rows)
      .map((row) => String(row.setting_id))
      .filter((value) => value.length > 0);
    let optionsMap = new Map<string, SettingsOption[]>();

    if (settingIds.length > 0) {
      const optionsRows = await db.execute(sql`
        SELECT DISTINCT ON (setting_id, value) setting_id, value, label
        FROM public.setting_options
        WHERE setting_id IN (${buildTextInList(settingIds)})
        ORDER BY setting_id, value, label
      `);
      optionsMap = mapSettingOptions(optionsRows.rows as Record<string, unknown>[]);
    }

    const adminMaintenanceEditingEnabled =
      role === "admin" ? await this.isAdminMaintenanceEditingEnabled() : true;

    return buildSettingsCategories({
      rows: rows.rows as Record<string, unknown>[],
      role,
      adminMaintenanceEditingEnabled,
      optionsMap,
    });
  }

  async getBooleanSystemSetting(key: string, fallback = false): Promise<boolean> {
    const result = await db.execute(sql`
      SELECT value
      FROM public.system_settings
      WHERE key = ${key}
      LIMIT 1
    `);

    const row = firstQueryRow<{ value?: unknown }>(result);
    if (!row) return fallback;
    return asTruthySetting(row.value, fallback);
  }

  async getRoleTabVisibility(role: string): Promise<Record<string, boolean>> {
    if (role === "superuser") {
      return {};
    }

    const roleKey = role === "admin" ? "admin" : role === "user" ? "user" : null;
    if (!roleKey) {
      return {};
    }

    const tabs = ROLE_TAB_SETTINGS[roleKey];
    const visibility: Record<string, boolean> = {};
    for (const tab of tabs) {
      visibility[tab.pageId] = tab.defaultEnabled;
    }

    const keys = tabs.map((tab) => roleTabSettingKey(roleKey, tab.suffix));
    if (keys.length === 0) {
      return visibility;
    }

    const rows = await db.execute(sql`
      SELECT key, value
      FROM public.system_settings
      WHERE key IN (${buildTextInList(keys)})
    `);

    const pageIdByKey = new Map<string, string>();
    for (const tab of tabs) {
      pageIdByKey.set(roleTabSettingKey(roleKey, tab.suffix), tab.pageId);
    }

    for (const row of queryRows<{ key?: unknown; value?: unknown }>(rows)) {
      const key = String(row.key || "");
      const pageId = pageIdByKey.get(key);
      if (!pageId) continue;

      visibility[pageId] = asTruthySetting(row.value, visibility[pageId]);
    }

    if (roleKey === "admin") {
      const result = await db.execute(sql`
        SELECT value
        FROM public.system_settings
        WHERE key = 'canViewSystemPerformance'
        LIMIT 1
      `);
      const canViewSystemPerformance = asTruthySetting(
        firstQueryRow<{ value?: unknown }>(result)?.value,
        false,
      );
      visibility.canViewSystemPerformance = canViewSystemPerformance;
      visibility.monitor = visibility.monitor === true && canViewSystemPerformance;
    }

    return visibility;
  }

  async updateSystemSetting(params: {
    role: string;
    settingKey: string;
    value: string | number | boolean | null;
    confirmCritical?: boolean;
    updatedBy: string;
  }): Promise<{
    status: "updated" | "unchanged" | "forbidden" | "not_found" | "requires_confirmation" | "invalid";
    message: string;
    setting?: SystemSettingItem;
    shouldBroadcast?: boolean;
  }> {
    const settingRes = await db.execute(sql`
      SELECT
        s.id,
        s.key,
        s.label,
        s.description,
        s.type,
        s.value,
        s.default_value,
        s.is_critical,
        s.updated_at,
        COALESCE(p.can_edit, false) as can_edit
      FROM public.system_settings s
      LEFT JOIN public.role_setting_permissions p
        ON p.setting_key = s.key
       AND p.role = ${params.role}
      WHERE s.key = ${params.settingKey}
      LIMIT 1
    `);

    const current = firstQueryRow<Record<string, unknown>>(settingRes);
    if (!current) {
      return { status: "not_found", message: "Setting not found." };
    }

    if (
      params.role === "admin"
      && isAdminMaintenanceEditableKey(String(current.key))
      && !(await this.isAdminMaintenanceEditingEnabled())
    ) {
      return { status: "forbidden", message: "Admin is not allowed to edit maintenance message settings." };
    }

    if (current.can_edit !== true) {
      return { status: "forbidden", message: "You do not have permission to edit this setting." };
    }

    if (current.is_critical === true && !params.confirmCritical) {
      return {
        status: "requires_confirmation",
        message: "Critical setting requires explicit confirmation.",
      };
    }

    const settingType = parseSettingType(current.type);
    const normalized = normalizeSettingValue(settingType, params.value);
    if (normalized === null) {
      return { status: "invalid", message: `Invalid value for type ${settingType}.` };
    }

    const constrained = applySettingConstraints(String(current.key), settingType, normalized);
    if (!constrained.valid) {
      return { status: "invalid", message: constrained.message || "Invalid setting value." };
    }

    const nextValue = constrained.value;
    if (settingType === "select") {
      const optionRes = await db.execute(sql`
        SELECT 1
        FROM public.setting_options
        WHERE setting_id = ${current.id}
          AND value = ${normalized}
        LIMIT 1
      `);

      if (queryRows(optionRes).length === 0) {
        return { status: "invalid", message: "Selected option is not allowed." };
      }
    }

    const previousValue = String(current.value ?? "");
    if (previousValue === nextValue) {
      return { status: "unchanged", message: "No change detected." };
    }

    await db.execute(sql`
      UPDATE public.system_settings
      SET value = ${nextValue}, updated_at = now()
      WHERE id = ${current.id}
    `);

    await db.execute(sql`
      INSERT INTO public.setting_versions (setting_key, old_value, new_value, changed_by, changed_at)
      VALUES (${params.settingKey}, ${previousValue}, ${nextValue}, ${params.updatedBy}, now())
    `);

    const latestRes = await db.execute(sql`
      SELECT
        id,
        key,
        label,
        description,
        type,
        value,
        default_value,
        is_critical,
        updated_at
      FROM public.system_settings
      WHERE id = ${current.id}
      LIMIT 1
    `);

    const latest = firstQueryRow<Record<string, unknown>>(latestRes) ?? current;
    return {
      status: "updated",
      message: "Setting updated successfully.",
      shouldBroadcast: String(params.settingKey).startsWith("maintenance_"),
      setting: buildSystemSettingItem({ row: latest, canEdit: true }),
    };
  }

  async getMaintenanceState(now: Date = new Date()): Promise<MaintenanceState> {
    const rows = await db.execute(sql`
      SELECT key, value
      FROM public.system_settings
      WHERE key IN (
        'maintenance_mode',
        'maintenance_message',
        'maintenance_type',
        'maintenance_start_time',
        'maintenance_end_time'
      )
    `);

    const values = new Map<string, string>();
    for (const row of queryRows<{ key?: unknown; value?: unknown }>(rows)) {
      values.set(String(row.key), String(row.value ?? ""));
    }
    return buildMaintenanceState(values, now);
  }

  async getAppConfig(): Promise<{
    systemName: string;
    sessionTimeoutMinutes: number;
    heartbeatIntervalMinutes: number;
    wsIdleMinutes: number;
    aiEnabled: boolean;
    semanticSearchEnabled: boolean;
    aiTimeoutMs: number;
    searchResultLimit: number;
    viewerRowsPerPage: number;
  }> {
    const result = await db.execute(sql`
      SELECT key, value
      FROM public.system_settings
      WHERE key IN (
        'system_name',
        'session_timeout_minutes',
        'ws_idle_minutes',
        'ai_enabled',
        'semantic_search_enabled',
        'ai_timeout_ms',
        'search_result_limit',
        'viewer_rows_per_page'
      )
    `);

    const values = new Map<string, string>();
    for (const row of queryRows<{ key?: unknown; value?: unknown }>(result)) {
      values.set(String(row.key), String(row.value ?? ""));
    }
    return buildAppConfig(values);
  }
}
