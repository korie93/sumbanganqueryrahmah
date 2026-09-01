import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../../db-postgres";
import {
  findEligibleCollectionSourceMatches,
  hashCollectionSourceIdentifier,
} from "../collection-source-repository-utils";
import {
  collectBoundValues,
  collectSqlLiteralText,
  collectSqlText,
} from "./sql-test-utils";

test("Collection source blind indexes are deterministic and domain-separated", () => {
  const accountHash = hashCollectionSourceIdentifier(" 00001234 ", "account_number");
  const repeatedAccountHash = hashCollectionSourceIdentifier("00001234", "account_number");
  const cardHash = hashCollectionSourceIdentifier("00001234", "card_number");

  assert.match(accountHash || "", /^[a-f0-9]{64}$/);
  assert.equal(accountHash, repeatedAccountHash);
  assert.notEqual(accountHash, cardHash);
  assert.doesNotMatch(accountHash || "", /00001234/);
});

test("Account and Card supplied together must match the same governed master row", async () => {
  const accountNumber = "ACCOUNT-0001";
  const cardNumber = "4111111111111111";
  const queries: unknown[] = [];
  let callIndex = 0;
  const originalExecute = db.execute;
  (db as unknown as { execute: typeof db.execute }).execute = (async (query) => {
    queries.push(query);
    callIndex += 1;
    return callIndex === 1 ? { rows: [{ count: 1 }] } : { rows: [] };
  }) as typeof db.execute;

  try {
    const result = await findEligibleCollectionSourceMatches({
      paymentDate: "2026-09-01",
      accountNumber,
      cardNumber,
    });

    assert.equal(result.eligibleSourceCount, 1);
    assert.deepEqual(result.matches, []);
    assert.equal(queries.length, 2);

    const matchingSql = collectSqlText(queries[1]).replace(/\s+/g, " ");
    assert.match(
      matchingSql,
      /source_row\.account_number_hash\s*=\s*[a-f0-9]{64}\s+AND source_row\.card_number_hash\s*=\s*[a-f0-9]{64}/i,
    );
    assert.doesNotMatch(
      matchingSql,
      /source_row\.account_number_hash\s*=\s*[a-f0-9]{64}\s+OR source_row\.card_number_hash\s*=/i,
    );

    const literalSql = collectSqlLiteralText(queries[1]);
    assert.doesNotMatch(literalSql, new RegExp(accountNumber, "i"));
    assert.doesNotMatch(literalSql, new RegExp(cardNumber, "i"));

    const boundValues = collectBoundValues(queries[1]);
    assert.ok(boundValues.includes(hashCollectionSourceIdentifier(accountNumber, "account_number")));
    assert.ok(boundValues.includes(hashCollectionSourceIdentifier(cardNumber, "card_number")));
    assert.equal(boundValues.includes(accountNumber), false);
    assert.equal(boundValues.includes(cardNumber), false);
  } finally {
    (db as unknown as { execute: typeof db.execute }).execute = originalExecute;
  }
});

test("Card-only matching accepts an exact full-card blind-index match without exposing the card", async () => {
  const cardNumber = "5555555555554444";
  const cardHash = hashCollectionSourceIdentifier(cardNumber, "card_number");
  assert.ok(cardHash);

  const queries: unknown[] = [];
  let callIndex = 0;
  const originalExecute = db.execute;
  (db as unknown as { execute: typeof db.execute }).execute = (async (query) => {
    queries.push(query);
    callIndex += 1;
    if (callIndex === 1) return { rows: [{ count: 1 }] };
    return {
      rows: [{
        source_import_id: "source-card-only",
        source_data_row_id: "row-card-only",
        source_import_name: "Card-only source",
        source_filename: "card-only.xlsb",
        canonical_obligation_key: `card:${cardHash}`,
        cycle_key: "2026-09",
        card_number_last4: "4444",
        total_due: "1000.00",
        billing_principal_osp: "800.00",
        total_osb: "1500.00",
        aging_bucket: "D4",
        calling_date: "2026-08-12",
        valid_from: "2026-09-01",
        updated_at: new Date("2026-09-01T00:00:00.000Z"),
        match_basis: "card_number",
      }],
    };
  }) as typeof db.execute;

  try {
    const result = await findEligibleCollectionSourceMatches({
      paymentDate: "2026-09-01",
      cardNumber,
    });

    assert.equal(result.eligibleSourceCount, 1);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0]?.matchBasis, "card_number");
    assert.equal(result.matches[0]?.sourceObligationKey, `card:${cardHash}`);
    assert.equal(result.matches[0]?.cardNumberLast4, "4444");

    const matchingSql = collectSqlText(queries[1]).replace(/\s+/g, " ");
    assert.match(matchingSql, /AND \(source_row\.card_number_hash\s*=/i);
    assert.doesNotMatch(
      matchingSql,
      /AND \(source_row\.account_number_hash\s*=.*(?:AND|OR)\s+source_row\.card_number_hash/i,
    );
    assert.doesNotMatch(collectSqlLiteralText(queries[1]), new RegExp(cardNumber, "i"));

    const boundValues = collectBoundValues(queries[1]);
    assert.ok(boundValues.includes(cardHash));
    assert.equal(boundValues.includes(cardNumber), false);
  } finally {
    (db as unknown as { execute: typeof db.execute }).execute = originalExecute;
  }
});
