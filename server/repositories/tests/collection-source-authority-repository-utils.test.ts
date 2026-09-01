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

const DUMMY_SNAPSHOT = {
  sourceImportId: "source-dummy-1",
  sourceDataRowId: "row-dummy-1",
  paymentDate: "2026-09-01",
  accountNumber: "ACCOUNT-DUMMY-1",
  cardNumber: "4111111111111111",
  cardNumberLast4: "1234",
  agingBucket: "D3" as const,
  callingDate: "2026-08-12",
  callingWindowEndExclusive: "2026-09-12",
  totalDue: "1000.00",
  billingPrincipalOsp: "5000.00",
  sourceMatchBasis: "account_and_card" as const,
  sourceObligationKey: "account:dummy-hash",
  settlementCycleKey: "2026-08-12:account:dummy-hash",
};

test("source authority recheck locks and verifies the governed indexed snapshot", async () => {
  const statements: string[] = [];
  const executor = {
    execute: async (query: unknown) => {
      const statement = collectSqlText(query);
      statements.push(statement);
      return /SELECT source_row\.source_data_row_id/i.test(statement)
        ? { rows: [{ source_data_row_id: DUMMY_SNAPSHOT.sourceDataRowId }] }
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
      return { rows: [{ source_data_row_id: DUMMY_SNAPSHOT.sourceDataRowId }] };
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
      return { rows: [{ source_data_row_id: cardOnlySnapshot.sourceDataRowId }] };
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

test("source authority recheck fails closed when governed row changes or is disabled", async () => {
  const executor = {
    execute: async () => ({ rows: [] }),
  } as CollectionRepositoryExecutor;

  await assert.rejects(
    () => assertAuthorizedCollectionSourceSnapshot(executor, DUMMY_SNAPSHOT),
    /no longer authorized/i,
  );
});
