import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionRepositoryExecutor } from "../collection-nickname-utils";
import { resolveCollectionRecordCardSearchLinks } from "../collection-record-card-search-utils";
import {
  buildCollectionRecordConditions,
  buildCollectionRecordWhereSql,
} from "../collection-record-query-filter-utils";
import { hashCollectionSourceIdentifier } from "../collection-source-repository-utils";
import {
  collectBoundValues,
  collectSqlLiteralText,
  createSequenceExecutor,
} from "./sql-test-utils";

function sourceCandidate(
  cardNumber: string,
  options: { accountNumber?: string; importId?: string; rowId?: string } = {},
): Record<string, unknown> {
  const accountNumber = options.accountNumber ?? "ACC-EXACT-SOURCE";
  const accountHash = hashCollectionSourceIdentifier(accountNumber, "account_number");
  const cardHash = hashCollectionSourceIdentifier(cardNumber, "card_number");
  const obligationKey = accountHash ? `account:${accountHash}` : `card:${cardHash}`;
  return {
    source_import_id: options.importId ?? "saved-import-a",
    source_data_row_id: options.rowId ?? "saved-row-a",
    record_obligation_key: obligationKey,
    source_json_data: {
      "Customer Name": "Same Synthetic Customer",
      "Account Number": accountNumber,
      "Card Number": cardNumber,
    },
    source_card_number_hash: cardHash,
    source_card_number_last4: cardNumber.replace(/\s+/g, "").slice(-4),
    source_obligation_key: obligationKey,
  };
}

function expectedLink(candidate: Record<string, unknown>) {
  return {
    sourceImportId: candidate.source_import_id,
    sourceDataRowId: candidate.source_data_row_id,
    sourceObligationKey: candidate.record_obligation_key,
  };
}

async function resolveCandidates(search: string, candidates: unknown[]) {
  const { executor, queries } = createSequenceExecutor<CollectionRepositoryExecutor>([
    { rows: candidates },
  ]);
  const links = await resolveCollectionRecordCardSearchLinks(executor, { search });
  return { links, queries };
}

test("Card search keeps a full long identifier and its leading zeroes as text", async () => {
  const card = "000012341234567890123456789012345678";
  const candidate = sourceCandidate(card);
  const { links, queries } = await resolveCandidates(card, [candidate]);

  assert.deepEqual(links, [expectedLink(candidate)]);
  assert.equal(queries.length, 1);
  assert.equal(JSON.stringify(links).includes(card), false);
  assert.equal(collectSqlLiteralText(queries[0]).includes(card), false);
  assert.ok(collectBoundValues(queries[0]).includes(hashCollectionSourceIdentifier(card, "card_number")));
  assert.equal(collectBoundValues(queries[0]).includes(Number(card)), false);
});

test("Card search applies existing whitespace normalization to query and exact Saved value", async () => {
  const candidate = sourceCandidate("0000 1234\t1234 5678");
  const { links } = await resolveCandidates("  00001234 12345678  ", [candidate]);
  assert.deepEqual(links, [expectedLink(candidate)]);
});

test("Card search does not remove significant hyphens or replace its canonical identifier", async () => {
  const candidate = sourceCandidate("0000-1234-1234-5678");
  const preserved = await resolveCandidates("0000-1234-1234-5678", [candidate]);
  const different = await resolveCandidates("0000123412345678", [candidate]);

  assert.deepEqual(preserved.links, [expectedLink(candidate)]);
  assert.deepEqual(different.links, []);
});

test("Card search verifies a historical exact source link after its configuration index was removed", async () => {
  const card = "0000999912345678";
  const candidate = {
    ...sourceCandidate(card),
    source_card_number_hash: null,
    source_card_number_last4: null,
    source_obligation_key: null,
  };
  const { links } = await resolveCandidates(card, [candidate]);
  assert.deepEqual(links, [expectedLink(candidate)]);
});

