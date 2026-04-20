import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  buildDashboardTrendTickDates,
  buildSummaryCards,
  formatDashboardAxisDate,
  formatDashboardUserLastLogin,
  resolveDashboardExportThemePalette,
} from "@/pages/dashboard/utils";

test("buildSummaryCards includes stale conflict monitor value when provided", () => {
  const cards = buildSummaryCards({
    totalUsers: 10,
    activeSessions: 2,
    loginsToday: 5,
    totalDataRows: 100,
    totalImports: 4,
    bannedUsers: 1,
    collectionRecordVersionConflicts24h: 7,
  });

  const staleConflictCard = cards.find((card) => card.title === "Stale Record Conflicts (24h)");
  assert.ok(staleConflictCard);
  assert.equal(staleConflictCard.value, 7);
});

test("buildSummaryCards falls back to zero stale conflict count", () => {
  const cards = buildSummaryCards({
    totalUsers: 10,
    activeSessions: 2,
    loginsToday: 5,
    totalDataRows: 100,
    totalImports: 4,
    bannedUsers: 1,
  });

  const staleConflictCard = cards.find((card) => card.title === "Stale Record Conflicts (24h)");
  assert.ok(staleConflictCard);
  assert.equal(staleConflictCard.value, 0);
});

test("formatDashboardUserLastLogin keeps login timestamps in operational timezone", () => {
  assert.equal(
    formatDashboardUserLastLogin("2026-04-02T10:27:00.000Z"),
    "02/04/2026, 6:27 PM",
  );
});

test("formatDashboardUserLastLogin falls back safely when missing", () => {
  assert.equal(formatDashboardUserLastLogin(null), "Unknown");
});

test("formatDashboardAxisDate keeps dashboard x-axis labels compact", () => {
  assert.equal(formatDashboardAxisDate("2026-04-12"), "12/04");
});

test("buildDashboardTrendTickDates keeps first and last dates while reducing crowded labels", () => {
  const trends = Array.from({ length: 30 }, (_, index) => ({
    date: `2026-04-${String(index + 1).padStart(2, "0")}`,
    logins: index,
    logouts: index,
  }));

  const tickDates = buildDashboardTrendTickDates(trends, 6);

  assert.deepEqual(tickDates, [
    "2026-04-01",
    "2026-04-07",
    "2026-04-13",
    "2026-04-18",
    "2026-04-24",
    "2026-04-30",
  ]);
});

test("buildDashboardTrendTickDates returns every date when the range is already short", () => {
  const trends = [
    { date: "2026-04-10", logins: 2, logouts: 1 },
    { date: "2026-04-11", logins: 3, logouts: 2 },
    { date: "2026-04-12", logins: 4, logouts: 3 },
  ];

  assert.deepEqual(buildDashboardTrendTickDates(trends, 6), [
    "2026-04-10",
    "2026-04-11",
    "2026-04-12",
  ]);
});

test("resolveDashboardExportThemePalette batches DOM color probes in a single hidden container", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const { document } = dom.window;
  const appendTargets: string[] = [];
  const originalAppendChild = document.body.appendChild.bind(document.body);

  document.body.appendChild = ((node: Node) => {
    appendTargets.push((node as HTMLElement).tagName);
    return originalAppendChild(node);
  }) as typeof document.body.appendChild;

  try {
    const palette = resolveDashboardExportThemePalette(document);

    assert.equal(appendTargets.length, 1);
    assert.deepEqual(Object.keys(palette).sort(), [
      "background",
      "border",
      "foreground",
      "mutedForeground",
    ]);
  } finally {
    dom.window.close();
  }
});
