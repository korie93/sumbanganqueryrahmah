import assert from "node:assert/strict";
import { createCipheriv, createHash, createHmac } from "node:crypto";
import test from "node:test";
import {
  buildCollectionRecordPiiSearchHashes,
  buildEncryptedCollectionRecordPiiValues,
  CollectionPiiDecryptionError,
  decryptCollectionPiiValue,
  decryptCollectionPiiValueResult,
  decryptCollectionPiiValueSafe,
  encryptCollectionPiiFieldValue,
  hashCollectionCustomerNameSearchTerms,
  hashCollectionPiiSearchValue,
  hasCollectionPiiEncryptionConfigured,
  hasUnreadableCollectionPiiShadowValue,
  resolveCollectionCustomerNameSearchHashesValue,
  resolveCollectionPiiFieldValue,
  resolveCollectionPiiFieldValueFailClosed,
  resolveStoredCollectionPiiPlaintextValue,
  shouldRedactCollectionPiiPlaintextValue,
  shouldRewriteCollectionPiiSearchHashValue,
  shouldRewriteCollectionPiiSearchHashesValue,
  shouldRewriteCollectionPiiShadowValue,
} from "../../lib/collection-pii-encryption";
import { getInternalMetricsSnapshot } from "../../internal/metrics";
import {
  decryptCollectionPiiValueWithCurrentDerivationOnly,
  decryptCollectionPiiValueWithSecret,
  encryptCollectionPiiWithSecret,
  getCollectionPiiCipherKey,
  getLegacyCollectionPiiCipherKey,
} from "../../lib/collection-pii-encryption-crypto";
import { logger } from "../../lib/logger";
import { mapCollectionDailyPaidCustomerRow } from "../collection-daily-repository-row-utils";
import { mapCollectionRecordRow } from "../collection-repository-mappers";

