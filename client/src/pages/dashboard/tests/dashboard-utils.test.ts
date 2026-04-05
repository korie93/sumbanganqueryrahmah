import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSummaryCards,
  formatDashboardUserLastLogin,
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
