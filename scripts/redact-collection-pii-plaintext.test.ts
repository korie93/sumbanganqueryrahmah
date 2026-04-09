import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCollectionRecordPiiSearchHashes,
  buildEncryptedCollectionRecordPiiValues,
} from "../server/lib/collection-pii-encryption";
import {
  getRedactionPlan,
  parseCliOptions,
  parseRedactableCollectionPiiFields,
  resolveRedactedCollectionPiiPlaintextValue,
} from "./redact-collection-pii-plaintext";

test("parseRedactableCollectionPiiFields accepts staged numeric-field rollout", () => {
  const fields = parseRedactableCollectionPiiFields("icNumber, customerPhone,accountNumber");

  assert.deepEqual(
    Array.from(fields),
    ["icNumber", "customerPhone", "accountNumber"],
  );
});

test("parseCliOptions accepts --fields alongside apply and batch sizing", () => {
  const options = parseCliOptions([
    "--apply",
    "--batch-size",
    "250",
    "--fields",
    "customerPhone,accountNumber",
    "--max-rows",
    "1000",
  ]);

  assert.equal(options.apply, true);
  assert.equal(options.batchSize, 250);
  assert.equal(options.json, false);
  assert.equal(options.maxRows, 1000);
  assert.deepEqual(Array.from(options.fields), ["customerPhone", "accountNumber"]);
});

test("parseCliOptions accepts --fields-env and --json", () => {
  const previous = process.env.COLLECTION_PII_RETIRED_FIELDS;
  process.env.COLLECTION_PII_RETIRED_FIELDS = "icNumber,customerPhone,accountNumber";

  try {
    const options = parseCliOptions([
      "--fields-env",
      "COLLECTION_PII_RETIRED_FIELDS",
      "--json",
    ]);

    assert.equal(options.json, true);
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

test("getRedactionPlan only evaluates requested staged fields", () => {
  const previousKey = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  process.env.COLLECTION_PII_ENCRYPTION_KEY = "staged-redaction-test-key";

  try {
    const fields = new Set(["customerPhone", "accountNumber"] as const);
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

    const plan = getRedactionPlan(
      {
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
      },
      fields,
    );

    assert.equal(plan.customerName, false);
    assert.equal(plan.icNumber, false);
    assert.equal(plan.customerPhone, true);
    assert.equal(plan.accountNumber, true);
  } finally {
    if (previousKey === undefined) {
      delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    } else {
      process.env.COLLECTION_PII_ENCRYPTION_KEY = previousKey;
    }
  }
});

test("resolveRedactedCollectionPiiPlaintextValue clears retired plaintext to null", () => {
  assert.equal(
    resolveRedactedCollectionPiiPlaintextValue("Alice", true),
    null,
  );
  assert.equal(
    resolveRedactedCollectionPiiPlaintextValue("Alice", false),
    "Alice",
  );
  assert.equal(
    resolveRedactedCollectionPiiPlaintextValue(null, false),
    null,
  );
});
