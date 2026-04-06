import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidMonitorAlertRetentionWindow,
  parseMonitorChaosRequestInput,
  resolveInitialMonitorPageState,
  resolveMonitorChaosProfile,
  resolveMonitorRoleCapabilities,
} from "@/pages/monitor/monitor-page-state-utils";

test("resolveInitialMonitorPageState keeps desktop monitor sections open by default", () => {
  assert.deepEqual(resolveInitialMonitorPageState(1280), {
    isCompactViewport: false,
    metricsOpen: true,
    alertsOpen: true,
    deferSecondaryMobileSections: false,
  });
});

test("resolveInitialMonitorPageState keeps mobile monitor sections compact by default", () => {
  assert.deepEqual(resolveInitialMonitorPageState(390), {
    isCompactViewport: true,
    metricsOpen: false,
    alertsOpen: false,
    deferSecondaryMobileSections: true,
  });
});

test("resolveMonitorRoleCapabilities keeps superuser-only monitor actions gated", () => {
  assert.deepEqual(resolveMonitorRoleCapabilities("superuser"), {
    canInjectChaos: true,
    canDeleteAlertHistory: true,
    canManageRollups: true,
  });
  assert.deepEqual(resolveMonitorRoleCapabilities("admin"), {
    canInjectChaos: true,
    canDeleteAlertHistory: false,
    canManageRollups: false,
  });
  assert.deepEqual(resolveMonitorRoleCapabilities("user"), {
    canInjectChaos: false,
    canDeleteAlertHistory: false,
    canManageRollups: false,
  });
});

test("resolveMonitorChaosProfile falls back to the default scenario when the type is unknown", () => {
  assert.equal(resolveMonitorChaosProfile("memory_pressure").type, "memory_pressure");
  assert.equal(resolveMonitorChaosProfile("not-real" as never).type, "cpu_spike");
});

test("parseMonitorChaosRequestInput validates magnitude and duration defensively", () => {
  assert.deepEqual(parseMonitorChaosRequestInput("12", "4500"), {
    ok: true,
    magnitude: 12,
    durationMs: 4500,
  });
  assert.deepEqual(parseMonitorChaosRequestInput("", ""), {
    ok: true,
    magnitude: undefined,
    durationMs: undefined,
  });
  assert.deepEqual(parseMonitorChaosRequestInput("abc", "4500"), {
    ok: false,
    reason: "invalid-magnitude",
  });
  assert.deepEqual(parseMonitorChaosRequestInput("12", "0"), {
    ok: false,
    reason: "invalid-duration",
  });
});

test("isValidMonitorAlertRetentionWindow rejects invalid cleanup windows", () => {
  assert.equal(isValidMonitorAlertRetentionWindow(30), true);
  assert.equal(isValidMonitorAlertRetentionWindow(0), false);
  assert.equal(isValidMonitorAlertRetentionWindow(Number.NaN), false);
});
