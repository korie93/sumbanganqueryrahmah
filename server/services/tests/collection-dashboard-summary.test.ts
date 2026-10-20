import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionStoragePort } from "../collection/collection-service-support";
import { buildDashboardLeaderTotals, getCollectionDashboardSummary } from "../collection/collection-dashboard-summary";
import { CollectionRecordSummaryReadOperations } from "../collection/collection-record-summary-read-operations";

const team = { id: "11111111-1111-4111-8111-111111111111", leaderNickname: "LEADER", nicknames: ["STAFF"], nicknameIds: ["staff"], staffCount: 1 };
const totals = [
  { nickname: "STAFF", totalAmount: 0.1, totalRecords: 1 },
  { nickname: "staff", totalAmount: 0.2, totalRecords: 1 },
  { nickname: "LEADER", totalAmount: 5, totalRecords: 1 },
  { nickname: "INACTIVE", totalAmount: 2, totalRecords: 1 },
];

test("dashboard leader totals preserve explicit membership, cents and unassigned sums", () => {
  const result = buildDashboardLeaderTotals([team], totals);
  assert.equal(result.leaders[0]?.totalAmount, 0.3);
  assert.equal(result.leaders[0]?.totalRecords, 2);
  assert.equal(result.unassignedAmount, 7);
});

test("overlapping inconsistent membership remains visible for denominator mismatch detection", () => {
  const result = buildDashboardLeaderTotals([team, { ...team, id: "second", leaderNickname: "SECOND" }], totals);
  assert.equal(result.leaders.reduce((sum, leader) => sum + leader.totalAmount, 0), 0.6);
  assert.equal(result.unassignedAmount, 7);
});

function storageDouble() {
  const reads: string[] = [];
  const aggregateFilters: unknown[] = [];
  const monthlyFilters: unknown[] = [];
  const timestamp = new Date("2026-10-01T00:00:00Z");
  const storage = {
    getCollectionMonthlySummary: async (filters: unknown) => {
      monthlyFilters.push(filters);
      return [{ month: 10, monthName: "October", totalRecords: 4, totalAmount: 7.3 }];
    },
    getCollectionNicknameSessionByActivity: async () => { throw new Error("Dashboard must not use transient nickname sessions"); },
    getCollectionStaffNicknames: async () => {
      reads.push("nicknames");
      return [
        { id: "leader", nickname: "LEADER", isActive: true, roleScope: "admin", createdBy: null, createdAt: timestamp },
        { id: "staff", nickname: "STAFF", isActive: true, roleScope: "user", createdBy: null, createdAt: timestamp },
      ];
    },
    getCollectionAdminGroups: async () => {
      reads.push("groups");
      return [{ id: team.id, leaderNickname: "OLD.LEADER", leaderNicknameId: "leader", leaderIsActive: true,
        leaderRoleScope: "admin", memberNicknames: ["OLD.STAFF"], memberNicknameIds: ["staff"], createdBy: null, createdAt: timestamp, updatedAt: timestamp }];
    },
    summarizeCollectionRecordsByNickname: async (filters: unknown) => { reads.push("aggregate"); aggregateFilters.push(filters); return totals; },
  } as unknown as CollectionStoragePort;
  return { storage, reads, aggregateFilters, monthlyFilters };
}

test("authorized dashboard uses one month aggregate and current persisted active team membership", async () => {
  const { storage, reads, aggregateFilters } = storageDouble();
  const result = await getCollectionDashboardSummary(storage, { year: 2028, month: 2, canViewLeaderBreakdown: true, scopeLabel: "All records" });
  assert.deepEqual(aggregateFilters, [{ from: "2028-02-01", to: "2028-02-29" }]);
  assert.deepEqual(reads.slice().sort(), ["aggregate", "groups", "nicknames"]);
  assert.equal(result.leaders[0]?.name, "LEADER");
  assert.equal(result.leaders[0]?.totalAmount, 0.3);
});

for (const role of ["superuser", "manager", "admin", "user"]) {
  test(`summary dashboard keeps ${role} authorization and fails closed without account linkage`, async () => {
    const { storage, reads, monthlyFilters } = storageDouble();
    const service = new CollectionRecordSummaryReadOperations(storage);
    const result = await service.getSummary({ username: "viewer", role, activityId: "session" }, { year: "2026", month: "10", includeDashboard: "1" });
    const allowed = role === "superuser" || role === "manager";
    assert.ok("dashboard" in result);
    assert.equal(result.dashboard.canViewLeaderBreakdown, allowed);
    if (allowed) {
      assert.equal(result.dashboard?.leaders.length, 1);
      assert.deepEqual(monthlyFilters, [{ year: 2026 }]);
      assert.equal(reads.filter((read) => read === "aggregate").length, 1);
    } else {
      assert.deepEqual(result.dashboard?.leaders, []);
      assert.deepEqual(reads, []);
      assert.deepEqual(monthlyFilters, []);
      assert.equal(result.dashboard.scopeStatus, "link_required");
    }
  });
}

