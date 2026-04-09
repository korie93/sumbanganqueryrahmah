import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCollectionRecordPiiSearchHashes,
  buildEncryptedCollectionRecordPiiValues,
} from "../server/lib/collection-pii-encryption";
import {
  evaluateCollectionPiiStatus,
  getCollectionPiiStatusPlan,
  parseCliOptions,
  parseTrackedCollectionPiiFields,
} from "./collection-pii-status";

test("parseCliOptions accepts json output and row caps", () => {
  const options = parseCliOptions([
    "--batch-size",
    "250",
    "--max-rows",
    "1000",
    "--json",
  ]);

  assert.equal(options.batchSize, 250);
  assert.equal(options.maxRows, 1000);
  assert.equal(options.json, true);
  assert.deepEqual(Array.from(options.fields), [
    "customerName",
    "icNumber",
    "customerPhone",
    "accountNumber",
  ]);
});

test("parseCliOptions accepts field filters and requirement gates", () => {
  const options = parseCliOptions([
    "--fields",
    "icNumber,customerPhone,accountNumber",
    "--require-zero-plaintext",
    "--require-zero-redactable",
    "--require-zero-rewrite",
  ]);

  assert.deepEqual(Array.from(options.fields), [
    "icNumber",
    "customerPhone",
    "accountNumber",
  ]);
  assert.equal(options.requireZeroPlaintext, true);
  assert.equal(options.requireZeroRedactable, true);
  assert.equal(options.requireZeroRewrite, true);
});

test("parseCliOptions can read staged field filters from an environment variable", () => {
  const previous = process.env.COLLECTION_PII_RETIRED_FIELDS;
  process.env.COLLECTION_PII_RETIRED_FIELDS = "icNumber,customerPhone,accountNumber";

  try {
    const options = parseCliOptions([
      "--fields-env",
      "COLLECTION_PII_RETIRED_FIELDS",
      "--require-zero-plaintext",
    ]);

    assert.deepEqual(Array.from(options.fields), [
      "icNumber",
      "customerPhone",
      "accountNumber",
    ]);
    assert.equal(options.requireZeroPlaintext, true);
  } finally {
    if (previous === undefined) {
      delete process.env.COLLECTION_PII_RETIRED_FIELDS;
    } else {
      process.env.COLLECTION_PII_RETIRED_FIELDS = previous;
    }
  }
});

test("parseCliOptions rejects empty field filters sourced from an environment variable", () => {
  const previous = process.env.COLLECTION_PII_RETIRED_FIELDS;
  delete process.env.COLLECTION_PII_RETIRED_FIELDS;

  try {
    assert.throws(
      () => parseCliOptions(["--fields-env", "COLLECTION_PII_RETIRED_FIELDS"]),
      /could not find a non-empty value in COLLECTION_PII_RETIRED_FIELDS/i,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.COLLECTION_PII_RETIRED_FIELDS;
    } else {
      process.env.COLLECTION_PII_RETIRED_FIELDS = previous;
    }
  }
});

test("parseTrackedCollectionPiiFields rejects unknown field names", () => {
  assert.throws(
    () => parseTrackedCollectionPiiFields("customerName,passportNumber"),
    /Unknown collection PII field 'passportNumber'/,
  );
});

test("getCollectionPiiStatusPlan reports plaintext without rewrite metadata when encryption is disabled", () => {
  const plan = getCollectionPiiStatusPlan(
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
    false,
  );

  assert.deepEqual(plan.plaintext, {
    customerName: true,
    icNumber: true,
    customerPhone: true,
    accountNumber: true,
  });
  assert.deepEqual(plan.redactable, {
    customerName: false,
    icNumber: false,
    customerPhone: false,
    accountNumber: false,
  });
  assert.deepEqual(plan.rewrite, {
    customerName: false,
    icNumber: false,
    customerPhone: false,
    accountNumber: false,
  });
});

