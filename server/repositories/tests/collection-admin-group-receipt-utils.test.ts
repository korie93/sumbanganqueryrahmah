import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
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

type AttachableCollectionRecord = Parameters<typeof attachCollectionReceipts>[1][number];

async function cleanupReceiptFixturePath(filePath: string) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    const cleanupCode = error instanceof Error && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
    if (cleanupCode === "ENOENT") {
      return;
    }

    console.warn("Failed to cleanup managed receipt fixture", {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function createManagedCollectionReceiptFixture(extension: ".png" | ".pdf" = ".png") {
  const uploadsDir = path.resolve(process.cwd(), "uploads", "collection-receipts");
  const storedFileName = `repo-receipt-${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`;
  const absolutePath = path.join(uploadsDir, storedFileName);
  const contents =
    extension === ".pdf"
      ? Buffer.from("%PDF-1.7\n%fixture\n")
      : Buffer.from("fixture-image");
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(absolutePath, contents);
  return {
    absolutePath,
    publicPath: `/uploads/collection-receipts/${storedFileName}`,
  };
}

function createCollectionRecordFixture(
  overrides?: Partial<AttachableCollectionRecord>,
): AttachableCollectionRecord {
  return {
    id: "record-1",
    customerName: "Customer One",
    icNumber: "",
    customerPhone: "",
    accountNumber: "",
    batch: "P10",
    paymentDate: "2026-03-01",
    amount: "100.00",
    receiptFile: null,
    receipts: [],
    receiptTotalAmount: "0.00",
    receiptValidationStatus: "unverified",
    receiptValidationMessage: null,
    receiptCount: 0,
    duplicateReceiptFlag: false,
    createdByLogin: "staff.user",
    collectionStaffNickname: "Collector Alpha",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    ...overrides,
  };
}

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

test("attachCollectionReceipts promotes legacy receipt_file rows into relation-backed receipts", async () => {
  const receiptOne = await createManagedCollectionReceiptFixture(".png");
  const receiptTwo = await createManagedCollectionReceiptFixture(".png");
  const legacyReceipt = await createManagedCollectionReceiptFixture(".pdf");
  const { executor, queries } = createSequenceExecutor<CollectionReceiptExecutor>([
    {
      rows: [
        {
          id: "receipt-1",
          collection_record_id: "record-1",
          storage_path: receiptOne.publicPath,
          original_file_name: "one.png",
          original_mime_type: "image/png",
          original_extension: ".png",
          file_size: 123,
          created_at: "2026-03-01T00:00:00.000Z",
        },
        {
          id: "receipt-2",
          collection_record_id: "record-1",
          storage_path: receiptTwo.publicPath,
          original_file_name: "two.png",
          original_mime_type: "image/png",
          original_extension: ".png",
          file_size: 456,
          created_at: "2026-03-02T00:00:00.000Z",
        },
      ],
    },
    { rows: [] },
    {
      rows: [{ storage_path: legacyReceipt.publicPath }],
    },
    { rows: [] },
    {
      rows: [
        {
          id: "receipt-legacy",
          collection_record_id: "record-2",
          storage_path: legacyReceipt.publicPath,
          original_file_name: "existing.pdf",
          original_mime_type: "application/pdf",
          original_extension: ".pdf",
          file_size: 0,
          created_at: "2026-03-02T00:00:00.000Z",
        },
      ],
    },
  ]);

  try {
    const records = await attachCollectionReceipts(executor, [
      createCollectionRecordFixture(),
      createCollectionRecordFixture({
        id: "record-2",
        customerName: "Customer Two",
        paymentDate: "2026-03-02",
        amount: "200.00",
        receiptFile: legacyReceipt.publicPath,
        createdAt: new Date("2026-03-02T00:00:00.000Z"),
      }),
    ]);

    const firstRecord = records[0];
    const secondRecord = records[1];

    assert.ok(firstRecord);
    assert.ok(secondRecord);
    assert.ok(Array.isArray(firstRecord.archivedReceipts));
    assert.ok(Array.isArray(secondRecord.archivedReceipts));

    assert.equal(firstRecord.receiptFile, null);
    assert.equal(firstRecord.receipts.length, 2);
    assert.equal(firstRecord.archivedReceipts.length, 0);
    assert.equal(secondRecord.receiptFile, null);
    assert.equal(secondRecord.receipts.length, 1);
    assert.equal(secondRecord.receipts[0]?.storagePath, legacyReceipt.publicPath);
    assert.equal(secondRecord.archivedReceipts.length, 0);
    assert.equal(queries.length, 6);
    assert.match(collectSqlText(queries[1]), /INSERT INTO public\.collection_record_receipts/i);
    assert.match(collectSqlText(queries[2]), /SELECT storage_path/i);
    assert.match(collectSqlText(queries[3]), /UPDATE public\.collection_records/i);
    assert.match(collectSqlText(queries[5]), /deleted_at IS NOT NULL/i);
  } finally {
    await cleanupReceiptFixturePath(receiptOne.absolutePath);
    await cleanupReceiptFixturePath(receiptTwo.absolutePath);
    await cleanupReceiptFixturePath(legacyReceipt.absolutePath);
  }
});

test("attachCollectionReceipts prunes relation-backed receipts whose files are missing", async () => {
  const validReceipt = await createManagedCollectionReceiptFixture(".png");
  const { executor, queries } = createSequenceExecutor<CollectionReceiptExecutor>([
    {
      rows: [
        {
          id: "receipt-missing",
          collection_record_id: "record-1",
          storage_path: "/uploads/collection-receipts/missing-file.png",
          original_file_name: "missing-file.png",
          original_mime_type: "image/png",
          original_extension: ".png",
          file_size: 50,
          created_at: "2026-03-01T00:00:00.000Z",
        },
        {
          id: "receipt-valid",
          collection_record_id: "record-1",
          storage_path: validReceipt.publicPath,
          original_file_name: "valid.png",
          original_mime_type: "image/png",
          original_extension: ".png",
          file_size: 120,
          created_at: "2026-03-02T00:00:00.000Z",
        },
      ],
    },
    { rows: [] },
    { rows: [{ storage_path: validReceipt.publicPath }] },
    { rows: [] },
  ]);

  try {
    const [record] = await attachCollectionReceipts(executor, [
      createCollectionRecordFixture({
        receiptFile: "/uploads/collection-receipts/missing-file.png",
      }),
    ]);

    assert.ok(record);
    assert.ok(Array.isArray(record.archivedReceipts));

    assert.equal(record.receiptFile, null);
    assert.equal(record.receipts.length, 1);
    assert.equal(record.receipts[0]?.id, "receipt-valid");
    assert.equal(record.archivedReceipts.length, 0);
    assert.equal(queries.length, 5);
    assert.match(collectSqlText(queries[1]), /DELETE FROM public\.collection_record_receipts/i);
    assert.match(collectSqlText(queries[2]), /SELECT storage_path/i);
    assert.match(collectSqlText(queries[3]), /UPDATE public\.collection_records/i);
    assert.match(collectSqlText(queries[4]), /deleted_at IS NOT NULL/i);
  } finally {
    await cleanupReceiptFixturePath(validReceipt.absolutePath);
  }
});

test("createCollectionRecordReceiptRows inserts receipts and reloads them by generated ids", async () => {
  const { executor, queries } = createSequenceExecutor<CollectionReceiptExecutor>([
    { rows: [] },
    { rows: [] },
    {
      rows: [{ storage_path: "uploads/one.png" }],
    },
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
  assert.equal(queries.length, 5);
  assert.match(collectSqlText(queries[0]), /INSERT INTO public\.collection_record_receipts/i);
  assert.match(collectSqlText(queries[2]), /SELECT storage_path/i);
  assert.match(collectSqlText(queries[3]), /UPDATE public\.collection_records/i);
  assert.match(collectSqlText(queries[4]), /WHERE id IN/i);
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
    { rows: [] },
    { rows: [] },
  ]);

  const single = await getCollectionRecordReceiptByIdForRecord(executor, "record-1", "receipt-1");
  const deleted = await deleteCollectionRecordReceiptRows(executor, "record-1", ["receipt-1"]);

  assert.equal(single?.id, "receipt-1");
  assert.equal(deleted.length, 1);
  assert.equal(queries.length, 5);
  assert.match(collectSqlText(queries[2]), /UPDATE public\.collection_record_receipts/i);
  assert.match(collectSqlText(queries[2]), /SET deleted_at = now\(\)/i);
  assert.match(collectSqlText(queries[3]), /SELECT storage_path/i);
  assert.match(collectSqlText(queries[4]), /UPDATE public\.collection_records/i);
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
    { rows: [] },
    { rows: [] },
  ]);

  const deleted = await deleteAllCollectionRecordReceiptRows(executor, "record-1");

  assert.equal(deleted.length, 2);
  assert.equal(queries.length, 4);
  assert.match(collectSqlText(queries[0]), /WHERE collection_record_id =/i);
  assert.match(collectSqlText(queries[1]), /UPDATE public\.collection_record_receipts/i);
  assert.match(collectSqlText(queries[1]), /SET deleted_at = now\(\)/i);
  assert.match(collectSqlText(queries[2]), /SELECT storage_path/i);
  assert.match(collectSqlText(queries[3]), /UPDATE public\.collection_records/i);
});
