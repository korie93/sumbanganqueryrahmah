import assert from "node:assert/strict";
import test from "node:test";

import {
  getCollectionPiiRewritePlan,
  parseCliOptions,
} from "./reencrypt-collection-pii";

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
