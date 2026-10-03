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
    getCollectionNicknameSessionByActivity: async () => undefined,
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
  test(`summary dashboard keeps ${role} authorization and unchanged monthly scope`, async () => {
    const { storage, reads, monthlyFilters } = storageDouble();
    const service = new CollectionRecordSummaryReadOperations(storage);
    const result = await service.getSummary({ username: "viewer", role, activityId: "session" }, { year: "2026", month: "10", includeDashboard: "1" });
    const allowed = role === "superuser" || role === "manager";
    assert.equal(result.dashboard?.canViewLeaderBreakdown, allowed);
    if (allowed) {
      assert.equal(result.dashboard?.leaders.length, 1);
      assert.deepEqual(monthlyFilters, [{ year: 2026 }]);
      assert.equal(reads.filter((read) => read === "aggregate").length, 1);
    } else {
      assert.deepEqual(result.dashboard?.leaders, []);
      assert.deepEqual(reads, []);
      assert.deepEqual(monthlyFilters, role === "user" ? [{ year: 2026, createdByLogin: "viewer" }] : []);
    }
  });
}

test("legacy monthly summary performs no dashboard reads or payload expansion", async () => {
  const { storage, reads } = storageDouble();
  const result = await new CollectionRecordSummaryReadOperations(storage).getSummary({ username: "viewer", role: "manager", activityId: "session" }, { year: "2026" });
  assert.equal("dashboard" in result, false);
  assert.deepEqual(reads, []);
});

test("dashboard keeps existing admin team scope and verified user nickname scope", async () => {
  for (const role of ["admin", "user"]) {
    const { storage, monthlyFilters, reads } = storageDouble();
    storage.getCollectionNicknameSessionByActivity = async () => ({
      activityId: "session", username: "viewer", userRole: role, nickname: "MY.NICKNAME",
      verifiedAt: new Date(), updatedAt: new Date(),
    });
    storage.getCollectionAdminGroupVisibleNicknameValuesByLeader = async () => ["MY.NICKNAME", "MY.MEMBER"];
    const result = await new CollectionRecordSummaryReadOperations(storage).getSummary(
      { username: "viewer", role, activityId: "session" }, { year: "2026", includeDashboard: "1", month: "10" },
    );
    assert.deepEqual(monthlyFilters, [{ year: 2026, nicknames: role === "admin" ? ["MY.NICKNAME", "MY.MEMBER"] : ["MY.NICKNAME"] }]);
    assert.equal(result.dashboard?.canViewLeaderBreakdown, false);
    assert.deepEqual(reads, []);
  }
});

test("invalid dashboard month is rejected and explicit staff filters never expose cross-team totals", async () => {
  const { storage, reads, monthlyFilters } = storageDouble();
  const service = new CollectionRecordSummaryReadOperations(storage);
  const user = { username: "viewer", role: "manager", activityId: "session" };
  await assert.rejects(service.getSummary(user, { year: "2026", includeDashboard: "1", month: "13" }), /Invalid dashboard month/);
  const result = await service.getSummary(user, { year: "2026", includeDashboard: "1", month: "10", nicknames: "STAFF" });
  assert.equal(result.dashboard?.canViewLeaderBreakdown, false);
  assert.deepEqual(result.dashboard?.leaders, []);
  assert.deepEqual(monthlyFilters, [{ year: 2026, nicknames: ["STAFF"] }]);
  assert.deepEqual(reads, ["nicknames"]);
});
