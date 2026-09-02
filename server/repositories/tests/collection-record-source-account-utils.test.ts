import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionRecord } from "../../storage-postgres";
import type { CollectionRepositoryExecutor } from "../collection-nickname-utils";
import {
  hydrateCollectionRecordSourceAccounts,
} from "../collection-record-source-account-utils";
import { hashCollectionSourceIdentifier } from "../collection-source-repository-utils";
import {
  collectBoundValues,
  collectSqlLiteralText,
  collectSqlText,
  createSequenceExecutor,
} from "./sql-test-utils";

function buildRecord(overrides: Partial<CollectionRecord> = {}): CollectionRecord {
  return {
    id: "record-1",
    customerName: "Card Customer",
    icNumber: "900101015555",
    customerPhone: "0123456789",
    accountNumber: "",
    cardNumberLast4: "5678",
    sourceImportId: "import-1",
    sourceDataRowId: "source-row-1",
    sourceObligationKey: "account:missing",
    batch: "P10",
    paymentDate: "2026-09-02",
    amount: "100.00",
    receiptFile: null,
    receipts: [],
    receiptTotalAmount: "0.00",
    receiptValidationStatus: "unverified",
    receiptValidationMessage: null,
    receiptCount: 0,
    duplicateReceiptFlag: false,
    createdByLogin: "staff.user",
    collectionStaffNickname: "Collector Alpha",
    createdAt: new Date("2026-09-02T00:00:00.000Z"),
    ...overrides,
  };
}

function buildAccountObligationKey(accountNumber: string): string {
  const accountHash = hashCollectionSourceIdentifier(accountNumber, "account_number");
  assert.ok(accountHash);
  return `account:${accountHash}`;
}

test("hydrates a blank historical Account Number only from its exact linked Saved row", async () => {
  const accountNumber = "ACC-0001";
  const fullCardNumber = "0000123412345678";
  const record = buildRecord({
    sourceObligationKey: buildAccountObligationKey(accountNumber),
  });
  const { executor, queries } = createSequenceExecutor<CollectionRepositoryExecutor>([{
    rows: [{
      source_import_id: "import-1",
      source_data_row_id: "source-row-1",
      source_json_data: {
        "Account Number": accountNumber,
        "Card Number": fullCardNumber,
      },
    }],
  }]);

  const hydrated = await hydrateCollectionRecordSourceAccounts(executor, [record]);

  assert.equal(hydrated[0]?.accountNumber, accountNumber);
  assert.equal(hydrated[0]?.cardNumberLast4, "5678");
  assert.equal("cardNumber" in (hydrated[0] || {}), false);
  assert.doesNotMatch(JSON.stringify(hydrated), new RegExp(fullCardNumber));
  assert.equal(queries.length, 1);

  const queryText = collectSqlText(queries[0]).replace(/\s+/g, " ");
  assert.match(queryText, /source_data\.import_id\s*=\s*target\.source_import_id/i);
  assert.match(queryText, /source_data\.id\s*=\s*target\.source_data_row_id/i);
  assert.deepEqual(
    collectBoundValues(queries[0]).filter((value) => value === "import-1" || value === "source-row-1"),
    ["import-1", "source-row-1"],
  );
  assert.doesNotMatch(collectSqlLiteralText(queries[0]), new RegExp(accountNumber));
  assert.doesNotMatch(collectSqlLiteralText(queries[0]), new RegExp(fullCardNumber));
});

test("preserves an already stored Account Number without querying the Saved row", async () => {
  const record = buildRecord({ accountNumber: "ACC-PERSISTED" });
  const { executor, queries } = createSequenceExecutor<CollectionRepositoryExecutor>([]);

  const hydrated = await hydrateCollectionRecordSourceAccounts(executor, [record]);

  assert.equal(hydrated[0]?.accountNumber, "ACC-PERSISTED");
  assert.equal(hydrated[0], record);
  assert.equal(queries.length, 0);
});

test("fails closed when the linked Saved account does not reproduce the record obligation key", async () => {
  const fullCardNumber = "5555555555554444";
  const record = buildRecord({
    sourceObligationKey: buildAccountObligationKey("ACC-EXPECTED"),
  });
  const { executor } = createSequenceExecutor<CollectionRepositoryExecutor>([{
    rows: [{
      source_import_id: "import-1",
      source_data_row_id: "source-row-1",
      source_json_data: {
        "Account Number": "ACC-DIFFERENT",
        "Card Number": fullCardNumber,
      },
    }],
  }]);

  const hydrated = await hydrateCollectionRecordSourceAccounts(executor, [record]);

  assert.equal(hydrated[0]?.accountNumber, "");
  assert.equal(hydrated[0], record);
  assert.doesNotMatch(JSON.stringify(hydrated), new RegExp(fullCardNumber));
});

test("hydrates a missing masked Card suffix only after governed full-card hash verification", async () => {
  const accountNumber = "ACC-CARD-SUFFIX";
  const fullCardNumber = "5555555555554444";
  const cardHash = hashCollectionSourceIdentifier(fullCardNumber, "card_number");
  assert.ok(cardHash);
  const sourceObligationKey = buildAccountObligationKey(accountNumber);
  const record = buildRecord({
    accountNumber,
    cardNumberLast4: null,
    sourceObligationKey,
  });
  const { executor } = createSequenceExecutor<CollectionRepositoryExecutor>([{
    rows: [{
      source_import_id: "import-1",
      source_data_row_id: "source-row-1",
      source_json_data: {
        "Account Number": accountNumber,
        "Card Number": fullCardNumber,
      },
      source_card_number_hash: cardHash,
      source_card_number_last4: "4444",
      source_obligation_key: sourceObligationKey,
    }],
  }]);

  const hydrated = await hydrateCollectionRecordSourceAccounts(executor, [record]);

  assert.equal(hydrated[0]?.accountNumber, accountNumber);
  assert.equal(hydrated[0]?.cardNumberLast4, "4444");
  assert.equal("cardNumber" in (hydrated[0] || {}), false);
  assert.doesNotMatch(JSON.stringify(hydrated), new RegExp(fullCardNumber));
});

