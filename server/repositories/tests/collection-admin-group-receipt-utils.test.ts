import assert from "node:assert/strict";
import test from "node:test";
import {
  createCollectionAdminGroupInTransaction,
  deleteCollectionAdminGroupInTransaction,
  getCollectionAdminGroupVisibleNicknameValuesByLeader,
  listCollectionAdminGroups,
  updateCollectionAdminGroupInTransaction,
  type CollectionAdminGroupExecutor,
} from "../collection-admin-group-utils";
import {
  attachCollectionReceipts,
  createCollectionRecordReceiptRows,
  deleteAllCollectionRecordReceiptRows,
  deleteCollectionRecordReceiptRows,
  getCollectionRecordReceiptByIdForRecord,
  type CollectionReceiptExecutor,
} from "../collection-receipt-utils";
import { collectBoundValues, collectSqlText, createSequenceExecutor } from "./sql-test-utils";

test("listCollectionAdminGroups builds nickname id mapping and returns normalized groups", async () => {
  const { executor, queries } = createSequenceExecutor<CollectionAdminGroupExecutor>([
    {
      rows: [
        { id: "nickname-1", nickname: "Collector Alpha" },
        { id: "nickname-2", nickname: "Collector Beta" },
        { id: "nickname-3", nickname: "Collector Charlie" },
      ],
    },
    {
      rows: [
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
      ],
    },
  ]);

  const groups = await listCollectionAdminGroups(executor);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]?.memberNicknames, ["Collector Beta", "Collector Charlie"]);
  assert.deepEqual(groups[0]?.memberNicknameIds, ["nickname-2", "nickname-3"]);
  assert.equal(groups[0]?.leaderNicknameId, "nickname-1");
  assert.equal(queries.length, 2);
  assert.match(collectSqlText(queries[1]), /FROM public\.admin_groups/i);
});

test("createCollectionAdminGroupInTransaction validates leader scope and inserts group members", async () => {
  const { executor, queries } = createSequenceExecutor<CollectionAdminGroupExecutor>([
    { rows: [{ id: "leader-1", nickname: "Collector Alpha", role_scope: "admin", is_active: true }] },
    {
      rows: [
        { id: "member-1", nickname: "Collector Beta", role_scope: "user", is_active: true },
        { id: "member-2", nickname: "Collector Charlie", role_scope: "user", is_active: true },
      ],
    },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
  ]);

  const groupId = await createCollectionAdminGroupInTransaction(executor, {
    leaderNicknameId: "leader-1",
    memberNicknameIds: ["member-1", "member-2"],
    createdBy: "superuser",
  });

  assert.ok(groupId);
  assert.equal(queries.length, 8);
  assert.match(collectSqlText(queries[5]), /INSERT INTO public\.admin_groups/i);
  assert.match(collectSqlText(queries[6]), /INSERT INTO public\.admin_group_members/i);
  assert.match(collectSqlText(queries[7]), /INSERT INTO public\.admin_group_members/i);

  const insertGroupValues = collectBoundValues(queries[5]);
  assert.ok(insertGroupValues.includes("Collector Alpha"));
  assert.ok(insertGroupValues.includes("superuser"));
});

