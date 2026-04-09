import assert from "node:assert/strict";
import test from "node:test";
import {
  createCollectionStaffNicknameValue,
  deleteCollectionStaffNicknameValue,
  isCollectionStaffNicknameActiveValue,
  listCollectionStaffNicknames,
  setCollectionNicknameSessionValue,
  shouldCascadeCollectionNicknameRename,
  updateCollectionStaffNicknameValue,
  type CollectionStaffNicknameExecutor,
} from "../collection-staff-nickname-utils";
import { collectBoundValues, collectSqlText, createSequenceExecutor } from "./sql-test-utils";

type CreateCollectionStaffNicknameInput = Parameters<typeof createCollectionStaffNicknameValue>[1];

test("listCollectionStaffNicknames applies active and admin scope filters", async () => {
  const { executor, queries } = createSequenceExecutor<CollectionStaffNicknameExecutor>([
    {
      rows: [
        {
          id: "nickname-1",
          nickname: "Collector Alpha",
          is_active: true,
          role_scope: "admin",
          created_by: "superuser",
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
    },
  ]);

  const rows = await listCollectionStaffNicknames(executor, {
    activeOnly: true,
    allowedRole: "admin",
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.nickname, "Collector Alpha");

  const sqlText = collectSqlText(queries[0]);
  assert.match(sqlText, /FROM public\.collection_staff_nicknames/i);
  assert.match(sqlText, /is_active = true/i);
  assert.match(sqlText, /role_scope IN \('admin', 'both'\)/i);
  assert.match(sqlText, /ORDER BY is_active DESC, lower\(nickname\) ASC/i);
});

test("setCollectionNicknameSessionValue rejects invalid payload and upserts valid sessions", async () => {
  let called = false;
  const executor: CollectionStaffNicknameExecutor = {
    execute: async () => {
      called = true;
      return { rows: [] };
    },
  };

  await assert.rejects(
    () =>
      setCollectionNicknameSessionValue(executor, {
        activityId: "   ",
        username: "admin.user",
        userRole: "admin",
        nickname: "Collector Alpha",
      }),
    /Invalid collection nickname session payload\./,
  );
  assert.equal(called, false);

  const { executor: validExecutor, queries } = createSequenceExecutor<CollectionStaffNicknameExecutor>([{ rows: [] }]);
  await setCollectionNicknameSessionValue(validExecutor, {
    activityId: "activity-1",
    username: "admin.user",
    userRole: "admin",
    nickname: "Collector Alpha",
  });

  const sqlText = collectSqlText(queries[0]);
  assert.match(sqlText, /INSERT INTO public\.collection_nickname_sessions/i);
  assert.match(sqlText, /ON CONFLICT \(activity_id\) DO UPDATE/i);
});

test("createCollectionStaffNicknameValue normalizes unsupported role scope to both", async () => {
  const { executor, queries } = createSequenceExecutor<CollectionStaffNicknameExecutor>([
    {
      rows: [
        {
          id: "nickname-1",
          nickname: "Collector Gamma",
          is_active: true,
          role_scope: "both",
          created_by: "superuser",
          created_at: "2026-03-02T00:00:00.000Z",
        },
      ],
    },
  ]);

  const created = await createCollectionStaffNicknameValue(executor, {
    nickname: "Collector Gamma",
    roleScope: "unexpected" as unknown as NonNullable<CreateCollectionStaffNicknameInput["roleScope"]>,
    createdBy: "superuser",
  });

  assert.equal(created.roleScope, "both");

  const boundValues = collectBoundValues(queries[0]);
  assert.ok(boundValues.includes("both"));
  assert.ok(boundValues.includes("Collector Gamma"));
  assert.ok(boundValues.includes("superuser"));
});

test("updateCollectionStaffNicknameValue cascades nickname rename to related tables", async () => {
  const { executor, queries } = createSequenceExecutor<CollectionStaffNicknameExecutor>([
    {
      rows: [
        {
          id: "nickname-1",
          nickname: "Collector Alpha",
          is_active: true,
          role_scope: "admin",
          created_by: "superuser",
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
    },
    {
      rows: [
        {
          id: "nickname-1",
          nickname: "Collector Omega",
          is_active: false,
          role_scope: "user",
          created_by: "superuser",
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
    },
    { rows: [] },
    { rows: [] },
    { rows: [] },
  ]);

  const updated = await updateCollectionStaffNicknameValue(executor, "nickname-1", {
    nickname: "Collector Omega",
    isActive: false,
    roleScope: "user",
  });

  assert.equal(updated?.nickname, "Collector Omega");
  assert.equal(updated?.isActive, false);
  assert.equal(updated?.roleScope, "user");
  assert.equal(queries.length, 5);

  const sqlTexts = queries.map((query) => collectSqlText(query));
  assert.match(sqlTexts[2] ?? "", /UPDATE public\.admin_groups/i);
  assert.match(sqlTexts[3] ?? "", /UPDATE public\.admin_group_members/i);
  assert.match(sqlTexts[4] ?? "", /UPDATE public\.collection_nickname_sessions/i);
});

test("shouldCascadeCollectionNicknameRename detects meaningful nickname changes", () => {
  assert.equal(shouldCascadeCollectionNicknameRename(" Collector Alpha ", "collector alpha"), false);
  assert.equal(shouldCascadeCollectionNicknameRename("Collector Alpha", "Collector Omega"), true);
  assert.equal(shouldCascadeCollectionNicknameRename("", "Collector Omega"), false);
});

test("deleteCollectionStaffNicknameValue deactivates nicknames that already have collection records", async () => {
  const { executor, queries } = createSequenceExecutor<CollectionStaffNicknameExecutor>([
    {
      rows: [
        {
          id: "nickname-1",
          nickname: "Collector Alpha",
          is_active: true,
          role_scope: "admin",
          created_by: "superuser",
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
    },
    { rows: [{ total: 3 }] },
    { rows: [] },
  ]);

  const result = await deleteCollectionStaffNicknameValue(executor, "nickname-1");

  assert.deepEqual(result, { deleted: false, deactivated: true });
  assert.equal(queries.length, 3);
  assert.match(collectSqlText(queries[2]), /UPDATE public\.collection_staff_nicknames/i);
});

test("deleteCollectionStaffNicknameValue fully removes unused nicknames from related tables", async () => {
  const { executor, queries } = createSequenceExecutor<CollectionStaffNicknameExecutor>([
    {
      rows: [
        {
          id: "nickname-2",
          nickname: "Collector Beta",
          is_active: true,
          role_scope: "user",
          created_by: "superuser",
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
    },
    { rows: [{ total: 0 }] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
  ]);

  const result = await deleteCollectionStaffNicknameValue(executor, "nickname-2");

  assert.deepEqual(result, { deleted: true, deactivated: false });
  assert.equal(queries.length, 7);

  const sqlTexts = queries.slice(2).map((query) => collectSqlText(query));
  assert.match(sqlTexts[0] ?? "", /DELETE FROM public\.admin_visible_nicknames/i);
  assert.match(sqlTexts[1] ?? "", /DELETE FROM public\.admin_group_members/i);
  assert.match(sqlTexts[2] ?? "", /DELETE FROM public\.admin_groups/i);
  assert.match(sqlTexts[3] ?? "", /DELETE FROM public\.collection_nickname_sessions/i);
  assert.match(sqlTexts[4] ?? "", /DELETE FROM public\.collection_staff_nicknames/i);
});

test("isCollectionStaffNicknameActiveValue short-circuits blank input and returns active state", async () => {
  let callCount = 0;
  const executor: CollectionStaffNicknameExecutor = {
    execute: async () => {
      callCount += 1;
      return { rows: [{ id: "nickname-1" }] };
    },
  };

  assert.equal(await isCollectionStaffNicknameActiveValue(executor, "   "), false);
  assert.equal(callCount, 0);
  assert.equal(await isCollectionStaffNicknameActiveValue(executor, "Collector Alpha"), true);
  assert.equal(callCount, 1);
});
