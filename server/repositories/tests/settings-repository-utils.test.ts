import assert from "node:assert/strict";
import test from "node:test";
import {
  applySettingConstraints,
  asTruthySetting,
  buildAppConfig,
  buildMaintenanceState,
  normalizeSettingValue,
  parseSettingType,
} from "../settings-repository-value-utils";

test("parseSettingType normalizes unknown values to text", () => {
  assert.equal(parseSettingType("BOOLEAN"), "boolean");
  assert.equal(parseSettingType("mystery"), "text");
  assert.equal(parseSettingType(undefined), "text");
});

test("normalizeSettingValue handles boolean, number, and timestamp inputs", () => {
  assert.equal(normalizeSettingValue("boolean", "yes"), "true");
  assert.equal(normalizeSettingValue("boolean", "off"), "false");
  assert.equal(normalizeSettingValue("number", "12.5"), "12.5");
  assert.match(normalizeSettingValue("timestamp", "2026-04-06T12:00") || "", /2026-04-06T\d{2}:00:00.000Z/);
  assert.equal(normalizeSettingValue("timestamp", ""), "");
  assert.equal(normalizeSettingValue("boolean", "maybe"), null);
});

test("applySettingConstraints enforces numeric setting bounds", () => {
  assert.deepEqual(applySettingConstraints("search_result_limit", "number", "10"), {
    valid: true,
    value: "10",
  });
  assert.equal(
    applySettingConstraints("search_result_limit", "number", "9").message,
    "Search Result Limit must be between 10 and 5000.",
  );
  assert.deepEqual(applySettingConstraints("viewer_rows_per_page", "number", "42.9"), {
    valid: true,
    value: "42",
  });
});

test("buildMaintenanceState disables scheduled or expired windows", () => {
  const values = new Map<string, string>([
    ["maintenance_mode", "true"],
    ["maintenance_type", "hard"],
    ["maintenance_message", "Down for maintenance"],
    ["maintenance_start_time", "2026-04-07T00:00:00.000Z"],
  ]);

  const beforeStart = buildMaintenanceState(values, new Date("2026-04-06T12:00:00.000Z"));
  assert.equal(beforeStart.maintenance, false);
  assert.equal(beforeStart.type, "hard");

  values.delete("maintenance_start_time");
  values.set("maintenance_end_time", "2026-04-05T00:00:00.000Z");
  const afterEnd = buildMaintenanceState(values, new Date("2026-04-06T12:00:00.000Z"));
  assert.equal(afterEnd.maintenance, false);
  assert.equal(afterEnd.message, "Down for maintenance");
});

test("buildAppConfig clamps numeric values and derives heartbeat interval", () => {
  const config = buildAppConfig(new Map<string, string>([
    ["system_name", "  Demo  "],
    ["session_timeout_minutes", "61"],
    ["ws_idle_minutes", "0"],
    ["ai_enabled", "false"],
    ["semantic_search_enabled", "yes"],
    ["ai_timeout_ms", "900"],
    ["search_result_limit", "6000"],
    ["viewer_rows_per_page", "4"],
  ]));

  assert.equal(config.systemName, "Demo");
  assert.equal(config.sessionTimeoutMinutes, 61);
  assert.equal(config.heartbeatIntervalMinutes, 10);
  assert.equal(config.wsIdleMinutes, 1);
  assert.equal(config.aiEnabled, false);
  assert.equal(config.semanticSearchEnabled, true);
  assert.equal(config.aiTimeoutMs, 1000);
  assert.equal(config.searchResultLimit, 5000);
  assert.equal(config.viewerRowsPerPage, 10);
});

test("asTruthySetting respects fallback for blank values", () => {
  assert.equal(asTruthySetting("on"), true);
  assert.equal(asTruthySetting("", true), true);
  assert.equal(asTruthySetting("", false), false);
});