test("getCollectionPiiStatusPlan distinguishes redactable rows from rows that still need rewrite", () => {
  const previousKey = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  process.env.COLLECTION_PII_ENCRYPTION_KEY = "collection-pii-status-test-key";

  try {
    const encrypted = buildEncryptedCollectionRecordPiiValues({
      customerName: "Alice",
      icNumber: "900101015555",
      customerPhone: "0123000001",
      accountNumber: "ACC-1001",
    });
    const hashes = buildCollectionRecordPiiSearchHashes({
      customerName: "Alice",
      icNumber: "900101015555",
      customerPhone: "0123000001",
      accountNumber: "ACC-1001",
    });

    const redactablePlan = getCollectionPiiStatusPlan({
      id: "record-1",
      customer_name: "Alice",
      customer_name_encrypted: encrypted?.customerNameEncrypted ?? null,
      customer_name_search_hash: hashes?.customerNameSearchHash ?? null,
      customer_name_search_hashes: hashes?.customerNameSearchHashes ?? null,
      ic_number: "900101015555",
      ic_number_encrypted: encrypted?.icNumberEncrypted ?? null,
      ic_number_search_hash: hashes?.icNumberSearchHash ?? null,
      customer_phone: "0123000001",
      customer_phone_encrypted: encrypted?.customerPhoneEncrypted ?? null,
      customer_phone_search_hash: hashes?.customerPhoneSearchHash ?? null,
      account_number: "ACC-1001",
      account_number_encrypted: encrypted?.accountNumberEncrypted ?? null,
      account_number_search_hash: hashes?.accountNumberSearchHash ?? null,
    });

    assert.deepEqual(redactablePlan.redactable, {
      customerName: true,
      icNumber: true,
      customerPhone: true,
      accountNumber: true,
    });
    assert.deepEqual(redactablePlan.rewrite, {
      customerName: false,
      icNumber: false,
      customerPhone: false,
      accountNumber: false,
    });

    const rewritePlan = getCollectionPiiStatusPlan({
      id: "record-2",
      customer_name: "Bob",
      customer_name_encrypted: null,
      customer_name_search_hash: null,
      customer_name_search_hashes: null,
      ic_number: "800202025555",
      ic_number_encrypted: null,
      ic_number_search_hash: null,
      customer_phone: "0199000002",
      customer_phone_encrypted: null,
      customer_phone_search_hash: null,
      account_number: "ACC-2002",
      account_number_encrypted: null,
      account_number_search_hash: null,
    });

    assert.deepEqual(rewritePlan.redactable, {
      customerName: false,
      icNumber: false,
      customerPhone: false,
      accountNumber: false,
    });
    assert.deepEqual(rewritePlan.rewrite, {
      customerName: true,
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

test("getCollectionPiiStatusPlan respects selected field filters", () => {
  const plan = getCollectionPiiStatusPlan(
    {
      id: "record-3",
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
    false,
    new Set(["icNumber", "customerPhone"]),
  );

  assert.deepEqual(plan.plaintext, {
    customerName: false,
    icNumber: true,
    customerPhone: true,
    accountNumber: false,
  });
});

test("evaluateCollectionPiiStatus reports unmet threshold requirements", () => {
  const evaluation = evaluateCollectionPiiStatus(
    {
      encryptionConfigured: true,
      plaintextFieldCounts: {
        customerName: 0,
        icNumber: 1,
        customerPhone: 0,
        accountNumber: 0,
      },
      plaintextFields: 1,
      processedRows: 5,
      redactableFieldCounts: {
        customerName: 0,
        icNumber: 0,
        customerPhone: 0,
        accountNumber: 0,
      },
      redactableFields: 0,
      rewriteFieldCounts: {
        customerName: 0,
        icNumber: 0,
        customerPhone: 2,
        accountNumber: 0,
      },
      rewriteFields: 2,
      rowsEligibleForRedaction: 0,
      rowsNeedingRewrite: 2,
      rowsWithPlaintext: 1,
    },
    {
      requireZeroPlaintext: true,
      requireZeroRedactable: false,
      requireZeroRewrite: true,
    },
  );

  assert.equal(evaluation.ok, false);
  assert.deepEqual(evaluation.failures, [
    "rowsWithPlaintext=1 must be zero.",
    "rowsNeedingRewrite=2 must be zero.",
  ]);
});
