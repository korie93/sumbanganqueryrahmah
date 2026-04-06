import type { MaintenanceState, SettingInputType } from "../config/system-settings";

export const TRUTHY_SETTING_VALUES = new Set(["true", "1", "yes", "on"]);

export function parseSettingType(raw: unknown): SettingInputType {
  const normalized = String(raw || "text").toLowerCase();
  if (
    normalized === "number"
    || normalized === "boolean"
    || normalized === "select"
    || normalized === "timestamp"
  ) {
    return normalized;
  }
  return "text";
}

export function normalizeSettingValue(
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

export function applySettingConstraints(
  settingKey: string,
  type: SettingInputType,
  normalizedValue: string,
): {
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
      return {
        valid: false,
        value: normalizedValue,
        message: "Search Result Limit must be between 10 and 5000.",
      };
    }
    return { valid: true, value: clampInteger(10, 5000) };
  }

  if (settingKey === "viewer_rows_per_page") {
    if (numericValue < 10 || numericValue > 500) {
      return {
        valid: false,
        value: normalizedValue,
        message: "Viewer Rows Per Page must be between 10 and 500.",
      };
    }
    return { valid: true, value: clampInteger(10, 500) };
  }

  return { valid: true, value: normalizedValue };
}

export function isAdminMaintenanceEditableKey(settingKey: string): boolean {
  return settingKey === "maintenance_message"
    || settingKey === "maintenance_start_time"
    || settingKey === "maintenance_end_time";
}

export function asTruthySetting(value: unknown, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  return TRUTHY_SETTING_VALUES.has(normalized);
}

export function buildMaintenanceState(
  values: Map<string, string>,
  now: Date = new Date(),
): MaintenanceState {
  const baseEnabled = asTruthySetting(values.get("maintenance_mode"), false);
  const type = (values.get("maintenance_type") || "soft").toLowerCase() === "hard" ? "hard" : "soft";
  const message = values.get("maintenance_message")
    || "Sistem sedang diselenggara. Sila cuba semula sebentar lagi.";
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

export function buildAppConfig(values: Map<string, string>) {
  const asNumber = (key: string, fallback: number, min: number, max: number): number => {
    const raw = Number(values.get(key) ?? "");
    if (!Number.isFinite(raw)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(raw)));
  };
  const asBool = (key: string, fallback: boolean): boolean => asTruthySetting(values.get(key), fallback);

  const systemName = String(values.get("system_name") ?? "").trim() || "SQR System";
  const sessionTimeoutMinutes = asNumber("session_timeout_minutes", 30, 1, 1440);
  const wsIdleMinutes = asNumber("ws_idle_minutes", 3, 1, 1440);
  const aiTimeoutMs = asNumber("ai_timeout_ms", 6000, 1000, 120000);
  const searchResultLimit = asNumber("search_result_limit", 200, 10, 5000);
  const viewerRowsPerPage = asNumber("viewer_rows_per_page", 100, 10, 500);
  const aiEnabled = asBool("ai_enabled", true);
  const semanticSearchEnabled = asBool("semantic_search_enabled", true);
  const heartbeatIntervalMinutes = Math.max(
    1,
    Math.min(10, Math.floor(sessionTimeoutMinutes / 2) || 1),
  );

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
