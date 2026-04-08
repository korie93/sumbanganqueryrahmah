import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCollectionRecordPiiSearchHashes,
  buildEncryptedCollectionRecordPiiValues,
  decryptCollectionPiiValue,
  hashCollectionCustomerNameSearchTerms,
  hashCollectionPiiSearchValue,
  hasCollectionPiiEncryptionConfigured,
  resolveCollectionPiiFieldValue,
  resolveStoredCollectionPiiPlaintextValue,
  shouldRedactCollectionPiiPlaintextValue,
  shouldRewriteCollectionPiiSearchHashValue,
  shouldRewriteCollectionPiiSearchHashesValue,
  shouldRewriteCollectionPiiShadowValue,
} from "../../lib/collection-pii-encryption";
import { mapCollectionRecordRow } from "../collection-repository-mappers";

function withCollectionPiiKeys<T>(params: {
  current: string | null;
  previous?: string | null;
}, fn: () => T): T {
  const previous = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  const previousCompat = process.env.COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS;
  if (params.current === null) {
    delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
  } else {
    process.env.COLLECTION_PII_ENCRYPTION_KEY = params.current;
  }
  if (params.previous == null) {
    delete process.env.COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS;
  } else {
    process.env.COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS = params.previous;
  }

  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    } else {
      process.env.COLLECTION_PII_ENCRYPTION_KEY = previous;
    }
    if (previousCompat === undefined) {
      delete process.env.COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS;
    } else {
      process.env.COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS = previousCompat;
    }
  }
}