test("updateCollectionAdminGroupInTransaction reuses existing members when member ids are omitted", async () => {
  const { executor, queries } = createSequenceExecutor<CollectionAdminGroupExecutor>([
    { rows: [{ id: "group-1", leader_nickname: "Collector Alpha" }] },
    { rows: [{ member_nickname: "Collector Charlie" }, { member_nickname: "Collector Beta" }] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
  ]);

  const updatedId = await updateCollectionAdminGroupInTransaction(executor, {
    groupId: "group-1",
    updatedBy: "superuser",
  });

  assert.equal(updatedId, "group-1");
  assert.equal(queries.length, 9);
  assert.match(collectSqlText(queries[1]), /SELECT member_nickname/i);
  assert.match(collectSqlText(queries[5]), /UPDATE public\.admin_groups/i);
  assert.match(collectSqlText(queries[6]), /DELETE FROM public\.admin_group_members/i);
});

test("getCollectionAdminGroupVisibleNicknameValuesByLeader falls back to leader and normalizes members", async () => {
  const fallbackExecutor: CollectionAdminGroupExecutor = {
    execute: async () => ({ rows: [] }),
  };
  assert.deepEqual(
    await getCollectionAdminGroupVisibleNicknameValuesByLeader(fallbackExecutor, "Collector Alpha"),
    ["Collector Alpha"],
  );

  const { executor } = createSequenceExecutor<CollectionAdminGroupExecutor>([
    {
      rows: [
        {
          leader_nickname: "Collector Alpha",
          member_nicknames: ["Collector Charlie", "Collector Beta", "Collector Alpha", "Collector Beta"],
        },
      ],
    },
  ]);

  assert.deepEqual(
    await getCollectionAdminGroupVisibleNicknameValuesByLeader(executor, "Collector Alpha"),
    ["Collector Alpha", "Collector Beta", "Collector Charlie"],
  );
});

test("deleteCollectionAdminGroupInTransaction short-circuits blank ids and deletes valid groups", async () => {
  let callCount = 0;
  const blankExecutor: CollectionAdminGroupExecutor = {
    execute: async () => {
      callCount += 1;
      return { rows: [] };
    },
  };
  assert.equal(await deleteCollectionAdminGroupInTransaction(blankExecutor, "   "), false);
  assert.equal(callCount, 0);

  const { executor, queries } = createSequenceExecutor<CollectionAdminGroupExecutor>([
    { rows: [] },
    { rows: [{ id: "group-1" }] },
  ]);

  assert.equal(await deleteCollectionAdminGroupInTransaction(executor, "group-1"), true);
  assert.equal(queries.length, 2);
  assert.match(collectSqlText(queries[0]), /DELETE FROM public\.admin_group_members/i);
  assert.match(collectSqlText(queries[1]), /DELETE FROM public\.admin_groups/i);
});

test("attachCollectionReceipts groups receipts by record and keeps the first receipt as primary", async () => {
  const { executor } = createSequenceExecutor<CollectionReceiptExecutor>([
    {
      rows: [
        {
          id: "receipt-1",
          collection_record_id: "record-1",
          storage_path: "uploads/one.png",
          original_file_name: "one.png",
          original_mime_type: "image/png",
          original_extension: ".png",
          file_size: 123,
          created_at: "2026-03-01T00:00:00.000Z",
        },
        {
          id: "receipt-2",
          collection_record_id: "record-1",
          storage_path: "uploads/two.png",
          original_file_name: "two.png",
          original_mime_type: "image/png",
          original_extension: ".png",
          file_size: 456,
          created_at: "2026-03-02T00:00:00.000Z",
        },
      ],
    },
  ]);

  const records = await attachCollectionReceipts(executor, [
    {
      id: "record-1",
      customerName: "Customer One",
      amount: 100,
      paymentDate: "2026-03-01",
      receiptFile: null,
      createdBy: "staff.user",
      createdAt: "2026-03-01T00:00:00.000Z",
    } as any,
    {
      id: "record-2",
      customerName: "Customer Two",
      amount: 200,
      paymentDate: "2026-03-02",
      receiptFile: "uploads/existing.pdf",
      createdBy: "staff.user",
      createdAt: "2026-03-02T00:00:00.000Z",
    } as any,
  ]);

  assert.equal(records[0]?.receiptFile, "uploads/one.png");
  assert.equal(records[0]?.receipts.length, 2);
  assert.equal(records[1]?.receiptFile, "uploads/existing.pdf");
  assert.deepEqual(records[1]?.receipts, []);
});

test("createCollectionRecordReceiptRows inserts receipts and reloads them by generated ids", async () => {
  const { executor, queries } = createSequenceExecutor<CollectionReceiptExecutor>([
    { rows: [] },
    { rows: [] },
    {
      rows: [
        {
          id: "receipt-1",
          collection_record_id: "record-1",
          storage_path: "uploads/one.png",
          original_file_name: "one.png",
          original_mime_type: "image/png",
          original_extension: ".png",
          file_size: 123,
          created_at: "2026-03-01T00:00:00.000Z",
        },
        {
          id: "receipt-2",
          collection_record_id: "record-1",
          storage_path: "uploads/two.pdf",
          original_file_name: "two.pdf",
          original_mime_type: "application/pdf",
          original_extension: ".pdf",
          file_size: 456,
          created_at: "2026-03-02T00:00:00.000Z",
        },
      ],
    },
  ]);

  const receipts = await createCollectionRecordReceiptRows(executor, "record-1", [
    {
      storagePath: "uploads/one.png",
      originalFileName: "one.png",
      originalMimeType: "image/png",
      originalExtension: ".png",
      fileSize: 123,
    },
    {
      storagePath: "uploads/two.pdf",
      originalFileName: "two.pdf",
      originalMimeType: "application/pdf",
      originalExtension: ".pdf",
      fileSize: 456,
    },
  ]);

  assert.equal(receipts.length, 2);
  assert.equal(receipts[1]?.originalFileName, "two.pdf");
  assert.equal(queries.length, 3);
  assert.match(collectSqlText(queries[0]), /INSERT INTO public\.collection_record_receipts/i);
  assert.match(collectSqlText(queries[2]), /WHERE id IN/i);
});

test("getCollectionRecordReceiptByIdForRecord and delete receipt helpers short-circuit safely and return deleted rows", async () => {
  let callCount = 0;
  const blankExecutor: CollectionReceiptExecutor = {
    execute: async () => {
      callCount += 1;
      return { rows: [] };
    },
  };
  assert.equal(await getCollectionRecordReceiptByIdForRecord(blankExecutor, "   ", "receipt-1"), undefined);
  assert.equal(callCount, 0);

  const { executor, queries } = createSequenceExecutor<CollectionReceiptExecutor>([
    {
      rows: [
        {
          id: "receipt-1",
          collection_record_id: "record-1",
          storage_path: "uploads/one.png",
          original_file_name: "one.png",
          original_mime_type: "image/png",
          original_extension: ".png",
          file_size: 123,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
    },
    {
      rows: [
        {
          id: "receipt-1",
          collection_record_id: "record-1",
          storage_path: "uploads/one.png",
          original_file_name: "one.png",
          original_mime_type: "image/png",
          original_extension: ".png",
          file_size: 123,
          created_at: "2026-03-01T00:00:00.000Z",
        },
      ],
    },
    { rows: [] },
  ]);

  const single = await getCollectionRecordReceiptByIdForRecord(executor, "record-1", "receipt-1");
  const deleted = await deleteCollectionRecordReceiptRows(executor, "record-1", ["receipt-1"]);

  assert.equal(single?.id, "receipt-1");
  assert.equal(deleted.length, 1);
  assert.equal(queries.length, 3);
  assert.match(collectSqlText(queries[2]), /DELETE FROM public\.collection_record_receipts/i);
});

test("deleteAllCollectionRecordReceiptRows deletes only after loading existing receipts", async () => {
  const { executor, queries } = createSequenceExecutor<CollectionReceiptExecutor>([
    {
      rows: [
        {
          id: "receipt-1",
          collection_record_id: "record-1",
          storage_path: "uploads/one.png",
          original_file_name: "one.png",
          original_mime_type: "image/png",
          original_extension: ".png",
          file_size: 123,
          created_at: "2026-03-01T00:00:00.000Z",
        },
        {
          id: "receipt-2",
          collection_record_id: "record-1",
          storage_path: "uploads/two.png",
          original_file_name: "two.png",
          original_mime_type: "image/png",
          original_extension: ".png",
          file_size: 456,
          created_at: "2026-03-02T00:00:00.000Z",
        },
      ],
    },
    { rows: [] },
  ]);

  const deleted = await deleteAllCollectionRecordReceiptRows(executor, "record-1");

  assert.equal(deleted.length, 2);
  assert.equal(queries.length, 2);
  assert.match(collectSqlText(queries[0]), /WHERE collection_record_id =/i);
  assert.match(collectSqlText(queries[1]), /DELETE FROM public\.collection_record_receipts/i);
});
