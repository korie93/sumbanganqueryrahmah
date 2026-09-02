import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionRepositoryExecutor } from "../collection-nickname-utils";
import { assertAuthorizedCollectionSourceSnapshot } from "../collection-source-authority-repository-utils";
import { hashCollectionSourceIdentifier } from "../collection-source-repository-utils";
import {
  collectBoundValues,
  collectSqlLiteralText,
  collectSqlText,
} from "./sql-test-utils";

const DUMMY_ACCOUNT_NUMBER = "ACCOUNT-DUMMY-1";
const DUMMY_ACCOUNT_HASH = hashCollectionSourceIdentifier(
  DUMMY_ACCOUNT_NUMBER,
  "account_number",
);
if (!DUMMY_ACCOUNT_HASH) throw new Error("Test Account blind index was not generated.");

const DUMMY_SNAPSHOT = {
  sourceImportId: "source-dummy-1",
  sourceDataRowId: "row-dummy-1",
  paymentDate: "2026-09-01",
  accountNumber: DUMMY_ACCOUNT_NUMBER,
  cardNumber: "4111111111111234",
  cardNumberLast4: "1234",
  agingBucket: "D3" as const,
  callingDate: "2026-08-12",
  callingWindowEndExclusive: "2026-09-12",
  totalDue: "1000.00",
  billingPrincipalOsp: "5000.00",
  sourceMatchBasis: "account_and_card" as const,
  sourceObligationKey: `account:${DUMMY_ACCOUNT_HASH}`,
  settlementCycleKey: `2026-08-12:account:${DUMMY_ACCOUNT_HASH}`,
};

function buildAuthorizedSourceRow(input: {
  sourceDataRowId: string;
  accountNumber?: string | null;
  cardNumber?: string | null;
}) {
  const accountNumber = String(input.accountNumber || "").trim() || null;
  const cardNumber = String(input.cardNumber || "").trim() || null;
  return {
    source_data_row_id: input.sourceDataRowId,
    account_number_hash: hashCollectionSourceIdentifier(accountNumber, "account_number"),
    card_number_hash: hashCollectionSourceIdentifier(cardNumber, "card_number"),
    card_number_last4: cardNumber ? cardNumber.slice(-4) : null,
    json_data: {
      ...(accountNumber ? { "Account Number": accountNumber } : {}),
      ...(cardNumber ? { "Card Number": cardNumber } : {}),
    },
  };
}

test("source authority recheck locks and verifies the governed indexed snapshot", async () => {
  const statements: string[] = [];
  const executor = {
    execute: async (query: unknown) => {
      const statement = collectSqlText(query);
      statements.push(statement);
      return /SELECT source_row\.source_data_row_id/i.test(statement)
        ? { rows: [buildAuthorizedSourceRow(DUMMY_SNAPSHOT)] }
        : { rows: [] };
    },
  } as CollectionRepositoryExecutor;

  await assertAuthorizedCollectionSourceSnapshot(executor, DUMMY_SNAPSHOT);

  const authorityQuery = statements.find((statement) => /collection_source_rows/i.test(statement)) || "";
  assert.match(authorityQuery, /JOIN public\.collection_source_configs/i);
  assert.match(authorityQuery, /config\.enabled = true/i);
  assert.match(authorityQuery, /config\.compatibility_status = 'compatible'/i);
  assert.match(authorityQuery, /BETWEEN config\.valid_from AND config\.valid_to/i);
  assert.match(authorityQuery, /source_row\.total_due/i);
  assert.match(authorityQuery, /source_row\.billing_principal_osp/i);
  assert.match(authorityQuery, /FOR SHARE OF source_row, config, imp, data_row/i);
});

test("source authority recheck requires both full-card and account HMACs for account-and-card", async () => {
  const queries: unknown[] = [];
  const emitted: string[] = [];
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const executor = {
    execute: async (query: unknown) => {
      queries.push(query);
      return { rows: [buildAuthorizedSourceRow(DUMMY_SNAPSHOT)] };
    },
  } as CollectionRepositoryExecutor;
  console.error = (...values: unknown[]) => emitted.push(values.map(String).join(" "));
  console.warn = (...values: unknown[]) => emitted.push(values.map(String).join(" "));

  try {
    await assertAuthorizedCollectionSourceSnapshot(executor, DUMMY_SNAPSHOT);

    assert.equal(queries.length, 1);
    const authoritySql = collectSqlText(queries[0]).replace(/\s+/g, " ");
    assert.match(authoritySql, /source_row\.account_number_hash\s*=/i);
    assert.match(authoritySql, /source_row\.card_number_hash\s*=/i);

    const accountHash = hashCollectionSourceIdentifier(
      DUMMY_SNAPSHOT.accountNumber,
      "account_number",
    );
    const cardHash = hashCollectionSourceIdentifier(DUMMY_SNAPSHOT.cardNumber, "card_number");
    assert.ok(accountHash);
    assert.ok(cardHash);
    const boundValues = collectBoundValues(queries[0]);
    assert.ok(boundValues.includes(accountHash));
    assert.ok(boundValues.includes(cardHash));
    assert.equal(boundValues.includes(DUMMY_SNAPSHOT.accountNumber), false);
    assert.equal(boundValues.includes(DUMMY_SNAPSHOT.cardNumber), false);
    assert.doesNotMatch(
      collectSqlLiteralText(queries[0]),
      new RegExp(DUMMY_SNAPSHOT.cardNumber, "i"),
    );
    assert.doesNotMatch(authoritySql, /\b(?:INSERT|UPDATE)\b/i);
    assert.equal(emitted.some((entry) => entry.includes(DUMMY_SNAPSHOT.cardNumber)), false);
  } finally {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  }
});

