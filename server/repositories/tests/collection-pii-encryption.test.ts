import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEncryptedCollectionRecordPiiValues,
  decryptCollectionPiiValue,
  hasCollectionPiiEncryptionConfigured,
  resolveCollectionPiiFieldValue,
} from "../../lib/collection-pii-encryption";
import { mapCollectionRecordRow } from "../collection-repository-mappers";

function withCollectionPiiKey<T>(key: string | null, fn: () => T): T {
  const previous = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  if (key === null) {
    delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
  } else {
    process.env.COLLECTION_PII_ENCRYPTION_KEY = key;
  }

  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    } else {
      process.env.COLLECTION_PII_ENCRYPTION_KEY = previous;
    }
  }
}

test("collection PII helpers encrypt and decrypt collection record shadow fields", () => {
  withCollectionPiiKey("test-collection-pii-encryption-key", () => {
    assert.equal(hasCollectionPiiEncryptionConfigured(), true);

    const encrypted = buildEncryptedCollectionRecordPiiValues({
      customerName: "Alice Tan",
      icNumber: "900101015555",
      customerPhone: "0123000001",
      accountNumber: "ACC-1001",
    });

    assert.ok(encrypted);
    assert.notEqual(encrypted?.customerNameEncrypted, "Alice Tan");
    assert.equal(decryptCollectionPiiValue(String(encrypted?.customerNameEncrypted || "")), "Alice Tan");
    assert.equal(
      resolveCollectionPiiFieldValue({
        plaintext: "",
        encrypted: encrypted?.icNumberEncrypted,
      }),
      "900101015555",
    );
  });
});

test("mapCollectionRecordRow falls back to encrypted collection PII shadow columns", () => {
  withCollectionPiiKey("test-collection-pii-encryption-key", () => {
    const encrypted = buildEncryptedCollectionRecordPiiValues({
      customerName: "Alice Tan",
      icNumber: "900101015555",
      customerPhone: "0123000001",
      accountNumber: "ACC-1001",
    });

    const row = mapCollectionRecordRow({
      id: "11111111-1111-1111-1111-111111111111",
      customer_name: null,
      customer_name_encrypted: encrypted?.customerNameEncrypted,
      ic_number: null,
      ic_number_encrypted: encrypted?.icNumberEncrypted,
      customer_phone: null,
      customer_phone_encrypted: encrypted?.customerPhoneEncrypted,
      account_number: null,
      account_number_encrypted: encrypted?.accountNumberEncrypted,
      batch: "P10",
      payment_date: "2026-04-08",
      amount: "10.00",
      receipt_file: null,
      receipt_total_amount: 0,
      receipt_validation_status: "needs_review",
      receipt_validation_message: null,
      receipt_count: 0,
      duplicate_receipt_flag: false,
      created_by_login: "system",
      collection_staff_nickname: "Collector Alpha",
      staff_username: "Collector Alpha",
      created_at: new Date("2026-04-08T00:00:00.000Z"),
      updated_at: new Date("2026-04-08T00:00:00.000Z"),
    });

    assert.equal(row.customerName, "Alice Tan");
    assert.equal(row.icNumber, "900101015555");
    assert.equal(row.customerPhone, "0123000001");
    assert.equal(row.accountNumber, "ACC-1001");
  });
});

test("collection PII helpers stay disabled when no encryption key is configured", () => {
  withCollectionPiiKey(null, () => {
    assert.equal(hasCollectionPiiEncryptionConfigured(), false);
    assert.equal(
      buildEncryptedCollectionRecordPiiValues({
        customerName: "Alice Tan",
        icNumber: "900101015555",
        customerPhone: "0123000001",
        accountNumber: "ACC-1001",
      }),
      null,
    );
  });
});