function encryptLegacyCollectionPiiPayload(value: string, secret: string): string {
  const iv = Buffer.from("00112233445566778899aabb", "hex");
  const cipher = createCipheriv("aes-256-gcm", getLegacyCollectionPiiCipherKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

function withCollectionPiiKeys<T>(params: {
  current: string | null;
  previous?: string | null;
  retiredFields?: string | null;
}, fn: () => T): T {
  const previous = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  const previousCompat = process.env.COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS;
  const previousRetiredFields = process.env.COLLECTION_PII_RETIRED_FIELDS;
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
  if (params.retiredFields == null) {
    delete process.env.COLLECTION_PII_RETIRED_FIELDS;
  } else {
    process.env.COLLECTION_PII_RETIRED_FIELDS = params.retiredFields;
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
    if (previousRetiredFields === undefined) {
      delete process.env.COLLECTION_PII_RETIRED_FIELDS;
    } else {
      process.env.COLLECTION_PII_RETIRED_FIELDS = previousRetiredFields;
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

test("collection PII helpers keep optional blank fields empty instead of storing unreadable encrypted placeholders", () => {
  withCollectionPiiKeys({ current: "test-collection-pii-encryption-key" }, () => {
    const encrypted = buildEncryptedCollectionRecordPiiValues({
      customerName: "Card Only Customer",
      icNumber: "900101015555",
      customerPhone: "0123000001",
      accountNumber: "   ",
    });

    assert.ok(encrypted);
    assert.equal(encrypted?.accountNumberEncrypted, null);
    assert.equal(encryptCollectionPiiFieldValue(""), null);
    assert.equal(
      resolveCollectionPiiFieldValueFailClosed({
        field: "accountNumber",
        plaintext: null,
        encrypted: encrypted?.accountNumberEncrypted,
      }),
      "",
    );
  });
});

test("collection PII decryption accepts authenticated legacy empty-field payloads", () => {
  const secret = "test-collection-pii-encryption-key";
  const payload = encryptCollectionPiiWithSecret("", secret);

  assert.match(payload, /^[^.]+\.\.[^.]+$/);
  assert.equal(decryptCollectionPiiValueWithSecret(payload, secret), "");
});

test("collection record mapper safely reads a legacy encrypted blank Account Number", () => {
  withCollectionPiiKeys({ current: "test-collection-pii-encryption-key" }, () => {
    const encrypted = buildEncryptedCollectionRecordPiiValues({
      customerName: "Card Only Customer",
      icNumber: "900101015555",
      customerPhone: "0123000001",
      accountNumber: "",
    });
    const legacyBlankAccount = encryptCollectionPiiWithSecret(
      "",
      "test-collection-pii-encryption-key",
    );

    const record = mapCollectionRecordRow({
      id: "11111111-1111-1111-1111-111111111112",
      customer_name: null,
      customer_name_encrypted: encrypted?.customerNameEncrypted,
      ic_number: null,
      ic_number_encrypted: encrypted?.icNumberEncrypted,
      customer_phone: null,
      customer_phone_encrypted: encrypted?.customerPhoneEncrypted,
      account_number: null,
      account_number_encrypted: legacyBlankAccount,
      card_number_last4: "9999",
      batch: "P10",
      payment_date: "2026-09-02",
      amount: "1450.00",
      receipt_file: null,
      receipt_total_amount: 145000,
      receipt_validation_status: "matched",
      receipt_validation_message: null,
      receipt_count: 2,
      duplicate_receipt_flag: false,
      created_by_login: "system",
      collection_staff_nickname: "Collector Alpha",
      staff_username: "Collector Alpha",
      created_at: new Date("2026-09-02T00:00:00.000Z"),
      updated_at: new Date("2026-09-02T00:00:00.000Z"),
    });

    assert.equal(record.accountNumber, "");
    assert.equal(record.cardNumberLast4, "9999");
    assert.equal(record.receiptCount, 2);
  });
});

test("collection PII encryption uses HKDF while preserving legacy SHA-256 decrypt fallback", () => {
  const secret = "test-collection-pii-encryption-key";
  const value = "Alice Tan";
  const currentPayload = encryptCollectionPiiWithSecret(value, secret);
  const legacyPayload = encryptLegacyCollectionPiiPayload(value, secret);

  assert.notDeepEqual(getCollectionPiiCipherKey(secret), getLegacyCollectionPiiCipherKey(secret));
  assert.equal(decryptCollectionPiiValueWithSecret(currentPayload, secret), value);
  assert.equal(decryptCollectionPiiValueWithSecret(legacyPayload, secret), value);
  assert.throws(
    () => decryptCollectionPiiValueWithCurrentDerivationOnly(legacyPayload, secret),
    /Unsupported state or unable to authenticate data|Invalid collection PII payload/i,
  );
});

test("collection PII blind indexes keep the legacy key contract until backfilled", () => {
  withCollectionPiiKeys({ current: "search-hash-secret-key" }, () => {
    const expected = createHmac(
      "sha256",
      createHash("sha256").update("search-hash-secret-key").digest(),
    )
      .update("icNumber:900101015555")
      .digest("hex");

    assert.equal(hashCollectionPiiSearchValue("icNumber", "900101-01-5555"), expected);
  });
});

test("collection PII field resolution prefers decrypting shadow values over legacy plaintext", () => {
  withCollectionPiiKeys({ current: "test-collection-pii-encryption-key" }, () => {
    const encrypted = buildEncryptedCollectionRecordPiiValues({
      customerName: "Encrypted Alice",
      icNumber: "900101015555",
      customerPhone: "0123000001",
      accountNumber: "ACC-1001",
    });

    assert.equal(
      resolveCollectionPiiFieldValue({
        plaintext: "Legacy Alice",
        encrypted: encrypted?.customerNameEncrypted,
      }),
      "Encrypted Alice",
    );
  });
});

test("collection PII field resolution can suppress plaintext fallback for retired live fields", () => {
  withCollectionPiiKeys(
    {
      current: "test-collection-pii-encryption-key",
      retiredFields: "icNumber,customerPhone,accountNumber",
    },
    () => {
      assert.equal(
        resolveCollectionPiiFieldValue({
          field: "icNumber",
          plaintext: "900101015555",
          encrypted: "",
        }),
        "",
      );
      assert.equal(
        resolveCollectionPiiFieldValue({
          field: "customerName",
          plaintext: "Legacy Alice",
          encrypted: "",
        }),
        "Legacy Alice",
      );
    },
  );
});

test("collection PII helpers flag unreadable encrypted shadows when no plaintext fallback remains", () => {
  withCollectionPiiKeys({ current: "test-collection-pii-encryption-key" }, () => {
    assert.equal(
      hasUnreadableCollectionPiiShadowValue({
        plaintext: "",
        encrypted: "not-a-valid-collection-pii-payload",
      }),
      true,
    );
    assert.equal(
      hasUnreadableCollectionPiiShadowValue({
        plaintext: "Legacy Alice",
        encrypted: "not-a-valid-collection-pii-payload",
      }),
      false,
    );
  });
});

test("collection PII helpers reject retired plaintext persistence without an active encryption key", () => {
  withCollectionPiiKeys(
    {
      current: null,
      retiredFields: "icNumber,customerPhone,accountNumber",
    },
    () => {
      assert.throws(
        () =>
          resolveStoredCollectionPiiPlaintextValue({
            field: "icNumber",
            plaintext: "900101015555",
            encrypted: "",
          }),
        /Cannot retire collection PII plaintext for icNumber without COLLECTION_PII_ENCRYPTION_KEY/i,
      );
    },
  );
});

test("collection PII helpers reject retired plaintext persistence when the encrypted shadow value is missing", () => {
  withCollectionPiiKeys(
    {
      current: "test-collection-pii-encryption-key",
      retiredFields: "icNumber,customerPhone,accountNumber",
    },
    () => {
      assert.throws(
        () =>
          resolveStoredCollectionPiiPlaintextValue({
            field: "customerPhone",
            plaintext: "0123000001",
            encrypted: "",
          }),
        /Cannot persist retired collection PII field customerPhone without an encrypted shadow value/i,
      );
    },
  );
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

test("collection PII helpers keep plaintext storage nullable when current encrypted shadows are available", () => {
  withCollectionPiiKeys({ current: "test-collection-pii-encryption-key" }, () => {
    const encrypted = buildEncryptedCollectionRecordPiiValues({
      customerName: "Alice Tan",
      icNumber: "900101015555",
      customerPhone: "0123000001",
      accountNumber: "ACC-1001",
    });

    assert.equal(
      resolveStoredCollectionPiiPlaintextValue({
        field: "customerName",
        plaintext: "Alice Tan",
        encrypted: encrypted?.customerNameEncrypted,
      }),
      null,
    );
    assert.equal(
      resolveStoredCollectionPiiPlaintextValue({
        field: "icNumber",
        plaintext: "900101015555",
        encrypted: encrypted?.icNumberEncrypted,
      }),
      null,
    );
    assert.equal(
      resolveStoredCollectionPiiPlaintextValue({
        field: "customerName",
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
        field: "customerName",
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

test("collection PII decrypt failures are observable without logging payload values", (t) => {
  const debugLogs: Array<{ message: string; metadata: Record<string, unknown> }> = [];
  t.mock.method(logger, "debug", (message: string, metadata: Record<string, unknown>) => {
    debugLogs.push({ message, metadata });
  });

  withCollectionPiiKeys(
    {
      current: "new-collection-pii-key",
      previous: "old-collection-pii-key",
    },
    () => {
      assert.throws(
        () => decryptCollectionPiiValue("invalid-encrypted-payload"),
        /Invalid collection PII payload/i,
      );
    },
  );

  const candidateLogs = debugLogs.filter((entry) => entry.message === "Collection PII decryption candidate failed");
  assert.equal(candidateLogs.length, 2);
  assert.equal(candidateLogs[0]?.metadata.payloadLength, "invalid-encrypted-payload".length);
  assert.equal(candidateLogs[0]?.metadata.secretIndex, 0);
  assert.equal(candidateLogs[0]?.metadata.secretCount, 2);
  assert.equal(debugLogs.every((entry) =>
    !Object.prototype.hasOwnProperty.call(entry.metadata ?? {}, "payload")
  ), true);
});

test("collection PII safe decrypt increments fallback metric on failure", () => {
  const before = getInternalMetricsSnapshot().counters.collectionPiiDecryptFallbackTotal;

  withCollectionPiiKeys({ current: "test-collection-pii-encryption-key" }, () => {
    assert.equal(decryptCollectionPiiValueSafe("invalid-encrypted-payload"), null);
  });

  const after = getInternalMetricsSnapshot().counters.collectionPiiDecryptFallbackTotal;
  assert.equal(after, before + 1);
});

test("collection PII decrypt result exposes typed failure reasons", () => {
  withCollectionPiiKeys({ current: null }, () => {
    assert.deepEqual(
      decryptCollectionPiiValueResult("invalid-encrypted-payload", { logFailure: false }),
      { success: false, reason: "KEY_NOT_CONFIGURED" },
    );
    assert.deepEqual(
      decryptCollectionPiiValueResult("", { logFailure: false }),
      { success: false, reason: "EMPTY_PAYLOAD" },
    );
  });

  withCollectionPiiKeys({ current: "test-collection-pii-encryption-key" }, () => {
    assert.deepEqual(
      decryptCollectionPiiValueResult("invalid-encrypted-payload", { logFailure: false }),
      { success: false, reason: "DECRYPTION_FAILED" },
    );
  });
});

test("collection PII fail-closed resolver rejects unreadable encrypted shadows", (t) => {
  const errorLogs: Array<{ message: string; metadata: Record<string, unknown> }> = [];
  t.mock.method(logger, "error", (message: string, metadata: Record<string, unknown>) => {
    errorLogs.push({ message, metadata });
  });
  const before = getInternalMetricsSnapshot().counters.collectionPiiDecryptFailClosedTotal;

  withCollectionPiiKeys({ current: "test-collection-pii-encryption-key" }, () => {
    assert.throws(
      () =>
        resolveCollectionPiiFieldValueFailClosed({
          field: "icNumber",
          plaintext: "900101015555",
          encrypted: "invalid-encrypted-payload",
        }),
      CollectionPiiDecryptionError,
    );
  });

  const after = getInternalMetricsSnapshot().counters.collectionPiiDecryptFailClosedTotal;
  assert.equal(after, before + 1);
  assert.equal(errorLogs.length, 1);
  assert.equal(errorLogs[0]?.message, "Collection PII decryption failed closed");
  assert.equal(errorLogs[0]?.metadata.operation, "resolveCollectionPiiFieldValueFailClosed");
  assert.equal(errorLogs[0]?.metadata.source, "icNumber");
  assert.equal(errorLogs[0]?.metadata.reason, "DECRYPTION_FAILED");
  assert.equal(errorLogs[0]?.metadata.payloadLength, "invalid-encrypted-payload".length);
  assert.equal(Object.prototype.hasOwnProperty.call(errorLogs[0]?.metadata ?? {}, "payload"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(errorLogs[0]?.metadata ?? {}, "plaintext"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(errorLogs[0]?.metadata ?? {}, "encrypted"), false);
});

test("collection PII response mappers fail closed instead of returning partial rows", () => {
  withCollectionPiiKeys({ current: "test-collection-pii-encryption-key" }, () => {
    assert.throws(
      () =>
        mapCollectionRecordRow({
          id: "11111111-1111-1111-1111-111111111111",
          customer_name: "Legacy Alice",
          customer_name_encrypted: "invalid-encrypted-payload",
          ic_number: "900101015555",
          customer_phone: "0123000001",
          account_number: "ACC-1001",
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
        }),
      CollectionPiiDecryptionError,
    );

    assert.throws(
      () =>
        mapCollectionDailyPaidCustomerRow({
          id: "22222222-2222-2222-2222-222222222222",
          customer_name: "Legacy Alice",
          customer_name_encrypted: "invalid-encrypted-payload",
          account_number: "ACC-1001",
          account_number_encrypted: null,
          amount: "10.00",
          collection_staff_nickname: "Collector Alpha",
        }),
      CollectionPiiDecryptionError,
    );
  });
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

test("collection PII customer-name hash resolver prefers current blind indexes over stale provided hashes", () => {
  withCollectionPiiKeys({ current: "search-hash-secret-key" }, () => {
    assert.deepEqual(
      resolveCollectionCustomerNameSearchHashesValue({
        plaintext: "Alice Tan",
        hashes: ["stale.hash.value"],
      }),
      hashCollectionCustomerNameSearchTerms("Alice Tan"),
    );
  });
});

test("collection PII customer-name hash resolver falls back to provided hashes when hashing is unavailable", () => {
  withCollectionPiiKeys({ current: null }, () => {
    assert.deepEqual(
      resolveCollectionCustomerNameSearchHashesValue({
        plaintext: "",
        hashes: ["hash.customer.al", "hash.customer.alice", "hash.customer.al"],
      }),
      ["hash.customer.al", "hash.customer.alice"],
    );
  });
});

test("collection PII customer-name hash resolver suppresses plaintext fallback for retired live fields", () => {
  withCollectionPiiKeys(
    {
      current: "search-hash-secret-key",
      retiredFields: "customerName",
    },
    () => {
      assert.deepEqual(
        resolveCollectionCustomerNameSearchHashesValue({
          plaintext: "Legacy Alice",
          encrypted: "",
          hashes: ["hash.customer.al", "hash.customer.alice"],
        }),
        ["hash.customer.al", "hash.customer.alice"],
      );
    },
  );
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
      assert.equal(
        shouldRewriteCollectionPiiSearchHashValue({
          field: "customerPhone",
          plaintext: "0123111222",
          encrypted: "",
          hash: legacyHash,
        }),
        true,
      );
    },
  );
});

test("collection PII rewrite helpers suppress plaintext fallback for retired live fields", () => {
  withCollectionPiiKeys(
    {
      current: "new-collection-pii-key",
      retiredFields: "customerName,customerPhone",
    },
    () => {
      assert.equal(
        shouldRewriteCollectionPiiSearchHashValue({
          field: "customerPhone",
          plaintext: "0123111222",
          encrypted: "",
          hash: "stale.hash.value",
        }),
        false,
      );
      assert.equal(
        shouldRewriteCollectionPiiSearchHashesValue({
          plaintext: "Legacy Alice",
          encrypted: "",
          hashes: ["hash.customer.al"],
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