test("keeps a missing Card suffix empty when the governed card hash disagrees", async () => {
  const accountNumber = "ACC-CARD-MISMATCH";
  const sourceObligationKey = buildAccountObligationKey(accountNumber);
  const record = buildRecord({ cardNumberLast4: null, sourceObligationKey });
  const { executor } = createSequenceExecutor<CollectionRepositoryExecutor>([{
    rows: [{
      source_import_id: "import-1",
      source_data_row_id: "source-row-1",
      source_json_data: {
        "Account Number": accountNumber,
        "Card Number": "5555555555554444",
      },
      source_card_number_hash: hashCollectionSourceIdentifier(
        "4111111111111111",
        "card_number",
      ),
      source_card_number_last4: "1111",
      source_obligation_key: sourceObligationKey,
    }],
  }]);

  const hydrated = await hydrateCollectionRecordSourceAccounts(executor, [record]);

  assert.equal(hydrated[0]?.accountNumber, accountNumber);
  assert.equal(hydrated[0]?.cardNumberLast4, null);
});

test("keeps a malformed governed Card suffix out of the response", async () => {
  const accountNumber = "ACC-CARD-MALFORMED-SUFFIX";
  const fullCardNumber = "5555555555554444";
  const cardHash = hashCollectionSourceIdentifier(fullCardNumber, "card_number");
  assert.ok(cardHash);
  const sourceObligationKey = buildAccountObligationKey(accountNumber);
  const record = buildRecord({ cardNumberLast4: null, sourceObligationKey });
  const { executor } = createSequenceExecutor<CollectionRepositoryExecutor>([{
    rows: [{
      source_import_id: "import-1",
      source_data_row_id: "source-row-1",
      source_json_data: {
        "Account Number": accountNumber,
        "Card Number": fullCardNumber,
      },
      source_card_number_hash: cardHash,
      source_card_number_last4: "ABCD",
      source_obligation_key: sourceObligationKey,
    }],
  }]);

  const hydrated = await hydrateCollectionRecordSourceAccounts(executor, [record]);

  assert.equal(hydrated[0]?.accountNumber, accountNumber);
  assert.equal(hydrated[0]?.cardNumberLast4, null);
});

test("hydrates a missing Card suffix for a genuinely Card-only Saved row", async () => {
  const fullCardNumber = "0000123412345678";
  const cardHash = hashCollectionSourceIdentifier(fullCardNumber, "card_number");
  assert.ok(cardHash);
  const sourceObligationKey = `card:${cardHash}`;
  const record = buildRecord({
    cardNumberLast4: null,
    sourceObligationKey,
  });
  const { executor } = createSequenceExecutor<CollectionRepositoryExecutor>([{
    rows: [{
      source_import_id: "import-1",
      source_data_row_id: "source-row-1",
      source_json_data: { "Card Number": fullCardNumber },
      source_card_number_hash: cardHash,
      source_card_number_last4: "5678",
      source_obligation_key: sourceObligationKey,
    }],
  }]);

  const hydrated = await hydrateCollectionRecordSourceAccounts(executor, [record]);

  assert.equal(hydrated[0]?.accountNumber, "");
  assert.equal(hydrated[0]?.cardNumberLast4, "5678");
  assert.doesNotMatch(JSON.stringify(hydrated), new RegExp(fullCardNumber));
});

test("ignores rows outside the exact import and data-row link", async () => {
  const accountNumber = "ACC-0001";
  const record = buildRecord({
    sourceObligationKey: buildAccountObligationKey(accountNumber),
  });
  const { executor } = createSequenceExecutor<CollectionRepositoryExecutor>([{
    rows: [{
      source_import_id: "other-import",
      source_data_row_id: "source-row-1",
      source_json_data: { "Account Number": accountNumber },
    }],
  }]);

  const hydrated = await hydrateCollectionRecordSourceAccounts(executor, [record]);

  assert.equal(hydrated[0]?.accountNumber, "");
  assert.equal(hydrated[0], record);
});

test("bounds Saved-row hydration queries to chunks of 200 links", async () => {
  const buildRows = (start: number, count: number) => Array.from({ length: count }, (_, index) => {
    const sequence = start + index;
    return {
      source_import_id: "import-1",
      source_data_row_id: `source-row-${sequence}`,
      source_json_data: { "Account Number": `ACC-${sequence}` },
    };
  });
  const records = Array.from({ length: 201 }, (_, index) => {
    const sequence = index + 1;
    return buildRecord({
      id: `record-${sequence}`,
      sourceDataRowId: `source-row-${sequence}`,
      sourceObligationKey: buildAccountObligationKey(`ACC-${sequence}`),
    });
  });
  const { executor, queries } = createSequenceExecutor<CollectionRepositoryExecutor>([
    { rows: buildRows(1, 200) },
    { rows: buildRows(201, 1) },
  ]);

  const hydrated = await hydrateCollectionRecordSourceAccounts(executor, records);

  assert.equal(queries.length, 2);
  assert.equal(hydrated.length, 201);
  assert.equal(hydrated[0]?.accountNumber, "ACC-1");
  assert.equal(hydrated[200]?.accountNumber, "ACC-201");
});
