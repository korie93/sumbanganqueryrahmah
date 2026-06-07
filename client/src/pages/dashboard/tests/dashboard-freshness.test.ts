import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDashboardFreshnessLabel,
  resolveDashboardFreshnessStatusMessage,
  resolveDashboardLatestUpdatedAt,
} from "@/pages/dashboard/dashboard-freshness";

test("resolveDashboardLatestUpdatedAt keeps the newest successful query timestamp", () => {
  assert.equal(
    resolveDashboardLatestUpdatedAt([
      0,
      Number.NaN,
      Date.parse("2026-05-06T06:00:00Z"),
      Date.parse("2026-05-06T07:00:00Z"),
    ]),
    Date.parse("2026-05-06T07:00:00Z"),
  );
});

test("resolveDashboardLatestUpdatedAt returns null when dashboard data has not loaded", () => {
  assert.equal(resolveDashboardLatestUpdatedAt([0, Number.NaN, -1]), null);
});

test("formatDashboardFreshnessLabel keeps dashboard timestamps readable", () => {
  assert.equal(
    formatDashboardFreshnessLabel(Date.parse("2026-05-06T07:00:00Z")),
    "Data 06/05/2026, 3:00 PM",
  );
  assert.equal(formatDashboardFreshnessLabel(null), "Data belum dimuat");
});

test("resolveDashboardFreshnessStatusMessage explains refresh and partial error states", () => {
  const latestUpdatedAt = Date.parse("2026-05-06T07:00:00Z");

  assert.equal(
    resolveDashboardFreshnessStatusMessage({
      hasDashboardErrors: false,
      latestUpdatedAt,
      refreshing: false,
    }),
    "Data 06/05/2026, 3:00 PM. Auto refresh aktif.",
  );

  assert.equal(
    resolveDashboardFreshnessStatusMessage({
      hasDashboardErrors: false,
      latestUpdatedAt,
      refreshing: true,
    }),
    "Data 06/05/2026, 3:00 PM. Refresh sedang berjalan.",
  );

  assert.equal(
    resolveDashboardFreshnessStatusMessage({
      hasDashboardErrors: true,
      latestUpdatedAt,
      refreshing: false,
    }),
    "Data 06/05/2026, 3:00 PM. Sebahagian data dashboard gagal dimuat.",
  );
});
