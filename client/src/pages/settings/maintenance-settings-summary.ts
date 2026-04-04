import type { SettingCategory } from "@/pages/settings/types";

type MaintenanceMode = "soft" | "hard";
type MaintenanceStatus = "inactive" | "scheduled" | "expired" | "active-soft" | "active-hard";

export type MaintenanceSettingsSummary = {
  enabled: boolean;
  mode: MaintenanceMode;
  startTime: string | null;
  endTime: string | null;
  status: MaintenanceStatus;
  title: string;
  description: string;
};

function normalizeBoolean(value: string | number | boolean | null | undefined) {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function normalizeTimestamp(value: string | number | boolean | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function buildMaintenanceSettingsSummary(
  settings: Pick<SettingCategory, "settings"> | null | undefined,
  getEffectiveValue: (key: string) => string | number | boolean | null | undefined,
  now: Date = new Date(),
): MaintenanceSettingsSummary | null {
  if (!settings) {
    return null;
  }

  const keys = new Set(settings.settings.map((setting) => setting.key));
  if (!keys.has("maintenance_mode")) {
    return null;
  }

  const enabled = normalizeBoolean(getEffectiveValue("maintenance_mode"));
  const mode = String(getEffectiveValue("maintenance_type") ?? "").trim().toLowerCase() === "hard"
    ? "hard"
    : "soft";
  const startTime = normalizeTimestamp(getEffectiveValue("maintenance_start_time"));
  const endTime = normalizeTimestamp(getEffectiveValue("maintenance_end_time"));

  let status: MaintenanceStatus = "inactive";
  let title = "Maintenance is currently inactive";
  let description = "The master switch is off, so protected routes continue running normally.";

  if (enabled) {
    const start = startTime ? new Date(startTime) : null;
    const end = endTime ? new Date(endTime) : null;

    if (start && !Number.isNaN(start.getTime()) && now < start) {
      status = "scheduled";
      title = "Maintenance is scheduled for a future window";
      description = "The toggle is on, but the configured start time has not been reached yet.";
    } else if (end && !Number.isNaN(end.getTime()) && now > end) {
      status = "expired";
      title = "Maintenance window has already ended";
      description = "The toggle is on, but the configured end time has already passed.";
    } else if (mode === "hard") {
      status = "active-hard";
      title = "Hard maintenance is active";
      description = "Standard users will be redirected to the maintenance page across protected routes.";
    } else {
      status = "active-soft";
      title = "Soft maintenance is active";
      description = "Only selected modules are blocked. The rest of the application remains available.";
    }
  }

  return {
    enabled,
    mode,
    startTime,
    endTime,
    status,
    title,
    description,
  };
}
