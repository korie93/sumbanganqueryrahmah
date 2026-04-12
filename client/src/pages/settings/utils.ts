import type { NormalizedSettingsError, SettingItem } from "@/pages/settings/types";

export const settingsCategoryOrder = [
  "General",
  "Security",
  "AI & Search",
  "Data Management",
  "Backup & Restore",
  "Roles & Permissions",
  "System Monitoring",
];

const roleTabOrder = [
  "home",
  "import",
  "saved",
  "viewer",
  "general_search",
  "collection_report",
  "analysis",
  "dashboard",
  "monitor",
  "activity",
  "audit_logs",
  "backup",
  "settings",
];

export function normalizeSettingsErrorPayload(rawError: unknown): NormalizedSettingsError {
  const fallback = { message: "Failed to update setting." };
  if (!rawError || typeof rawError !== "object") return fallback;
  const anyError = rawError as { message?: string };
  const message = String(anyError.message || "");
  const jsonPart = message.replace(/^\d+:\s*/, "");

  try {
    const parsed = JSON.parse(jsonPart);
    const parsedCode = typeof parsed?.error?.code === "string" ? parsed.error.code : undefined;
    const parsedMessage = String(parsed?.error?.message || parsed?.message || fallback.message);
    return {
      message: parsedMessage,
      requiresConfirmation: parsed?.requiresConfirmation === true,
      code: parsedCode,
    };
  } catch {
    return { message: message || fallback.message };
  }
}

export function getSettingActionTooltip(setting: SettingItem) {
  if (setting.type === "boolean") return "Toggle ON/OFF to allow or block access.";
  if (setting.type === "select") return "Select an allowed value for this configuration.";
  if (setting.type === "number") return "Enter a valid numeric value for this setting.";
  if (setting.type === "timestamp") return "Set a date/time value for this setting.";
  return "Update this setting value.";
}

export function getRoleSettingOrder(key: string) {
  const match = key.match(/^tab_(admin|user)_(.+)_enabled$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const suffix = match[2];
  const index = roleTabOrder.indexOf(suffix);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function toDateTimeLocalInputValue(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return raw;
  const parsedDate = new Date(raw);
  if (Number.isNaN(parsedDate.getTime())) return "";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${parsedDate.getFullYear()}-${pad(parsedDate.getMonth() + 1)}-${pad(parsedDate.getDate())}T${pad(parsedDate.getHours())}:${pad(parsedDate.getMinutes())}`;
}

export function isStrongPassword(value: string): boolean {
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}