test("legacy monthly summary performs no dashboard reads or payload expansion", async () => {
  const { storage, reads } = storageDouble();
  const result = await new CollectionRecordSummaryReadOperations(storage).getSummary({ username: "viewer", role: "manager", activityId: "session" }, { year: "2026" });
  assert.equal("dashboard" in result, false);
  assert.deepEqual(reads, []);
});

test("dashboard uses persistent admin team / user nickname before and after any session login", async () => {
  for (const role of ["admin", "user"]) {
    const { storage, monthlyFilters, reads } = storageDouble();
    const ids: string[] = [];
    storage.getCollectionDashboardAccount = async (id) => {
      ids.push(id);
      return { nicknameId: "stable-nickname", nickname: "MY.NICKNAME", accountRole: role, isActive: true };
    };
    storage.getCollectionAdminGroupVisibleNicknameValuesByLeader = async () => ["MY.NICKNAME", "MY.MEMBER"];
    const user = { userId: "stable-account", username: "viewer", role, activityId: "session" };
    const result = await new CollectionRecordSummaryReadOperations(storage).getSummary(
      user, { year: "2026", includeDashboard: "1", month: "10" },
    );
    storage.getCollectionNicknameSessionByActivity = async () => ({
      activityId: "different-session", username: "viewer", userRole: role, nickname: "DIFFERENT",
      verifiedAt: new Date(), updatedAt: new Date(),
    });
    const after = await new CollectionRecordSummaryReadOperations(storage).getSummary(
      { ...user, activityId: "different-session" }, { year: "2026", includeDashboard: "1", month: "10" },
    );
    assert.deepEqual(after, result);
    assert.deepEqual(ids, ["stable-account", "stable-account"]);
    assert.deepEqual(monthlyFilters, Array(2).fill({ year: 2026, nicknames: role === "admin" ? ["MY.NICKNAME", "MY.MEMBER"] : ["MY.NICKNAME"] }));
    assert.ok("dashboard" in result);
    assert.equal(result.dashboard?.canViewLeaderBreakdown, false);
    assert.deepEqual(reads, []);
  }
});

test("invalid dashboard month is rejected and explicit staff filters never expose cross-team totals", async () => {
  const { storage, reads, monthlyFilters } = storageDouble();
  const service = new CollectionRecordSummaryReadOperations(storage);
  const user = { username: "viewer", role: "manager", activityId: "session" };
  await assert.rejects(service.getSummary(user, { year: "2026", includeDashboard: "1", month: "13" }), /Invalid dashboard month/);
  await assert.rejects(service.getSummary(user, { year: "2026", includeDashboard: "1", month: "10", nicknames: "STAFF" }), /Dashboard scope cannot/);
  assert.deepEqual(monthlyFilters, []);
  assert.deepEqual(reads, []);
});

test("inactive, missing and role-mismatched links never read financial data", async () => {
  for (const link of [null,
    { nicknameId: "id", nickname: "OTHER", accountRole: "user", isActive: false },
    { nicknameId: "id", nickname: "OTHER", accountRole: "admin", isActive: true },
  ]) {
    const { storage, reads, monthlyFilters } = storageDouble();
    storage.getCollectionDashboardAccount = async () => link;
    const result = await new CollectionRecordSummaryReadOperations(storage).getSummary(
      { userId: "account", username: "viewer", role: "user", activityId: "session" },
      { year: "2026", month: "10", includeDashboard: "1" },
    );
    assert.ok("dashboard" in result);
    assert.equal(result.dashboard.scopeStatus, "link_required");
    assert.deepEqual(result.summary, []);
    assert.deepEqual(reads, []);
    assert.deepEqual(monthlyFilters, []);
  }
});

test("dashboard returns only requested month; genuine empty month stays distinguishable from unlinked account", async () => {
  const { storage } = storageDouble();
  storage.getCollectionMonthlySummary = async () => [
    { month: 9, monthName: "September", totalAmount: 7 as never, totalRecords: 1 },
    { month: 10, monthName: "October", totalAmount: 0 as never, totalRecords: 0 },
  ];
  const result = await new CollectionRecordSummaryReadOperations(storage).getSummary(
    { username: "manager", role: "manager", activityId: "session" },
    { year: "2026", month: "10", includeDashboard: "1" },
  );
  assert.ok("dashboard" in result);
  assert.equal(result.dashboard.scopeStatus, "ready");
  assert.deepEqual(result.summary.map((item) => [item.month, item.totalAmount]), [[10, 0]]);
});

test("an unexpectedly empty admin group cannot become an unfiltered aggregate", async () => {
  const { storage, monthlyFilters, reads } = storageDouble();
  storage.getCollectionDashboardAccount = async () => ({
    nicknameId: "leader", nickname: "LEADER", accountRole: "admin", isActive: true,
  });
  storage.getCollectionAdminGroupVisibleNicknameValuesByLeader = async () => ["", " "];
  await assert.rejects(new CollectionRecordSummaryReadOperations(storage).getSummary(
    { userId: "admin", username: "admin", role: "admin", activityId: "activity" },
    { year: "2026", month: "10", includeDashboard: "1" },
  ), /scope is unavailable/);
  assert.deepEqual(monthlyFilters, []);
  assert.deepEqual(reads, []);
});
