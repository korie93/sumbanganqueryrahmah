import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../../db-postgres";
import {
  decryptCollectionPiiValueWithSecretSafe,
} from "../../lib/collection-pii-encryption-crypto";
import { hashCollectionPiiSearchValue } from "../../lib/collection-pii-encryption";
import { createCollectionRecord } from "../collection-record-create-repository-utils";
import type { CollectionRepositoryExecutor } from "../collection-nickname-utils";
import { hashCollectionSourceIdentifier } from "../collection-source-repository-utils";
import { collectBoundValues, collectSqlText } from "./sql-test-utils";

test("Card-only create encrypts the hash-verified Saved Account instead of persisting a blank value", async () => {
  const originalTransaction = db.transaction;
  const previousEncryptionKey = process.env.COLLECTION_PII_ENCRYPTION_KEY;
  const encryptionKey = "test-card-only-create-encryption-key";
  const trustedAccountNumber = "000012345678";
  const fullCardNumber = "5555555555554444";
  const accountHash = hashCollectionSourceIdentifier(
    trustedAccountNumber,
    "account_number",
  );
  const cardHash = hashCollectionSourceIdentifier(fullCardNumber, "card_number");
  assert.ok(accountHash);
  assert.ok(cardHash);
  const stopAfterInsert = new Error("STOP_AFTER_COLLECTION_INSERT");
  let insertQuery: unknown;

  process.env.COLLECTION_PII_ENCRYPTION_KEY = encryptionKey;
  (db as unknown as { transaction: typeof db.transaction }).transaction = (async (callback) => {
    const executor = {
      execute: async (query: unknown) => {
        const queryText = collectSqlText(query);
        if (/SELECT source_row\.source_data_row_id[\s\S]*data_row\.json_data/i.test(queryText)) {
          return {
            rows: [{
              source_data_row_id: "saved-row-create-test",
              account_number_hash: accountHash,
              card_number_hash: cardHash,
              card_number_last4: "4444",
              json_data: {
                "Account Number": trustedAccountNumber,
                "Card Number": fullCardNumber,
              },
            }],
          };
        }
        if (/INSERT INTO public\.collection_records/i.test(queryText)) {
          insertQuery = query;
          throw stopAfterInsert;
        }
        return { rows: [] };
      },
    } as CollectionRepositoryExecutor;
    return callback(executor as never);
  }) as typeof db.transaction;

  try {
    await assert.rejects(
      createCollectionRecord({
        customerName: "Card-only Create Test",
        icNumber: "900101015555",
        customerPhone: "0123456789",
        accountNumber: "",
        sourceCardNumber: fullCardNumber,
        cardNumberLast4: "4444",
        sourceImportId: "source-create-test",
        sourceDataRowId: "saved-row-create-test",
        sourceImportName: "Create source test",
        sourceFilename: "create-source-test.xlsb",
        agingBucket: "D3",
        callingDate: "2026-08-12",
        callingWindowEndExclusive: "2026-09-12",
        totalDue: 1000,
        billingPrincipalOsp: 5000,
        sourceMatchBasis: "card_number",
        sourceMatchAccuracy: 100,
        sourceObligationKey: `account:${accountHash}`,
        settlementCycleKey: `2026-08-12:account:${accountHash}`,
        batch: "P10",
        paymentDate: "2026-09-01",
        amount: 100,
        createdByLogin: "staff.user",
        collectionStaffNickname: "Collector Alpha",
      }),
      (error: unknown) => error === stopAfterInsert,
    );

    assert.ok(insertQuery);
    const insertValues = collectBoundValues(insertQuery);
    const encryptedAccountValue = insertValues.find((value) => (
      decryptCollectionPiiValueWithSecretSafe(value, encryptionKey) === trustedAccountNumber
    ));
    assert.ok(encryptedAccountValue, "trusted Account must be encrypted in the INSERT");
    assert.ok(insertValues.includes(
      hashCollectionPiiSearchValue("accountNumber", trustedAccountNumber),
    ));
    assert.ok(insertValues.includes("4444"));
    assert.equal(insertValues.includes(trustedAccountNumber), false);
    assert.equal(insertValues.includes(fullCardNumber), false);
  } finally {
    (db as unknown as { transaction: typeof db.transaction }).transaction = originalTransaction;
    if (previousEncryptionKey === undefined) {
      delete process.env.COLLECTION_PII_ENCRYPTION_KEY;
    } else {
      process.env.COLLECTION_PII_ENCRYPTION_KEY = previousEncryptionKey;
    }
  }
});
