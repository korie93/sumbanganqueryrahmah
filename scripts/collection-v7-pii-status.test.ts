import assert from "node:assert/strict";
import test from "node:test";

import {
  encryptCollectionPiiFieldValue,
  hashCollectionCustomerNameSearchTerms,
  hashCollectionPiiSearchValue,
} from "../server/lib/collection-pii-encryption";
import {
  assertV7PiiRetirementScanComplete,
  inspectCollectionV7PiiRow,
  parseCliOptions,
} from "./collection-v7-pii-status";

test("V7 PII status accepts key-retirement verification controls", () => {
  const options = parseCliOptions([
    "--batch-size", "250", "--max-rows", "1000", "--json", "--require-zero-unreadable",
  ]);

  assert.equal(options.batchSize, 250);
  assert.equal(options.maxRows, 1000);
  assert.equal(options.json, true);
  assert.equal(options.requireZeroRewrite, false);
  assert.equal(options.requireZeroUnreadable, true);
});

test("V7 PII status fails closed for unreadable encrypted snapshots", () => {
  const previousKey = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  process.env.COLLECTION_PII_ENCRYPTION_KEY = "collection-v7-pii-status-test-key";

  try {
    const accountNumberEncrypted = encryptCollectionPiiFieldValue("ACC-1001");
    assert.ok(accountNumberEncrypted);
    const result = inspectCollectionV7PiiRow({
      account_number_encrypted: accountNumberEncrypted,
      customer_name_encrypted: "not-a-valid-collection-pii-payload",
    });

    assert.deepEqual(result.decryptableFields, ["accountNumber"]);
    assert.deepEqual(result.unreadableFields, ["customerName"]);
  } finally {
    if (previousKey === undefined) {
      delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    } else {
      process.env.COLLECTION_PII_ENCRYPTION_KEY = previousKey;
    }
  }
});

test("V7 PII status treats malformed empty snapshots as unreadable", () => {
  const result = inspectCollectionV7PiiRow({
    account_number_encrypted: "",
    customer_name_encrypted: "   ",
  });

  assert.deepEqual(result.decryptableFields, []);
  assert.deepEqual(result.unreadableFields, ["accountNumber", "customerName"]);
});

test("V7 PII key-retirement verification rejects partial scans", () => {
  assert.throws(
    () => assertV7PiiRetirementScanComplete({ maxRows: 1, requireZeroUnreadable: true }),
    /must inspect every V7 PII snapshot/i,
  );
  assert.doesNotThrow(
    () => assertV7PiiRetirementScanComplete({ maxRows: null, requireZeroUnreadable: true }),
  );
  assert.throws(
    () => assertV7PiiRetirementScanComplete({
      maxRows: 1,
      requireZeroUnreadable: false,
      requireZeroRewrite: true,
    }),
    /must inspect every V7 PII snapshot/i,
  );
});

test("V7 PII key-retirement status distinguishes previous-key ciphertext from current-key data", () => {
  const originalCurrent = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  const originalPrevious = process.env.COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS;
  const originalSearch = process.env.COLLECTION_PII_SEARCH_KEY;
  process.env.COLLECTION_PII_ENCRYPTION_KEY = "collection-v7-old-encryption-key";
  delete process.env.COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS;
  process.env.COLLECTION_PII_SEARCH_KEY = "collection-v7-stable-search-key";

  try {
    const oldAccount = encryptCollectionPiiFieldValue("ACC-2002");
    const oldCustomer = encryptCollectionPiiFieldValue("CUSTOMER TWO");
    assert.ok(oldAccount);
    assert.ok(oldCustomer);

    process.env.COLLECTION_PII_ENCRYPTION_KEY = "collection-v7-current-encryption-key";
    process.env.COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS = "collection-v7-old-encryption-key";
    const previousKeyResult = inspectCollectionV7PiiRow({
      account_number_encrypted: oldAccount,
      account_number_search_hash: hashCollectionPiiSearchValue("accountNumber", "ACC-2002"),
      customer_name_encrypted: oldCustomer,
      customer_name_search_hashes: hashCollectionCustomerNameSearchTerms("CUSTOMER TWO"),
    });
    assert.deepEqual(previousKeyResult.decryptableFields, ["accountNumber", "customerName"]);
    assert.deepEqual(previousKeyResult.unreadableFields, []);
    assert.deepEqual(previousKeyResult.rewriteFields, ["accountNumber", "customerName"]);

    const currentAccount = encryptCollectionPiiFieldValue("ACC-2002");
    const currentCustomer = encryptCollectionPiiFieldValue("CUSTOMER TWO");
    assert.ok(currentAccount);
    assert.ok(currentCustomer);
    const currentKeyResult = inspectCollectionV7PiiRow({
      account_number_encrypted: currentAccount,
      account_number_search_hash: hashCollectionPiiSearchValue("accountNumber", "ACC-2002"),
      customer_name_encrypted: currentCustomer,
      customer_name_search_hashes: hashCollectionCustomerNameSearchTerms("CUSTOMER TWO"),
    });
    assert.deepEqual(currentKeyResult.rewriteFields, []);
  } finally {
    if (originalCurrent === undefined) delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    else process.env.COLLECTION_PII_ENCRYPTION_KEY = originalCurrent;
    if (originalPrevious === undefined) delete process.env.COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS;
    else process.env.COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS = originalPrevious;
    if (originalSearch === undefined) delete process.env.COLLECTION_PII_SEARCH_KEY;
    else process.env.COLLECTION_PII_SEARCH_KEY = originalSearch;
  }
});