test("Card-only historical sources reproduce the exact immutable Card obligation", async () => {
  const card = "0000123412345678";
  const candidate = {
    ...sourceCandidate(card, { accountNumber: "" }),
    source_card_number_hash: null,
    source_card_number_last4: null,
    source_obligation_key: null,
  };
  const { links } = await resolveCandidates(card, [candidate]);
  assert.deepEqual(links, [expectedLink(candidate)]);
});

test("Card search rejects a stale governed hash instead of exposing an unverified match", async () => {
  const card = "0000123412345678";
  const candidate = {
    ...sourceCandidate(card),
    source_card_number_hash: hashCollectionSourceIdentifier("9999123412345678", "card_number"),
  };
  const { links } = await resolveCandidates(card, [candidate]);
  assert.deepEqual(links, []);
});

test("Card search rejects changed linked Account identity even when Card and source index agree", async () => {
  const card = "0000123412345678";
  const candidate = {
    ...sourceCandidate(card),
    source_json_data: { "Account Number": "ACC-CHANGED", "Card Number": card },
  };
  const { links } = await resolveCandidates(card, [candidate]);
  assert.deepEqual(links, []);
});

test("historical Card fallback also rejects a changed Account obligation without a source index", async () => {
  const card = "0000123412345678";
  const candidate = {
    ...sourceCandidate(card),
    source_json_data: { "Account Number": "ACC-CHANGED", "Card Number": card },
    source_card_number_hash: null,
    source_card_number_last4: null,
    source_obligation_key: null,
  };
  const { links } = await resolveCandidates(card, [candidate]);
  assert.deepEqual(links, []);
});

test("Card search requires the canonical full value rather than a matching last-four suffix", async () => {
  const card = "0000123412345678";
  const differentCard = sourceCandidate("9999123412345678");
  const missingCard = {
    ...sourceCandidate(card),
    source_json_data: { "Account Number": "ACC-EXACT-SOURCE" },
  };
  const { links } = await resolveCandidates(card, [differentCard, missingCard]);
  assert.deepEqual(links, []);
});

test("Card search rejects a malformed governed suffix and an inconsistent source obligation", async () => {
  const card = "0000123412345678";
  const malformedSuffix = { ...sourceCandidate(card), source_card_number_last4: "ABCD" };
  const mismatchedObligation = {
    ...sourceCandidate(card),
    source_obligation_key: `account:${hashCollectionSourceIdentifier("ACC-OTHER", "account_number")}`,
  };
  const { links } = await resolveCandidates(card, [malformedSuffix, mismatchedObligation]);
  assert.deepEqual(links, []);
});

test("Card search keeps same-customer historical source rows separate across different Cards", async () => {
  const cardA = "0000123412345678";
  const cardB = "9999123412345678";
  const first = sourceCandidate(cardA);
  const second = sourceCandidate(cardB, { importId: "saved-import-b", rowId: "saved-row-b" });
  const sameCardOtherBatch = sourceCandidate(cardA, { importId: "saved-import-c", rowId: "saved-row-c" });
  const { links } = await resolveCandidates(cardA, [first, second, sameCardOtherBatch]);

  assert.deepEqual(links, [expectedLink(first), expectedLink(sameCardOtherBatch)]);
});

test("Card search rejects numeric precision loss and scientific notation from Saved JSON", async () => {
  const card = "9999123412345678";
  const base = sourceCandidate(card);
  const unsafeNumeric = {
    ...base,
    source_json_data: { "Account Number": "ACC-EXACT-SOURCE", "Card Number": Number(card) },
  };
  const scientific = {
    ...base,
    source_json_data: { "Account Number": "ACC-EXACT-SOURCE", "Card Number": "9.999123412345678e15" },
  };
  const { links } = await resolveCandidates(card, [unsafeNumeric, scientific, null, [], "bad-row"]);
  assert.deepEqual(links, []);
});

