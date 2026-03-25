import { db } from "../db-postgres";
import { sql } from "drizzle-orm";
import {
  type MaintenanceState,
  type SettingInputType,
  type SettingsOption,
  type SystemSettingCategory,
  type SystemSettingItem,
  ROLE_TAB_SETTINGS,
  roleTabSettingKey,
} from "../config/system-settings";

const TRUTHY_SETTING_VALUES = new Set(["true", "1", "yes", "on"]);

function buildTextInList(values: string[]) {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

export class SettingsRepository {
  private parseSettingType(raw: unknown): SettingInputType {
    const normalized = String(raw || "text").toLowerCase();
    if (normalized === "number" || normalized === "boolean" || normalized === "select" || normalized === "timestamp") {
      return normalized;
    }
    return "text";
  }

  private normalizeSettingValue(
    type: SettingInputType,
    value: string | number | boolean | null,
  ): string | null {
    if (value === null || value === undefined) {
      return type === "timestamp" ? "" : null;
    }

    if (type === "boolean") {
      if (typeof value === "boolean") return value ? "true" : "false";

      const normalized = String(value).trim().toLowerCase();
      if (TRUTHY_SETTING_VALUES.has(normalized)) return "true";
      if (["false", "0", "no", "off"].includes(normalized)) return "false";
      return null;
    }

    if (type === "number") {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return null;
      return String(numeric);
    }

    if (type === "timestamp") {
      const normalized = String(value).trim();
      if (!normalized) return "";

      const parsed = new Date(normalized);
      if (Number.isNaN(parsed.getTime())) return null;
      return parsed.toISOString();
    }

    return String(value);
  }

  private applySettingConstraints(settingKey: string, type: SettingInputType, normalizedValue: string): {
    valid: boolean;
    value: string;
    message?: string;
  } {
    if (type !== "number") {
      return { valid: true, value: normalizedValue };
    }

    const numericValue = Number(normalizedValue);
    if (!Number.isFinite(numericValue)) {
      return { valid: false, value: normalizedValue, message: "Numeric setting value is invalid." };
    }

    const clampInteger = (min: number, max: number) =>
      String(Math.min(max, Math.max(min, Math.floor(numericValue))));

    if (settingKey === "search_result_limit") {
      if (numericValue < 10 || numericValue > 5000) {
        return { valid: false, value: normalizedValue, message: "Search Result Limit must be between 10 and 5000." };
      }
      return { valid: true, value: clampInteger(10, 5000) };
    }

    if (settingKey === "viewer_rows_per_page") {
      if (numericValue < 10 || numericValue > 500) {
        return { valid: false, value: normalizedValue, message: "Viewer Rows Per Page must be between 10 and 500." };
      }
      return { valid: true, value: clampInteger(10, 500) };
    }

    return { valid: true, value: normalizedValue };
  }

  private isAdminMaintenanceEditableKey(settingKey: string): boolean {
    return settingKey === "maintenance_message"
      || settingKey === "maintenance_start_time"
      || settingKey === "maintenance_end_time";
  }

  private async isAdminMaintenanceEditingEnabled(): Promise<boolean> {
    const result = await db.execute(sql`
      SELECT value
      FROM public.system_settings
      WHERE key = 'admin_can_edit_maintenance_message'
      LIMIT 1
    `);

    const row = (result.rows as any[])[0];
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

    const settingIds = (rows.rows as any[])
      .map((row) => String(row.setting_id))
      .filter((value) => value.length > 0);
    const optionsMap = new Map<string, SettingsOption[]>();

    if (settingIds.length > 0) {
      const optionsRows = await db.execute(sql`
        SELECT DISTINCT ON (setting_id, value) setting_id, value, label
        FROM public.setting_options
        WHERE setting_id IN (${buildTextInList(settingIds)})
        ORDER BY setting_id, value, label
      `);

      const seenOptionsBySetting = new Map<string, Set<string>>();
      for (const row of optionsRows.rows as any[]) {
        const settingId = String(row.setting_id);
        const optionValue = String(row.value);
        const seenOptions = seenOptionsBySetting.get(settingId) || new Set<string>();
        if (seenOptions.has(optionValue)) continue;

        seenOptions.add(optionValue);
        seenOptionsBySetting.set(settingId, seenOptions);

        const options = optionsMap.get(settingId) || [];
        options.push({ value: optionValue, label: String(row.label) });
        optionsMap.set(settingId, options);
      }
    }

    const adminMaintenanceEditingEnabled =
      role === "admin" ? await this.isAdminMaintenanceEditingEnabled() : true;

    const categories = new Map<string, SystemSettingCategory>();
    for (const row of rows.rows as any[]) {
      const categoryId = String(row.category_id);
      if (!categories.has(categoryId)) {
        categories.set(categoryId, {
          id: categoryId,
          name: String(row.category_name),
          description: row.category_description ? String(row.category_description) : null,
          settings: [],
        });
      }

      const key = String(row.key);
      const canEditFromPermission = row.can_edit === true;
      const canEdit = role === "admin"
        && this.isAdminMaintenanceEditableKey(key)
        && !adminMaintenanceEditingEnabled
        ? false
        : canEditFromPermission;

      categories.get(categoryId)!.settings.push({
        key,
        label: String(row.label),
        description: row.description ? String(row.description) : null,
        type: this.parseSettingType(row.type),
        value: String(row.value ?? ""),
        defaultValue: row.default_value === null || row.default_value === undefined ? null : String(row.default_value),
        isCritical: row.is_critical === true,
        updatedAt: row.updated_at ? new Date(row.updated_at) : null,
        permission: {
          canView: row.can_view === true,
          canEdit,
        },
        options: optionsMap.get(String(row.setting_id)) || [],
      });
    }

    return Array.from(categories.values());
  }

  async getBooleanSystemSetting(key: string, fallback = false): Promise<boolean> {
    const result = await db.execute(sql`
      SELECT value
      FROM public.system_settings
      WHERE key = ${key}
      LIMIT 1
    `);

    const row = (result.rows as any[])[0];
    if (!row) return fallback;

    const normalized = String(row.value ?? "").trim().toLowerCase();
    if (!normalized) return fallback;
    return TRUTHY_SETTING_VALUES.has(normalized);
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

    for (const row of rows.rows as any[]) {
      const key = String(row.key || "");
      const pageId = pageIdByKey.get(key);
      if (!pageId) continue;

      visibility[pageId] = TRUTHY_SETTING_VALUES.has(String(row.value ?? "").trim().toLowerCase());
    }

    if (roleKey === "admin") {
      const result = await db.execute(sql`
        SELECT value
        FROM public.system_settings
        WHERE key = 'canViewSystemPerformance'
        LIMIT 1
      `);
      const canViewSystemPerformance = TRUTHY_SETTING_VALUES.has(
        String((result.rows as any[])[0]?.value ?? "").trim().toLowerCase(),
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

    const current = (settingRes.rows as any[])[0];
    if (!current) {
      return { status: "not_found", message: "Setting not found." };
    }

    if (
      params.role === "admin"
      && this.isAdminMaintenanceEditableKey(String(current.key))
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

    const settingType = this.parseSettingType(current.type);
    const normalized = this.normalizeSettingValue(settingType, params.value);
    if (normalized === null) {
      return { status: "invalid", message: `Invalid value for type ${settingType}.` };
    }

    const constrained = this.applySettingConstraints(String(current.key), settingType, normalized);
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

      if ((optionRes.rows as any[]).length === 0) {
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

    const latest = (latestRes.rows as any[])[0];
    return {
      status: "updated",
      message: "Setting updated successfully.",
      shouldBroadcast: String(params.settingKey).startsWith("maintenance_"),
      setting: {
        key: String(latest.key),
        label: String(latest.label),
        description: latest.description ? String(latest.description) : null,
        type: this.parseSettingType(latest.type),
        value: String(latest.value ?? ""),
        defaultValue: latest.default_value === null || latest.default_value === undefined ? null : String(latest.default_value),
        isCritical: latest.is_critical === true,
        updatedAt: latest.updated_at ? new Date(latest.updated_at) : null,
        permission: { canView: true, canEdit: true },
        options: [],
      },
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
    for (const row of rows.rows as any[]) {
      values.set(String(row.key), String(row.value ?? ""));
    }

    const baseEnabled = TRUTHY_SETTING_VALUES.has((values.get("maintenance_mode") || "false").toLowerCase());
    const type = (values.get("maintenance_type") || "soft").toLowerCase() === "hard" ? "hard" : "soft";
    const message = values.get("maintenance_message") || "Sistem sedang diselenggara. Sila cuba semula sebentar lagi.";
    const startTime = (values.get("maintenance_start_time") || "").trim() || null;
    const endTime = (values.get("maintenance_end_time") || "").trim() || null;

    let enabled = baseEnabled;
    if (enabled && startTime) {
      const start = new Date(startTime);
      if (!Number.isNaN(start.getTime()) && now < start) {
        enabled = false;
      }
    }

    if (enabled && endTime) {
      const end = new Date(endTime);
      if (!Number.isNaN(end.getTime()) && now > end) {
        enabled = false;
      }
    }

    return {
      maintenance: enabled,
      message,
      type,
      startTime,
      endTime,
    };
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
    for (const row of result.rows as any[]) {
      values.set(String(row.key), String(row.value ?? ""));
    }

    const asNumber = (key: string, fallback: number, min: number, max: number): number => {
      const raw = Number(values.get(key) ?? "");
      if (!Number.isFinite(raw)) return fallback;
      return Math.min(max, Math.max(min, Math.floor(raw)));
    };
    const asBool = (key: string, fallback: boolean): boolean => {
      const raw = String(values.get(key) ?? "").trim().toLowerCase();
      if (!raw) return fallback;
      return TRUTHY_SETTING_VALUES.has(raw);
    };

    const systemName = String(values.get("system_name") ?? "").trim() || "SQR System";
    const sessionTimeoutMinutes = asNumber("session_timeout_minutes", 30, 1, 1440);
    const wsIdleMinutes = asNumber("ws_idle_minutes", 3, 1, 1440);
    const aiTimeoutMs = asNumber("ai_timeout_ms", 6000, 1000, 120000);
    const searchResultLimit = asNumber("search_result_limit", 200, 10, 5000);
    const viewerRowsPerPage = asNumber("viewer_rows_per_page", 100, 10, 500);
    const aiEnabled = asBool("ai_enabled", true);
    const semanticSearchEnabled = asBool("semantic_search_enabled", true);
    const heartbeatIntervalMinutes = Math.max(1, Math.min(10, Math.floor(sessionTimeoutMinutes / 2) || 1));

    return {
      systemName,
      sessionTimeoutMinutes,
      heartbeatIntervalMinutes,
      wsIdleMinutes,
      aiEnabled,
      semanticSearchEnabled,
      aiTimeoutMs,
      searchResultLimit,
      viewerRowsPerPage,
    };
  }
}
