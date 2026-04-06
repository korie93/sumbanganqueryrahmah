import {
  type SettingsOption,
  type SystemSettingCategory,
  type SystemSettingItem,
} from "../config/system-settings";
import {
  isAdminMaintenanceEditableKey,
  parseSettingType,
} from "./settings-repository-value-utils";

type SettingRow = Record<string, unknown>;

export function mapSettingOptions(rows: SettingRow[]) {
  const optionsMap = new Map<string, SettingsOption[]>();
  const seenOptionsBySetting = new Map<string, Set<string>>();

  for (const row of rows) {
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

  return optionsMap;
}

export function buildSystemSettingItem(input: {
  row: SettingRow;
  canEdit: boolean;
  options?: SettingsOption[];
}): SystemSettingItem {
  const { row, canEdit, options: settingOptions = [] } = input;

  return {
    key: String(row.key),
    label: String(row.label),
    description: row.description ? String(row.description) : null,
    type: parseSettingType(row.type),
    value: String(row.value ?? ""),
    defaultValue:
      row.default_value === null || row.default_value === undefined
        ? null
        : String(row.default_value),
    isCritical: row.is_critical === true,
    updatedAt: row.updated_at ? new Date(row.updated_at as string | number | Date) : null,
    permission: {
      canView: row.can_view === true || row.can_view === undefined,
      canEdit,
    },
    options: settingOptions,
  };
}

export function buildSettingsCategories(options: {
  rows: SettingRow[];
  role: string;
  adminMaintenanceEditingEnabled: boolean;
  optionsMap: Map<string, SettingsOption[]>;
}): SystemSettingCategory[] {
  const { rows, role, adminMaintenanceEditingEnabled, optionsMap } = options;
  const categories = new Map<string, SystemSettingCategory>();

  for (const row of rows) {
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
      && isAdminMaintenanceEditableKey(key)
      && !adminMaintenanceEditingEnabled
      ? false
      : canEditFromPermission;

    categories.get(categoryId)?.settings.push(
      buildSystemSettingItem({
        row,
        canEdit,
        options: optionsMap.get(String(row.setting_id)) || [],
      }),
    );
  }

  return Array.from(categories.values());
}