test("Card candidate verification uses the established first canonical Saved header", async () => {
  const card = "0000123412345678";
  const candidate = {
    ...sourceCandidate(card),
    source_json_data: {
      "Account Number": "ACC-EXACT-SOURCE",
      "Card No": "9999123412345678",
      "Card Number": card,
    },
  };
  const { links } = await resolveCandidates(card, [candidate]);
  assert.deepEqual(links, []);
});

test("Card search skips source lookup for an empty search", async () => {
  const { links, queries } = await resolveCandidates(" \t ", []);
  assert.deepEqual(links, []);
  assert.equal(queries.length, 0);
});

test("Card search rejects an oversized identifier before running a database query", async () => {
  const { links, queries } = await resolveCandidates("1".repeat(257), []);
  assert.deepEqual(links, []);
  assert.equal(queries.length, 0);
});

test("Card search deduplicates source identities without one query per candidate or collection", async () => {
  const card = "0000123412345678";
  const candidate = sourceCandidate(card);
  const { links, queries } = await resolveCandidates(card, Array.from({ length: 201 }, () => candidate));
  assert.deepEqual(links, [expectedLink(candidate)]);
  assert.equal(queries.length, 1);
});

test("Card search does not silently turn a partial identifier into a full Card match", async () => {
  const candidate = sourceCandidate("0000123412345678");
  for (const search of ["5678", "00001234", "12341234"]) {
    const { links } = await resolveCandidates(search, [candidate]);
    assert.deepEqual(links, []);
  }
});

