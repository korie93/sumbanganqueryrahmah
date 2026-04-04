import assert from "node:assert/strict";
import test from "node:test";
import { buildMaintenanceSettingsSummary } from "@/pages/settings/maintenance-settings-summary";
import type { SettingCategory } from "@/pages/settings/types";

function createSystemMonitoringCategory(): SettingCategory {
  return {
    id: "system-monitoring",
    name: "System Monitoring",
    description: null,
    settings: [
      { key: "maintenance_mode", label: "", description: null, type: "boolean", value: "false", defaultValue: null, isCritical: true, updatedAt: null, permission: { canView: true, canEdit: true }, options: [] },
      { key: "maintenance_type", label: "", description: null, type: "select", value: "soft", defaultValue: null, isCritical: true, updatedAt: null, permission: { canView: true, canEdit: true }, options: [] },
      { key: "maintenance_start_time", label: "", description: null, type: "timestamp", value: "", defaultValue: null, isCritical: false, updatedAt: null, permission: { canView: true, canEdit: true }, options: [] },
      { key: "maintenance_end_time", label: "", description: null, type: "timestamp", value: "", defaultValue: null, isCritical: false, updatedAt: null, permission: { canView: true, canEdit: true }, options: [] },
    ],
  };
}

test("returns null for non-maintenance categories", () => {
  const result = buildMaintenanceSettingsSummary(
    { settings: [] },
    () => null,
  );

  assert.equal(result, null);
});

test("reports hard maintenance as active when enabled without scheduling blocks", () => {
  const category = createSystemMonitoringCategory();
  const values = new Map<string, string>([
    ["maintenance_mode", "true"],
    ["maintenance_type", "hard"],
    ["maintenance_start_time", ""],
    ["maintenance_end_time", ""],
  ]);

  const result = buildMaintenanceSettingsSummary(
    category,
    (key) => values.get(key) ?? null,
    new Date("2026-04-04T04:00:00.000Z"),
  );

  assert.ok(result);
  assert.equal(result.status, "active-hard");
  assert.equal(result.mode, "hard");
});

test("reports scheduled maintenance when start time is still in the future", () => {
  const category = createSystemMonitoringCategory();
  const values = new Map<string, string>([
    ["maintenance_mode", "true"],
    ["maintenance_type", "soft"],
    ["maintenance_start_time", "2026-04-04T10:00:00.000Z"],
    ["maintenance_end_time", ""],
  ]);

  const result = buildMaintenanceSettingsSummary(
    category,
    (key) => values.get(key) ?? null,
    new Date("2026-04-04T08:00:00.000Z"),
  );

  assert.ok(result);
  assert.equal(result.status, "scheduled");
});

test("reports expired maintenance when end time has passed", () => {
  const category = createSystemMonitoringCategory();
  const values = new Map<string, string>([
    ["maintenance_mode", "true"],
    ["maintenance_type", "soft"],
    ["maintenance_start_time", ""],
    ["maintenance_end_time", "2026-04-04T08:00:00.000Z"],
  ]);

  const result = buildMaintenanceSettingsSummary(
    category,
    (key) => values.get(key) ?? null,
    new Date("2026-04-04T09:00:00.000Z"),
  );

  assert.ok(result);
  assert.equal(result.status, "expired");
});
