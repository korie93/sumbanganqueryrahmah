import assert from "node:assert/strict";
import test from "node:test";

import {
  encryptCollectionPiiFieldValue,
  decryptCollectionPiiValueSafe,
  hashCollectionCustomerNameSearchTerms,
  hashCollectionPiiSearchValue,
} from "../../lib/collection-pii-encryption";
import {
  mapBackupCollectionOspManualReconciliation,
  mapBackupCollectionOspManualReconciliationAudit,
  mapBackupCollectionOspTargetSourceRow,
} from "../backups-payload-collection-utils";
import { normalizeBackupCollectionOspManualReconciliation, normalizeBackupCollectionOspTargetSourceRow } from "../backups-restore-collection-v7-normalize-utils";

async function withCollectionPiiKey<T>(fn: () => T | Promise<T>): Promise<T> {
  const previous = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  process.env.COLLECTION_PII_ENCRYPTION_KEY = "collection-v7-backup-test-key";
  try {
    return await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    } else {
      process.env.COLLECTION_PII_ENCRYPTION_KEY = previous;
    }
  }
}

test("OSP V3 backup/restore re-encrypts full detail and rejects unreadable source ciphertext", async () => {
  await withCollectionPiiKey(() => {
    const previous = process.env.COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS;
    try {
      const record = {
        backupCursor: "source-cursor", targetRevisionId: "33333333-3333-4333-8333-333333333333",
        sourceImportId: "source-1", sourceDataRowId: "row-1", canonicalObligationKey: "account:test",
        cycleKey: "2026-08-12:account:test", accountNumberEncrypted: encryptCollectionPiiFieldValue("000000000001"),
        accountNumberSearchHash: hashCollectionPiiSearchValue("accountNumber", "000000000001"),
        customerNameEncrypted: encryptCollectionPiiFieldValue("Example Customer"),
        customerNameSearchHashes: hashCollectionCustomerNameSearchTerms("Example Customer"),
        cardNumberLast4: "1001", cardNumberEncrypted: encryptCollectionPiiFieldValue("4111111111111001"),
        identificationNumberEncrypted: encryptCollectionPiiFieldValue("900101-10-1234"), phoneEncrypted: encryptCollectionPiiFieldValue("012-3456789"),
        agingBucket: "D3", callingDate: "2026-08-12", callingWindowEndExclusive: "2026-09-12",
        totalDue: "500.00", billingPrincipalOsp: "1000.00", createdAt: new Date("2026-08-12T00:00:00Z"),
      };
      process.env.COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS = "collection-v7-backup-test-key";
      process.env.COLLECTION_PII_ENCRYPTION_KEY = "osp-v3-destination-backup-key-test";
      const backup = mapBackupCollectionOspTargetSourceRow(record);
      assert.doesNotMatch(JSON.stringify(backup), /000000000001|4111111111111001|900101-10-1234|012-3456789|Example Customer/);
      const restored = normalizeBackupCollectionOspTargetSourceRow(backup);
      assert.ok(restored);
      delete process.env.COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS;
      assert.equal(decryptCollectionPiiValueSafe(restored.cardNumberEncrypted), "4111111111111001");
      assert.equal(decryptCollectionPiiValueSafe(restored.identificationNumberEncrypted), "900101-10-1234");
      assert.equal(decryptCollectionPiiValueSafe(restored.phoneEncrypted), "012-3456789");
      assert.throws(() => normalizeBackupCollectionOspTargetSourceRow({ ...backup, phoneEncrypted: "broken" }));
      assert.throws(() => mapBackupCollectionOspTargetSourceRow({ ...backup, cardNumberEncrypted: "broken" }));
    } finally {
      if (previous === undefined) delete process.env.COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS;
      else process.env.COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS = previous;
    }
  });
});

test("V7 manual-reconciliation backups retain a derived customer hash for restore source matching", async () => {
  await withCollectionPiiKey(() => {
    const account = "ACC-1001";
    const customer = "Alice Tan";
    const accountNumberEncrypted = encryptCollectionPiiFieldValue(account);
    const customerNameEncrypted = encryptCollectionPiiFieldValue(customer);
    assert.ok(accountNumberEncrypted);
    assert.ok(customerNameEncrypted);

    const backupRecord = mapBackupCollectionOspManualReconciliation({
      id: "11111111-1111-4111-8111-111111111111",
      targetId: "22222222-2222-4222-8222-222222222222",
      targetRevisionId: "33333333-3333-4333-8333-333333333333",
      sourceImportId: "import-1",
      sourceDataRowId: "row-1",
      canonicalObligationKey: "account:acc-1001",
      cycleKey: "cycle-1",
      accountNumberEncrypted,
      accountNumberSearchHash: hashCollectionPiiSearchValue("accountNumber", account),
      cardNumberLast4: "1001",
      customerNameEncrypted,
      agingBucket: "D3",
      callingDate: "2026-03-01",
      callingWindowEndExclusive: "2026-04-01",
      totalDue: "100.00",
      billingPrincipalOsp: "75.00",
      manualPriorAmount: "20.00",
      manualAsOfDate: "2026-03-15",
      actualPaymentDate: null,
      dateSource: "MANUAL_AS_OF",
      reasonCode: "PRIOR_PAYMENT_NOT_IN_SYSTEM",
      note: null,
      evidenceReference: null,
      status: "ACTIVE",
      version: 1,
      createdBy: "superuser",
      createdAt: new Date("2026-03-15T00:00:00.000Z"),
      updatedBy: "superuser",
      updatedAt: new Date("2026-03-15T00:00:00.000Z"),
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
    });

    const expectedCustomerHashes = hashCollectionCustomerNameSearchTerms(customer);
    assert.deepEqual(backupRecord.customerNameSearchHashes, expectedCustomerHashes);

    const restored = normalizeBackupCollectionOspManualReconciliation(backupRecord);
    assert.ok(restored);
    assert.deepEqual(restored.customerNameSearchHashes, expectedCustomerHashes);
  });
});

test("V7 reconciliation audit backups accept canonical obligation identity state", () => {
  const afterState = {
    sourceImportId: "import-1",
    sourceRecordId: "row-1",
    canonicalObligationKey: "account:acc-1001",
    cycleKey: "cycle-1",
    aging: "D3",
    totalDue: "100.00",
    billingPrincipalOsp: "75.00",
    manualPriorAmount: "20.00",
    asOfDate: "2026-03-15",
    actualPaymentDate: null,
    dateSource: "MANUAL_AS_OF",
    reason: "PRIOR_PAYMENT_NOT_IN_SYSTEM",
    note: null,
    reference: null,
    status: "ACTIVE",
    version: 1,
    voidReason: null,
  };

  const backupRecord = mapBackupCollectionOspManualReconciliationAudit({
    id: "44444444-4444-4444-8444-444444444444",
    reconciliationId: "11111111-1111-4111-8111-111111111111",
    targetId: "22222222-2222-4222-8222-222222222222",
    targetRevisionId: "33333333-3333-4333-8333-333333333333",
    operation: "CREATE",
    fromVersion: null,
    toVersion: 1,
    beforeState: null,
    afterState,
    actorUsername: "superuser",
    actorRole: "superuser",
    requestId: "request-1",
    createdAt: new Date("2026-03-15T00:00:00.000Z"),
  });

  assert.deepEqual(backupRecord.afterState, afterState);
});
