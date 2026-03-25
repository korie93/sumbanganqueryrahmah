import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionMonthlySummaryWhereSql,
  buildCollectionRecordConditions,
  collectCollectionReceiptPaths,
  extractCollectionRecordIds,
  mapCollectionAggregateRow,
  mapCollectionNicknameDailyAggregateRows,
  mapCollectionMonthlySummaryRows,
  sumCollectionRowAmounts,
} from "../collection-record-query-utils";
import {
  mapCollectionAdminGroupRow,
  mapCollectionAdminUserRow,
  mapCollectionNicknameAuthProfileRow,
  mapCollectionNicknameSessionRow,
  mapCollectionStaffNicknameRow,
  normalizeCollectionNicknameRoleScope,
  resolveCollectionNicknameRowsByIds,
  validateCollectionAdminGroupComposition,
  type CollectionRepositoryExecutor,
} from "../collection-nickname-utils";

test("buildCollectionRecordConditions includes each filter category once and normalizes nickname duplicates", () => {
  const conditions = buildCollectionRecordConditions({
    from: "2026-03-01",
    to: "2026-03-31",
    search: "P10",
    createdByLogin: "staff.user",
    nicknames: [" Collector Alpha ", "collector alpha", "Collector Beta"],
  });

  assert.equal(conditions.length, 5);
});

test("buildCollectionMonthlySummaryWhereSql clamps out-of-range years", () => {
  const { safeYear, whereSql } = buildCollectionMonthlySummaryWhereSql({
    year: 2205,
    nicknames: [" Collector Alpha ", "collector alpha"],
    createdByLogin: "staff.user",
  });

  assert.equal(safeYear, 2100);
  assert.ok(whereSql);
});

test("mapCollectionMonthlySummaryRows fills missing months with zero totals", () => {
  const summary = mapCollectionMonthlySummaryRows([
    { month: 3, total_records: "2", total_amount: "123.45" },
    { month: 1, total_records: 1, total_amount: "50.00" },
  ]);

  assert.equal(summary.length, 12);
  assert.deepEqual(summary[0], {
    month: 1,
    monthName: "January",
    totalRecords: 1,
    totalAmount: 50,
  });
  assert.deepEqual(summary[2], {
    month: 3,
    monthName: "March",
    totalRecords: 2,
    totalAmount: 123.45,
  });
  assert.deepEqual(summary[11], {
    month: 12,
    monthName: "December",
    totalRecords: 0,
    totalAmount: 0,
  });
});

test("aggregate and receipt helpers normalize values and dedupe paths", () => {
  assert.deepEqual(mapCollectionAggregateRow({ total_records: "4", total_amount: "300.55" }), {
    totalRecords: 4,
    totalAmount: 300.55,
  });
  assert.equal(
    sumCollectionRowAmounts([{ amount: "100.25" }, { amount: 200.3 }, { amount: null }]),
    300.55,
  );
  assert.deepEqual(
    extractCollectionRecordIds([{ id: " record-1 " }, { id: "" }, { id: "record-2" }]),
    ["record-1", "record-2"],
  );
  assert.deepEqual(
    collectCollectionReceiptPaths(
      [{ receipt_file: "uploads/a.png" }, { receipt_file: "uploads/a.png" }, { receipt_file: "" }],
      [{ storage_path: "uploads/b.png" }, { storage_path: "uploads/a.png" }],
    ),
    ["uploads/a.png", "uploads/b.png"],
  );
});

test("mapCollectionNicknameDailyAggregateRows normalizes nickname and payment-date aggregates", () => {
  assert.deepEqual(
    mapCollectionNicknameDailyAggregateRows([
      {
        nickname: "Collector Alpha",
        payment_date: "2026-03-01",
        total_records: "2",
        total_amount: "123.45",
      },
      {
        nickname_key: "collector beta",
        payment_date: "2026-03-02",
        total_records: 1,
        total_amount: 88,
      },
    ]),
    [
      {
        nickname: "Collector Alpha",
        paymentDate: "2026-03-01",
        totalRecords: 2,
        totalAmount: 123.45,
      },
      {
        nickname: "collector beta",
        paymentDate: "2026-03-02",
        totalRecords: 1,
        totalAmount: 88,
      },
    ],
  );
});