test("collection PII helpers encrypt and decrypt collection record shadow fields", () => {
  withCollectionPiiKeys({ current: "test-collection-pii-encryption-key" }, () => {
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
  withCollectionPiiKeys({ current: "test-collection-pii-encryption-key" }, () => {
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
  withCollectionPiiKeys({ current: null }, () => {
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

test("collection PII helpers keep plaintext empty for storage when current encrypted shadows are available", () => {
  withCollectionPiiKeys({ current: "test-collection-pii-encryption-key" }, () => {
    const encrypted = buildEncryptedCollectionRecordPiiValues({
      customerName: "Alice Tan",
      icNumber: "900101015555",
      customerPhone: "0123000001",
      accountNumber: "ACC-1001",
    });

    assert.equal(
      resolveStoredCollectionPiiPlaintextValue({
        plaintext: "Alice Tan",
        encrypted: encrypted?.customerNameEncrypted,
      }),
      "",
    );
    assert.equal(
      resolveStoredCollectionPiiPlaintextValue({
        plaintext: "900101015555",
        encrypted: encrypted?.icNumberEncrypted,
      }),
      "",
    );
    assert.equal(
      resolveStoredCollectionPiiPlaintextValue({
        plaintext: "Alice Tan",
        encrypted: "",
      }),
      "Alice Tan",
    );
  });
});

test("collection PII helpers keep plaintext storage fallback when encryption is not configured", () => {
  withCollectionPiiKeys({ current: null }, () => {
    assert.equal(
      resolveStoredCollectionPiiPlaintextValue({
        plaintext: "Alice Tan",
        encrypted: "enc.value",
      }),
      "Alice Tan",
    );
  });
});

test("collection PII helpers can decrypt values with a previous rotation key", () => {
  withCollectionPiiKeys(
    {
      current: "new-collection-pii-key",
      previous: "old-collection-pii-key",
    },
    () => {
      const encryptedWithOldKey = withCollectionPiiKeys(
        {
          current: "old-collection-pii-key",
        },
        () =>
          buildEncryptedCollectionRecordPiiValues({
            customerName: "Legacy Alice",
            icNumber: "900101011234",
            customerPhone: "0123111222",
            accountNumber: "ACC-OLD-1",
          }),
      );

      assert.ok(encryptedWithOldKey);
      assert.equal(
        decryptCollectionPiiValue(String(encryptedWithOldKey?.customerNameEncrypted || "")),
        "Legacy Alice",
      );
      assert.equal(
        resolveCollectionPiiFieldValue({
          plaintext: "",
          encrypted: encryptedWithOldKey?.accountNumberEncrypted,
        }),
        "ACC-OLD-1",
      );
    },
  );
});

test("collection PII helpers mark missing or stale shadow values for rewrite under the active key", () => {
  withCollectionPiiKeys(
    {
      current: "new-collection-pii-key",
      previous: "old-collection-pii-key",
    },
    () => {
      const encryptedWithOldKey = withCollectionPiiKeys(
        {
          current: "old-collection-pii-key",
        },
        () =>
          buildEncryptedCollectionRecordPiiValues({
            customerName: "Legacy Alice",
            icNumber: "900101011234",
            customerPhone: "0123111222",
            accountNumber: "ACC-OLD-1",
          }),
      );

      const encryptedWithCurrentKey = buildEncryptedCollectionRecordPiiValues({
        customerName: "Legacy Alice",
        icNumber: "900101011234",
        customerPhone: "0123111222",
        accountNumber: "ACC-OLD-1",
      });

      assert.equal(
        shouldRewriteCollectionPiiShadowValue({
          plaintext: "Legacy Alice",
          encrypted: "",
        }),
        true,
      );
      assert.equal(
        shouldRewriteCollectionPiiShadowValue({
          plaintext: "Legacy Alice",
          encrypted: encryptedWithOldKey?.customerNameEncrypted,
        }),
        true,
      );
      assert.equal(
        shouldRewriteCollectionPiiShadowValue({
          plaintext: "Legacy Alice",
          encrypted: encryptedWithCurrentKey?.customerNameEncrypted,
        }),
        false,
      );
      assert.equal(
        shouldRewriteCollectionPiiShadowValue({
          plaintext: "",
          encrypted: encryptedWithOldKey?.customerNameEncrypted,
        }),
        true,
      );
    },
  );
});

test("collection PII helpers build deterministic search hashes for sensitive fields", () => {
  withCollectionPiiKeys({ current: "search-hash-secret-key" }, () => {
    const hashes = buildCollectionRecordPiiSearchHashes({
      customerName: " Alice   Tan ",
      icNumber: "900101-01-5555",
      customerPhone: "+60 12-300 0001",
      accountNumber: " acc-1001 ",
    });

    assert.ok(hashes);
    assert.equal(
      hashes?.customerNameSearchHash,
      hashCollectionPiiSearchValue("customerName", "Alice Tan"),
    );
    assert.deepEqual(
      hashes?.customerNameSearchHashes,
      hashCollectionCustomerNameSearchTerms("Alice Tan"),
    );
    assert.equal(
      hashes?.icNumberSearchHash,
      hashCollectionPiiSearchValue("icNumber", "900101015555"),
    );
    assert.equal(
      hashes?.customerPhoneSearchHash,
      hashCollectionPiiSearchValue("customerPhone", "0123000001"),
    );
    assert.equal(
      hashes?.accountNumberSearchHash,
      hashCollectionPiiSearchValue("accountNumber", "ACC-1001"),
    );
  });
});

test("collection PII helpers build prefix-token blind indexes for customer names", () => {
  withCollectionPiiKeys({ current: "search-hash-secret-key" }, () => {
    const hashes = hashCollectionCustomerNameSearchTerms(" Alice   Tan ");

    assert.ok(hashes);
    assert.ok(hashes?.includes(hashCollectionPiiSearchValue("customerName", "al") || ""));
    assert.ok(hashes?.includes(hashCollectionPiiSearchValue("customerName", "alice") || ""));
    assert.ok(hashes?.includes(hashCollectionPiiSearchValue("customerName", "tan") || ""));
  });
});

test("collection PII helpers detect missing or stale search hashes for rewrite under the active key", () => {
  withCollectionPiiKeys(
    {
      current: "new-collection-pii-key",
      previous: "old-collection-pii-key",
    },
    () => {
      const encryptedWithOldKey = withCollectionPiiKeys(
        {
          current: "old-collection-pii-key",
        },
        () =>
          buildEncryptedCollectionRecordPiiValues({
            customerName: "Legacy Alice",
            icNumber: "900101011234",
            customerPhone: "0123111222",
            accountNumber: "ACC-OLD-1",
          }),
      );

      const legacyHash = withCollectionPiiKeys(
        {
          current: "old-collection-pii-key",
        },
        () => hashCollectionPiiSearchValue("customerPhone", "0123 000 001"),
      );

      assert.equal(
        shouldRewriteCollectionPiiSearchHashValue({
          field: "customerPhone",
          plaintext: "0123 000 001",
          hash: "",
        }),
        true,
      );
      assert.equal(
        shouldRewriteCollectionPiiSearchHashValue({
          field: "customerPhone",
          plaintext: "0123 000 001",
          hash: legacyHash,
        }),
        true,
      );
      assert.equal(
        shouldRewriteCollectionPiiSearchHashValue({
          field: "customerPhone",
          plaintext: "0123 000 001",
          hash: hashCollectionPiiSearchValue("customerPhone", "0123000001"),
        }),
        false,
      );
      assert.equal(
        shouldRewriteCollectionPiiSearchHashesValue({
          plaintext: "Legacy Alice",
          encrypted: encryptedWithOldKey?.customerNameEncrypted,
          hashes: [],
        }),
        true,
      );
      assert.equal(
        shouldRewriteCollectionPiiSearchHashesValue({
          plaintext: "Legacy Alice",
          encrypted: encryptedWithOldKey?.customerNameEncrypted,
          hashes: hashCollectionCustomerNameSearchTerms("Legacy Alice"),
        }),
        false,
      );
    },
  );
});

test("collection PII helpers only allow plaintext redaction after current shadow encryption and blind-index hashes are in place", () => {
  withCollectionPiiKeys(
    {
      current: "new-collection-pii-key",
      previous: "old-collection-pii-key",
    },
    () => {
      const encryptedWithCurrentKey = buildEncryptedCollectionRecordPiiValues({
        customerName: "Legacy Alice",
        icNumber: "900101011234",
        customerPhone: "0123111222",
        accountNumber: "ACC-OLD-1",
      });

      const currentPhoneHash = hashCollectionPiiSearchValue("customerPhone", "0123111222");
      const legacyPhoneHash = withCollectionPiiKeys(
        {
          current: "old-collection-pii-key",
        },
        () => hashCollectionPiiSearchValue("customerPhone", "0123111222"),
      );
      const currentCustomerNameHash = hashCollectionPiiSearchValue("customerName", "Legacy Alice");
      const currentCustomerNameHashes = hashCollectionCustomerNameSearchTerms("Legacy Alice");

      assert.equal(
        shouldRedactCollectionPiiPlaintextValue({
          field: "customerName",
          plaintext: "Legacy Alice",
          encrypted: encryptedWithCurrentKey?.customerNameEncrypted,
          hash: currentCustomerNameHash,
          hashes: currentCustomerNameHashes,
        }),
        true,
      );
      assert.equal(
        shouldRedactCollectionPiiPlaintextValue({
          field: "customerName",
          plaintext: "Legacy Alice",
          encrypted: encryptedWithCurrentKey?.customerNameEncrypted,
          hash: currentCustomerNameHash,
          hashes: [],
        }),
        false,
      );
      assert.equal(
        shouldRedactCollectionPiiPlaintextValue({
          field: "customerPhone",
          plaintext: "0123111222",
          encrypted: encryptedWithCurrentKey?.customerPhoneEncrypted,
          hash: currentPhoneHash,
        }),
        true,
      );
      assert.equal(
        shouldRedactCollectionPiiPlaintextValue({
          field: "customerPhone",
          plaintext: "0123111222",
          encrypted: encryptedWithCurrentKey?.customerPhoneEncrypted,
          hash: "",
        }),
        false,
      );
      assert.equal(
        shouldRedactCollectionPiiPlaintextValue({
          field: "customerPhone",
          plaintext: "0123111222",
          encrypted: encryptedWithCurrentKey?.customerPhoneEncrypted,
          hash: legacyPhoneHash,
        }),
        false,
      );
      assert.equal(
        shouldRedactCollectionPiiPlaintextValue({
          field: "customerPhone",
          plaintext: "",
          encrypted: encryptedWithCurrentKey?.customerPhoneEncrypted,
          hash: currentPhoneHash,
        }),
        false,
      );
    },
  );
});