test("Card candidate SQL preserves existing access/date/source/status filters and parameterization", async () => {
  const card = "0000123412345678";
  const owner = "staff') OR TRUE --";
  const nickname = "Collector') OR TRUE --";
  const source = "saved') OR TRUE --";
  const memberId = "11111111-1111-4111-8111-111111111111";
  const { executor, queries } = createSequenceExecutor<CollectionRepositoryExecutor>([{ rows: [] }]);
  await resolveCollectionRecordCardSearchLinks(executor, {
    search: card,
    from: "2026-09-01",
    to: "2026-09-30",
    createdByLogin: owner,
    nicknames: [nickname],
    staffNicknameIds: [memberId],
    sourceImportIds: [source],
    receiptValidationStatus: "matched",
    duplicateOnly: true,
    agingBuckets: ["D3"],
    classifications: ["cp"],
  });

  assert.equal(queries.length, 1);
  const literal = collectSqlLiteralText(queries[0]).replace(/\s+/g, " ");
  const values = collectBoundValues(queries[0]);
  assert.match(literal, /public\.collection_records/i);
  assert.match(literal, /public\.data_rows/i);
  assert.match(literal, /public\.collection_source_rows/i);
  assert.match(literal, /DISTINCT/i);
  assert.match(literal, /payment_date >=/i);
  assert.match(literal, /payment_date <=/i);
  assert.match(literal, /created_by_login =/i);
  assert.match(literal, /lower\(collection_staff_nickname\) IN/i);
  assert.match(literal, /team_member\.is_active = true/i);
  assert.match(literal, /source_import_id = ANY/i);
  assert.match(literal, /receipt_validation_status =/i);
  assert.match(literal, /duplicate_receipt_flag = true/i);
  assert.match(literal, /aging_bucket = ANY/i);
  assert.match(literal, /record\.classification/i);
  assert.match(literal, /source_data\.import_id = target\.source_import_id/i);
  assert.match(literal, /source_data\.id = target\.source_data_row_id/i);
  assert.match(literal, /source_index\.source_import_id = target\.source_import_id/i);
  assert.match(literal, /source_index\.source_data_row_id = target\.source_data_row_id/i);
  assert.match(literal, /source_index\.card_number_hash =/i);
  assert.match(literal, /upper\(translate\(left\(card_field\.value, 256\)/i);
  assert.doesNotMatch(literal, /OR TRUE|Same Synthetic Customer|0000123412345678/);
  assert.doesNotMatch(literal, /customer_name ILIKE|ic_number ILIKE|account_number ILIKE/);
  for (const expected of [owner, nickname.toLowerCase(), source, memberId, "2026-09-01", "2026-09-30"]) {
    assert.ok(values.includes(expected), `Filter should remain a bound SQL parameter: ${expected}`);
  }
});

test("verified Card tuples stay inside search OR while access and date predicates remain outer AND", async () => {
  const card = "0000123412345678";
  const { links } = await resolveCandidates(card, [sourceCandidate(card)]);
  const filters = {
    search: card,
    cardSearchSourceLinks: links,
    from: "2026-09-01",
    to: "2026-09-30",
    createdByLogin: "staff.owner",
    nicknames: ["Collector Alpha"],
  };
  const conditions = buildCollectionRecordConditions(filters);

  assert.equal(conditions.length, 5);
  const searchSql = collectSqlLiteralText(conditions[2]).replace(/\s+/g, " ");
  assert.match(searchSql, /batch ILIKE/);
  assert.match(searchSql, /amount::text ILIKE/);
  assert.match(searchSql, /OR EXISTS \( SELECT 1 FROM jsonb_to_recordset\(/i);
  assert.match(searchSql, /verified_card\."sourceImportId" = record\.source_import_id/);
  assert.match(searchSql, /verified_card\."sourceDataRowId" = record\.source_data_row_id/);
  assert.match(searchSql, /verified_card\."sourceObligationKey" = record\.source_obligation_key/);
  assert.doesNotMatch(searchSql, /created_by_login|payment_date|collection_staff_nickname/);
  assert.match(collectSqlLiteralText(conditions[3]), /created_by_login =/);
  assert.match(collectSqlLiteralText(conditions[4]), /lower\(collection_staff_nickname\) IN/);

  const rowWhere = buildCollectionRecordWhereSql({ ...filters, sortBy: "amount", sortDirection: "desc" });
  const totalWhere = buildCollectionRecordWhereSql(filters);
  assert.equal(collectSqlLiteralText(rowWhere), collectSqlLiteralText(totalWhere));
  assert.deepEqual(collectBoundValues(rowWhere), collectBoundValues(totalWhere));
});

test("verified Card source tuples bind as one JSON parameter rather than interpolated SQL", () => {
  const links = [{
    sourceImportId: "saved-import') OR TRUE --",
    sourceDataRowId: "row\\\" UNION SELECT --",
    sourceObligationKey: "account:opaque-proof",
  }];
  const whereSql = buildCollectionRecordWhereSql({ search: "0000123412345678", cardSearchSourceLinks: links });
  const literal = collectSqlLiteralText(whereSql);
  const values = collectBoundValues(whereSql);

  assert.match(literal, /jsonb_to_recordset\(/);
  assert.doesNotMatch(literal, /OR TRUE|UNION SELECT|opaque-proof/);
  assert.equal(values.filter((value) => value === JSON.stringify(links)).length, 1);
  assert.equal(values.includes(links[0].sourceImportId), false);
});

test("no verified Card links preserves existing search conditions and empty search does not broaden records", () => {
  const normal = buildCollectionRecordWhereSql({ search: "Collector Name" });
  const noCards = buildCollectionRecordWhereSql({ search: "Collector Name", cardSearchSourceLinks: [] });
  assert.equal(collectSqlLiteralText(normal), collectSqlLiteralText(noCards));
  assert.deepEqual(collectBoundValues(normal), collectBoundValues(noCards));

  const noSearch = buildCollectionRecordWhereSql({
    createdByLogin: "staff.owner",
    cardSearchSourceLinks: [{ sourceImportId: "import", sourceDataRowId: "row", sourceObligationKey: "account:proof" }],
  });
  assert.match(collectSqlLiteralText(noSearch), /WHERE created_by_login =/);
  assert.doesNotMatch(collectSqlLiteralText(noSearch), /jsonb_to_recordset|OR/);
});