test("nickname row mappers normalize dates and fallback role scope safely", () => {
  assert.equal(normalizeCollectionNicknameRoleScope("ADMIN"), "admin");
  assert.equal(normalizeCollectionNicknameRoleScope("unexpected"), "both");

  const staff = mapCollectionStaffNicknameRow({
    id: "nickname-1",
    nickname: "Collector Alpha",
    is_active: true,
    role_scope: "user",
    created_by: "superuser",
    created_at: "2026-03-01T00:00:00.000Z",
  });
  assert.equal(staff.roleScope, "user");
  assert.equal(staff.createdAt.toISOString(), "2026-03-01T00:00:00.000Z");

  const authProfile = mapCollectionNicknameAuthProfileRow({
    id: "nickname-1",
    nickname: "Collector Alpha",
    is_active: true,
    role_scope: "invalid",
    nickname_password_hash: "hash",
    must_change_password: false,
    password_reset_by_superuser: true,
    password_updated_at: "2026-03-02T00:00:00.000Z",
  });
  assert.equal(authProfile.roleScope, "both");
  assert.equal(authProfile.passwordUpdatedAt?.toISOString(), "2026-03-02T00:00:00.000Z");

  const adminUser = mapCollectionAdminUserRow({
    id: "admin-1",
    username: "admin.user",
    is_banned: false,
    created_at: "2026-03-03T00:00:00.000Z",
    updated_at: "2026-03-04T00:00:00.000Z",
  });
  assert.equal(adminUser.role, "admin");
  assert.equal(adminUser.updatedAt.toISOString(), "2026-03-04T00:00:00.000Z");

  const session = mapCollectionNicknameSessionRow({
    activity_id: "activity-1",
    username: "admin.user",
    user_role: "admin",
    nickname: "Collector Alpha",
    verified_at: "2026-03-05T00:00:00.000Z",
    updated_at: "2026-03-06T00:00:00.000Z",
  });
  assert.equal(session.activityId, "activity-1");
  assert.equal(session.updatedAt.toISOString(), "2026-03-06T00:00:00.000Z");
});

test("mapCollectionAdminGroupRow sorts members and resolves member ids", () => {
  const group = mapCollectionAdminGroupRow(
    {
      id: "group-1",
      leader_nickname: "Collector Alpha",
      leader_nickname_id: "nickname-1",
      leader_is_active: true,
      leader_role_scope: "admin",
      member_nicknames: ["Collector Charlie", "Collector Beta", "Collector Beta"],
      created_by: "superuser",
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-02T00:00:00.000Z",
    },
    new Map([
      ["collector beta", "nickname-2"],
      ["collector charlie", "nickname-3"],
    ]),
  );

  assert.deepEqual(group.memberNicknames, ["Collector Beta", "Collector Charlie"]);
  assert.deepEqual(group.memberNicknameIds, ["nickname-2", "nickname-3"]);
  assert.equal(group.leaderRoleScope, "admin");
});

test("resolveCollectionNicknameRowsByIds returns normalized rows and rejects missing ids", async () => {
  const validExecutor: CollectionRepositoryExecutor = {
    execute: async () => ({
      rows: [
        { id: "nickname-1", nickname: "Collector Alpha", role_scope: "admin", is_active: true },
        { id: "nickname-2", nickname: "Collector Beta", role_scope: "user", is_active: false },
      ],
    }),
  };

  const resolved = await resolveCollectionNicknameRowsByIds(validExecutor, [
    " nickname-1 ",
    "nickname-2",
    "nickname-1",
  ]);
  assert.deepEqual(resolved, [
    { id: "nickname-1", nickname: "Collector Alpha", roleScope: "admin", isActive: true },
    { id: "nickname-2", nickname: "Collector Beta", roleScope: "user", isActive: false },
  ]);

  const invalidExecutor: CollectionRepositoryExecutor = {
    execute: async () => ({
      rows: [{ id: "nickname-1", nickname: "Collector Alpha", role_scope: "admin", is_active: true }],
    }),
  };

  await assert.rejects(
    () => resolveCollectionNicknameRowsByIds(invalidExecutor, ["nickname-1", "nickname-2"]),
    /Invalid nickname ids\./,
  );
});

test("validateCollectionAdminGroupComposition rejects unsafe overlaps and external conflicts", async () => {
  await assert.rejects(
    () =>
      validateCollectionAdminGroupComposition({
        tx: { execute: async () => ({ rows: [] }) },
        leaderNickname: "Collector Alpha",
        memberNicknames: ["Collector Alpha"],
      }),
    /Leader nickname cannot be a member of the same group\./,
  );

  const conflictResponses = [
    { rows: [] },
    { rows: [{ member_nickname: "Collector Beta" }] },
  ];
  let callIndex = 0;
  const conflictExecutor: CollectionRepositoryExecutor = {
    execute: async () => conflictResponses[callIndex++] ?? { rows: [] },
  };

  await assert.rejects(
    () =>
      validateCollectionAdminGroupComposition({
        tx: conflictExecutor,
        leaderNickname: "Collector Alpha",
        memberNicknames: ["Collector Beta"],
      }),
    /already assigned to another admin group/i,
  );
});