test("source authority recheck permits card-only authority using the full-card HMAC", async () => {
  const cardOnlySnapshot = {
    ...DUMMY_SNAPSHOT,
    accountNumber: "",
    cardNumber: "5555555555554444",
    cardNumberLast4: "4444",
    sourceMatchBasis: "card_number" as const,
    sourceObligationKey: `card:${hashCollectionSourceIdentifier("5555555555554444", "card_number")}`,
    settlementCycleKey: `2026-08-12:card:${hashCollectionSourceIdentifier("5555555555554444", "card_number")}`,
  };
  const queries: unknown[] = [];
  const executor = {
    execute: async (query: unknown) => {
      queries.push(query);
      return { rows: [buildAuthorizedSourceRow(cardOnlySnapshot)] };
    },
  } as CollectionRepositoryExecutor;

  await assertAuthorizedCollectionSourceSnapshot(executor, cardOnlySnapshot);

  const authoritySql = collectSqlText(queries[0]).replace(/\s+/g, " ");
  assert.match(authoritySql, /source_row\.card_number_hash\s*=/i);
  const boundValues = collectBoundValues(queries[0]);
  assert.ok(boundValues.includes(
    hashCollectionSourceIdentifier(cardOnlySnapshot.cardNumber, "card_number"),
  ));
  assert.equal(boundValues.includes(cardOnlySnapshot.cardNumber), false);
  assert.doesNotMatch(
    collectSqlLiteralText(queries[0]),
    new RegExp(cardOnlySnapshot.cardNumber, "i"),
  );
});

test("source authority returns only a hash-verified Account and masked Card suffix", async () => {
  const accountNumber = "000012345678";
  const cardNumber = "5555555555554444";
  const accountHash = hashCollectionSourceIdentifier(accountNumber, "account_number");
  const cardHash = hashCollectionSourceIdentifier(cardNumber, "card_number");
  assert.ok(accountHash);
  assert.ok(cardHash);
  const snapshot = {
    ...DUMMY_SNAPSHOT,
    accountNumber: "",
    cardNumber,
    cardNumberLast4: "4444",
    sourceMatchBasis: "card_number" as const,
    sourceObligationKey: `account:${accountHash}`,
    settlementCycleKey: `2026-08-12:account:${accountHash}`,
  };
  const executor = {
    execute: async () => ({
      rows: [{
        source_data_row_id: snapshot.sourceDataRowId,
        account_number_hash: accountHash,
        card_number_hash: cardHash,
        card_number_last4: "4444",
        json_data: {
          "Account Number": accountNumber,
          "Card Number": cardNumber,
        },
      }],
    }),
  } as CollectionRepositoryExecutor;

  const identity = await assertAuthorizedCollectionSourceSnapshot(executor, snapshot);

  assert.deepEqual(identity, { accountNumber, cardNumberLast4: "4444" });
  assert.equal(Object.prototype.hasOwnProperty.call(identity, "cardNumber"), false);
});

test("source authority rejects a governed Card suffix that disagrees with the Saved Card", async () => {
  const cardNumber = "5555555555554444";
  const executor = {
    execute: async () => ({
      rows: [{
        ...buildAuthorizedSourceRow({
          sourceDataRowId: DUMMY_SNAPSHOT.sourceDataRowId,
          accountNumber: DUMMY_SNAPSHOT.accountNumber,
          cardNumber,
        }),
        card_number_last4: "1111",
      }],
    }),
  } as CollectionRepositoryExecutor;

  await assert.rejects(
    () => assertAuthorizedCollectionSourceSnapshot(executor, {
      ...DUMMY_SNAPSHOT,
      cardNumber,
      cardNumberLast4: "1111",
    }),
    /no longer authorized/i,
  );
});

test("source authority rejects a Saved identifier that no longer agrees with its blind index", async () => {
  const cardNumber = "5555555555554444";
  const cardHash = hashCollectionSourceIdentifier(cardNumber, "card_number");
  assert.ok(cardHash);
  const executor = {
    execute: async () => ({
      rows: [{
        source_data_row_id: DUMMY_SNAPSHOT.sourceDataRowId,
        account_number_hash: hashCollectionSourceIdentifier("ACCOUNT-ORIGINAL", "account_number"),
        card_number_hash: cardHash,
        json_data: {
          "Account Number": "ACCOUNT-MODIFIED",
          "Card Number": cardNumber,
        },
      }],
    }),
  } as CollectionRepositoryExecutor;

  await assert.rejects(
    () => assertAuthorizedCollectionSourceSnapshot(executor, DUMMY_SNAPSHOT),
    /no longer authorized/i,
  );
});

test("source authority recheck fails closed when governed row changes or is disabled", async () => {
  const executor = {
    execute: async () => ({ rows: [] }),
  } as CollectionRepositoryExecutor;

  await assert.rejects(
    () => assertAuthorizedCollectionSourceSnapshot(executor, DUMMY_SNAPSHOT),
    /no longer authorized/i,
  );
});
