import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCollectionPiiRollbackSnapshotName,
  buildCollectionPiiRollbackSql,
  summarizeCollectionPiiDecryptability,
  getCollectionPiiRewritePlan,
  parseCliOptions,
  validateCollectionPiiActiveKey,
} from "./reencrypt-collection-pii";
import { encryptCollectionPiiFieldValue } from "../server/lib/collection-pii-encryption";

test("parseCliOptions accepts field filters, json output, and row caps for re-encryption", () => {
  const options = parseCliOptions([
    "--fields",
    "icNumber,customerPhone,accountNumber",
    "--batch-size",
    "250",
    "--max-rows",
    "1000",
    "--json",
  ]);

  assert.deepEqual(Array.from(options.fields), [
    "icNumber",
    "customerPhone",
    "accountNumber",
  ]);
  assert.equal(options.batchSize, 250);
  assert.equal(options.maxRows, 1000);
  assert.equal(options.json, true);
});

test("parseCliOptions can read re-encryption field filters from an environment variable", () => {
  const previous = process.env.COLLECTION_PII_RETIRED_FIELDS;
  process.env.COLLECTION_PII_RETIRED_FIELDS = "icNumber,customerPhone,accountNumber";

  try {
    const options = parseCliOptions([
      "--fields-env",
      "COLLECTION_PII_RETIRED_FIELDS",
    ]);

    assert.deepEqual(Array.from(options.fields), [
      "icNumber",
      "customerPhone",
      "accountNumber",
    ]);
  } finally {
    if (previous === undefined) {
      delete process.env.COLLECTION_PII_RETIRED_FIELDS;
    } else {
      process.env.COLLECTION_PII_RETIRED_FIELDS = previous;
    }
  }
});

test("getCollectionPiiRewritePlan respects selected field filters", () => {
  const previousKey = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  process.env.COLLECTION_PII_ENCRYPTION_KEY = "reencrypt-collection-pii-test-key";

  try {
    const plan = getCollectionPiiRewritePlan(
      {
        id: "record-1",
        customer_name: "Alice",
        customer_name_encrypted: null,
        customer_name_search_hash: null,
        customer_name_search_hashes: null,
        ic_number: "900101015555",
        ic_number_encrypted: null,
        ic_number_search_hash: null,
        customer_phone: "0123000001",
        customer_phone_encrypted: null,
        customer_phone_search_hash: null,
        account_number: "ACC-1001",
        account_number_encrypted: null,
        account_number_search_hash: null,
      },
      new Set(["icNumber", "customerPhone", "accountNumber"]),
    );

    assert.deepEqual(plan, {
      customerName: false,
      icNumber: true,
      customerPhone: true,
      accountNumber: true,
    });
  } finally {
    if (previousKey === undefined) {
      delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    } else {
      process.env.COLLECTION_PII_ENCRYPTION_KEY = previousKey;
    }
  }
});

test("buildCollectionPiiRollbackSnapshotName produces a stable safe table name", () => {
  const tableName = buildCollectionPiiRollbackSnapshotName(new Date("2026-06-03T04:05:06.789Z"));

  assert.equal(
    tableName,
    "collection_records_pii_reencrypt_rollback_20260603040506789",
  );
  assert.match(tableName, /^[a-z_][a-z0-9_]*$/);
});

test("buildCollectionPiiRollbackSql restores only selected PII columns from the snapshot", () => {
  const rollbackSql = buildCollectionPiiRollbackSql(
    "collection_records_pii_reencrypt_rollback_20260603040506789",
    new Set(["icNumber", "customerPhone"]),
  );

  assert.match(rollbackSql, /UPDATE public\.collection_records AS target/);
  assert.match(rollbackSql, /ic_number_encrypted = snapshot\.ic_number_encrypted/);
  assert.match(rollbackSql, /customer_phone_search_hash = snapshot\.customer_phone_search_hash/);
  assert.doesNotMatch(rollbackSql, /customer_name_encrypted/);
  assert.doesNotMatch(rollbackSql, /\bic_number = snapshot\.ic_number\b/);
  assert.doesNotMatch(rollbackSql, /\bcustomer_phone = snapshot\.customer_phone\b/);
  assert.match(
    rollbackSql,
    /FROM public\."collection_records_pii_reencrypt_rollback_20260603040506789" AS snapshot/,
  );
});

test("validateCollectionPiiActiveKey verifies the configured active key can round-trip data", () => {
  const previousKey = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  process.env.COLLECTION_PII_ENCRYPTION_KEY = "reencrypt-collection-pii-active-key-test";

  try {
    assert.doesNotThrow(() => validateCollectionPiiActiveKey());
  } finally {
    if (previousKey === undefined) {
      delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    } else {
      process.env.COLLECTION_PII_ENCRYPTION_KEY = previousKey;
    }
  }
});

test("summarizeCollectionPiiDecryptability flags corrupt encrypted shadows before migration", () => {
  const previousKey = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  process.env.COLLECTION_PII_ENCRYPTION_KEY = "reencrypt-collection-pii-decryptability-test";

  try {
    const encrypted = encryptCollectionPiiFieldValue("900101015555");
    assert.ok(encrypted);

    const summary = summarizeCollectionPiiDecryptability(
      [
        {
          id: "record-1",
          ic_number_encrypted: encrypted,
        },
        {
          id: "record-2",
          ic_number_encrypted: "not.a.valid.payload",
        },
      ],
      new Set(["icNumber"]),
    );

    assert.deepEqual(summary, {
      decryptableEncryptedFields: 1,
      scannedRows: 2,
      unreadableEncryptedFields: 1,
    });
  } finally {
    if (previousKey === undefined) {
      delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    } else {
      process.env.COLLECTION_PII_ENCRYPTION_KEY = previousKey;
    }
  }
});
