import assert from "node:assert/strict";
import test from "node:test";
import {
  protectCollectionOspPrivateClientBackup,
  readCollectionOspPrivateClientBackup,
  type PrivateClientBackupRow,
} from "../backups-collection-osp-private-utils";

function privateRow(overrides: Partial<PrivateClientBackupRow> = {}): PrivateClientBackupRow {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    targetId: "44444444-4444-4444-8444-444444444444",
    targetRevisionId: "55555555-5555-4555-8555-555555555555",
    ownerUserId: "stable-owner-text-id",
    agingBucket: "D3",
    targetPercentage: "25.0000",
    resultPercentage: "20.0000",
    ospClosed: "20.00",
    asOfDate: "2026-09-05",
    version: 1,
    createdBy: "example-owner",
    updatedBy: "example-owner",
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
    note: "Private supporting evidence",
    clientReference: "Private client reference",
    ...overrides,
  };
}

function withEncryptionKey(run: () => void): void {
  const previous = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  process.env.COLLECTION_PII_ENCRYPTION_KEY = "osp-v3-private-backup-unit-test-key";
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    else process.env.COLLECTION_PII_ENCRYPTION_KEY = previous;
  }
}

test("private Billing backup preserves LF, CR and TAB evidence through encrypted roundtrip", () => {
  withEncryptionKey(() => {
    for (const separator of ["\n", "\r", "\t", "\r\n"]) {
      const source = privateRow({
        note: ` First evidence${separator}Second evidence `,
        clientReference: ` First reference${separator}Second reference `,
      });
      const protectedRow = protectCollectionOspPrivateClientBackup(source);
      assert.deepEqual(Object.keys(protectedRow).sort(), ["id", "payloadEncrypted"]);
      assert.doesNotMatch(JSON.stringify(protectedRow), /First evidence|First reference|stable-owner-text-id|targetPercentage/);
      const restored = readCollectionOspPrivateClientBackup(protectedRow);
      assert.equal(restored.note, source.note);
      assert.equal(restored.clientReference, source.clientReference);
      assert.equal(restored.ownerUserId, source.ownerUserId);
      assert.equal(restored.targetPercentage, source.targetPercentage);
      assert.equal(restored.resultPercentage, source.resultPercentage);
    }
  });
});

test("private Billing backup rejects illegal evidence controls without relaxing identifiers", () => {
  withEncryptionKey(() => {
    for (const control of ["\x00", "\x01", "\x08", "\x0b", "\x0c", "\x0e", "\x1f", "\x7f"]) {
      assert.throws(() => protectCollectionOspPrivateClientBackup(privateRow({ note: `Evidence${control}tail` })), /note is invalid/);
      assert.throws(() => protectCollectionOspPrivateClientBackup(privateRow({ clientReference: `Reference${control}tail` })), /reference is invalid/);
    }
    for (const whitespace of ["\n", "\r", "\t"]) {
      assert.throws(() => protectCollectionOspPrivateClientBackup(privateRow({ ownerUserId: `owner${whitespace}id` })), /stable owner/);
      assert.throws(() => protectCollectionOspPrivateClientBackup(privateRow({ createdBy: `actor${whitespace}name` })), /stable owner/);
      assert.throws(() => protectCollectionOspPrivateClientBackup(privateRow({ updatedBy: `actor${whitespace}name` })), /stable owner/);
    }
  });
});

test("private Billing backup enforces evidence, owner and percentage field bounds", () => {
  withEncryptionKey(() => {
    const restored = readCollectionOspPrivateClientBackup(protectCollectionOspPrivateClientBackup(privateRow({
      note: "N".repeat(2_000), clientReference: "R".repeat(300), ownerUserId: "O".repeat(200),
    })));
    assert.equal(restored.note?.length, 2_000);
    assert.equal(restored.clientReference?.length, 300);
    assert.equal(restored.ownerUserId.length, 200);
    assert.throws(() => protectCollectionOspPrivateClientBackup(privateRow({ note: "N".repeat(2_001) })), /note is invalid/);
    assert.throws(() => protectCollectionOspPrivateClientBackup(privateRow({ clientReference: "R".repeat(301) })), /reference is invalid/);
    for (const ownerUserId of ["", " owner", "owner ", "O".repeat(201)]) {
      assert.throws(() => protectCollectionOspPrivateClientBackup(privateRow({ ownerUserId })), /stable owner/);
    }
    for (const targetPercentage of ["-1", "100.0001", "101", "25.12345", "NaN", ""]) {
      assert.throws(() => protectCollectionOspPrivateClientBackup(privateRow({ targetPercentage })), /percentage is invalid/);
    }
    assert.throws(() => protectCollectionOspPrivateClientBackup({ ...privateRow(), note: 42 }), /note is invalid/);
    assert.throws(() => protectCollectionOspPrivateClientBackup({ ...privateRow(), clientReference: {} }), /reference is invalid/);
    assert.throws(() => protectCollectionOspPrivateClientBackup(privateRow({ agingBucket: "ALL" })), /D3/);
  });
});

test("private Billing backup binds row identity and ignores forged plaintext ownership", () => {
  withEncryptionKey(() => {
    const encrypted = protectCollectionOspPrivateClientBackup(privateRow());
    const restored = readCollectionOspPrivateClientBackup({ ...encrypted, ownerUserId: "forged-owner" } as typeof encrypted);
    assert.equal(restored.ownerUserId, "stable-owner-text-id");
    assert.throws(() => readCollectionOspPrivateClientBackup({ ...encrypted, id: "66666666-6666-4666-8666-666666666666" }), /identity binding/);
    const pieces = encrypted.payloadEncrypted.split(".");
    pieces[1] = `${pieces[1]?.startsWith("A") ? "B" : "A"}${pieces[1]?.slice(1)}`;
    assert.throws(() => readCollectionOspPrivateClientBackup({ ...encrypted, payloadEncrypted: pieces.join(".") }), /cannot be decrypted/);
  });
});
