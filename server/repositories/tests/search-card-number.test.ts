import assert from "node:assert/strict";
import test from "node:test";
import { dbRead } from "../../db-postgres";
import { logger } from "../../lib/logger";
import { hashCollectionSourceIdentifier } from "../collection-source-repository-utils";
import { SearchRepository } from "../search.repository";
import type { SearchCollectionStatusCandidate } from "../search-repository-types";
import { collectBoundValues, collectSqlText } from "./sql-test-utils";

function candidate(id = "searched-row"): SearchCollectionStatusCandidate {
  return { rowId: id, sourceImportId: "searched-import", icHash: null, icValue: null,
    phoneHash: null, phoneValue: null, accountHashes: [], accountValues: ["ACC-SAME"] };
}

function source(rowId: string, card: string) {
  const obligation = `account:${hashCollectionSourceIdentifier("ACC-SAME", "account_number")}`;
  return {
    source_import_id: "linked-import", source_data_row_id: rowId,
    source_obligation_key: obligation,
    source_json_data: { "Account No": "ACC-SAME", "Card No": card },
    source_card_number_hash: hashCollectionSourceIdentifier(card, "card_number"),
    source_card_number_last4: card.slice(-4),
  };
}

function record(rowId: string, card: string) {
  const linked = source(rowId, card);
  return {
    row_id: `searched-${rowId}`, record_count: 3, is_historical: false,
    source_import_id: linked.source_import_id, source_data_row_id: rowId,
    source_obligation_key: linked.source_obligation_key, card_number_last4: card.slice(-4),
    account_number: "ACC-SAME", account_number_encrypted: null,
    payment_date: "2026-09-01", created_at: "2026-09-01T01:00:00.000Z",
    amount: "10.00", match_basis: "identifier_only",
  };
}

async function withRows<T>(rows: unknown[], sources: unknown[] | Error, run: (queries: unknown[]) => Promise<T>) {
  const originalExecute = dbRead.execute;
  const queries: unknown[] = [];
  dbRead.execute = (async (query: unknown) => {
    queries.push(query);
    if (queries.length > 1 && sources instanceof Error) throw sources;
    return { rows: queries.length === 1 ? rows : sources };
  }) as typeof dbRead.execute;
  try { return await run(queries); } finally { dbRead.execute = originalExecute; }
}

test("search status Card belongs to each selected Collection source, not the searched row or another card", async () => {
  const cards = ["0000123412341111", "0000123412342222"];
  await withRows(cards.map((card, i) => record(`linked-${i}`, card)),
    cards.map((card, i) => source(`linked-${i}`, card)), async (queries) => {
      const matches = await new SearchRepository().findCollectionStatusesForRows(
        cards.map((_, i) => candidate(`searched-linked-${i}`)), { kind: "all" },
      );
      assert.deepEqual(matches.map((row) => row.latestCardNumber), cards);
      assert.deepEqual(matches.map((row) => row.latestAccountNumber), ["ACC-SAME", "ACC-SAME"]);
      assert.deepEqual(matches.map((row) => row.recordCount), [3, 3]);
      assert.deepEqual(matches.map((row) => row.rowId), ["searched-linked-0", "searched-linked-1"]);
      assert.equal(queries.length, 2, "one status query plus one bounded batch, never per record");
      assert.match(collectSqlText(queries[0]), /record\.payment_date DESC/);
      const values = collectBoundValues(queries[1]);
      assert.ok(values.includes("linked-import"));
      assert.ok(values.includes("linked-0"));
      assert.ok(values.includes("linked-1"));
      assert.equal(values.includes("searched-import"), false);
    });
});

test("optional search Card hydration failures preserve Account, payment and history without logging PII", async (t) => {
  const warnings: unknown[][] = [];
  t.mock.method(logger, "warn", (...args: unknown[]) => { warnings.push(args); });
  const card = "0000123412341111";
  const hydrationError = new Error(`sensitive-source-row ACC-SAME ${card}`);
  const selectedRecord = record("selected-source", card);
  await withRows([selectedRecord], hydrationError, async (queries) => {
    const matches = await new SearchRepository().findCollectionStatusesForRows(
      [candidate()], { kind: "all" },
    );
    assert.equal(matches.length, 1);
    assert.equal(matches[0].latestCardNumber, null);
    assert.equal(matches[0].latestAccountNumber, "ACC-SAME");
    assert.equal(matches[0].recordCount, 3);
    assert.equal(matches[0].latestAmount, "10.00");
    assert.equal(matches[0].latestPaymentDate, "2026-09-01");
    assert.equal(queries.length, 2);
  });
  await withRows([{ ...selectedRecord, item_id: "payment-1", item_kind: "collection",
    history_item_count: 1, record_count: 1, active_record_count: 1,
    historical_record_count: 0, pool_contribution_count: 0,
    summary_collection_amount: "10.00", summary_pool_amount: "0.00",
    summary_total_covered_amount: "10.00", summary_effective_status: "cp",
  }], hydrationError, async (queries) => {
    const page = await new SearchRepository().findCollectionHistoryForRow({
      candidate: candidate(), sourceObligationKey: selectedRecord.source_obligation_key,
      viewerScope: { kind: "all" }, includeManualAuditDetails: false,
      includeSourceDetails: false, page: 1, pageSize: 10,
    });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].id, "payment-1");
    assert.equal(page.items[0].cardNumber, null);
    assert.equal(page.items[0].amount, "10.00");
    assert.equal(page.items[0].paymentDate, "2026-09-01");
    assert.equal(page.summary.collectionAmount, "10.00");
    assert.equal(page.total, 1);
    assert.equal(page.totalPages, 1);
    assert.equal(queries.length, 2);
  });
  assert.deepEqual(warnings, Array.from({ length: 2 }, () => [
    "General Search Card display enrichment unavailable",
    { operation: "resolveSearchCollectionCards", reason: "SOURCE_HYDRATION_UNAVAILABLE" },
  ]));
  assert.equal(JSON.stringify(warnings).includes(card), false);
  assert.equal(JSON.stringify(warnings).includes("ACC-SAME"), false);
  assert.equal(JSON.stringify(warnings).includes("sensitive-source-row"), false);
});

test("verified Unicode Card expansion stays intact for status and per-item history", async () => {
  const card = "\u00df".repeat(252) + "1234";
  const normalizedCard = card.toUpperCase();
  assert.equal(card.length, 256);
  assert.equal(normalizedCard.length, 508);
  const selectedRecord = record("unicode-source", card);
  await withRows([selectedRecord], [source("unicode-source", card)], async () => {
    const matches = await new SearchRepository().findCollectionStatusesForRows(
      [candidate()], { kind: "all" },
    );
    assert.equal(matches[0].latestCardNumber, normalizedCard);
  });
  await withRows([{ ...selectedRecord, item_id: "unicode-payment", item_kind: "collection" }],
    [source("unicode-source", card)], async () => {
      const page = await new SearchRepository().findCollectionHistoryForRow({
        candidate: candidate(), sourceObligationKey: selectedRecord.source_obligation_key,
        viewerScope: { kind: "all" }, includeManualAuditDetails: false,
        includeSourceDetails: false, page: 1, pageSize: 10,
      });
      assert.equal(page.items[0].cardNumber, normalizedCard);
    });
});

test("search Card uses existing fail-closed source policy for missing, changed and retired configurations", async () => {
  const card = "0000123412341111";
  const rows = ["missing", "tampered", "retired", "wrong-obligation", "legacy"]
    .map((id) => record(id, card));
  rows[4].source_obligation_key = "";
  const tampered = { ...source("tampered", card), source_card_number_hash: "different" };
  const retired = { ...source("retired", card), source_card_number_hash: null,
    source_card_number_last4: null, source_obligation_key: null };
  const wrong = { ...source("wrong-obligation", card), source_json_data: {
    "Account No": "OTHER-ACCOUNT", "Card No": card,
  } };
  await withRows(rows, [tampered, retired, wrong, source("legacy", card)], async () => {
    const matches = await new SearchRepository().findCollectionStatusesForRows(
      rows.map((row) => candidate(row.row_id)), { kind: "all" },
    );
    assert.deepEqual(matches.map((row) => row.latestCardNumber), [null, null, card, null, null]);
    assert.deepEqual(matches.map((row) => row.latestAccountNumber), rows.map(() => "ACC-SAME"));
  });
});

test("search Card does not query data when Collection scope is none", async () => {
  await withRows([], [], async (queries) => {
    assert.deepEqual(await new SearchRepository().findCollectionStatusesForRows(
      [candidate()], { kind: "none" },
    ), []);
    assert.equal(queries.length, 0);
  });
});

test("search Card hydration remains one bounded exact-link batch at the 200-candidate limit", async () => {
  const cards = Array.from({ length: 200 }, (_, index) => `000012341234${String(index).padStart(4, "0")}`);
  await withRows(cards.map((card, i) => record(`bounded-${i}`, card)),
    cards.map((card, i) => source(`bounded-${i}`, card)), async (queries) => {
      const matches = await new SearchRepository().findCollectionStatusesForRows(
        [...cards.map((_, i) => candidate(`searched-bounded-${i}`)), candidate("excluded-201")],
        { kind: "all" },
      );
      assert.deepEqual(matches.map((row) => row.latestCardNumber), cards);
      assert.equal(queries.length, 2);
      const candidateJson = collectBoundValues(queries[0]).find((value) =>
        typeof value === "string" && value.startsWith('[{"row_id"'));
      assert.equal(typeof candidateJson, "string");
      assert.equal(JSON.parse(String(candidateJson)).length, 200);
      assert.equal(String(candidateJson).includes("excluded-201"), false);
      assert.equal(collectBoundValues(queries[1]).length, 400, "two exact-link parameters per selected record");
      const hydrationSql = collectSqlText(queries[1]);
      assert.match(hydrationSql, /source_data\.import_id = target\.source_import_id/);
      assert.match(hydrationSql, /source_data\.id = target\.source_data_row_id/);
    });
});

test("search Card stays null for absent or malformed Card values without changing historical Account", async () => {
  const card = "0000123412341111";
  const rows = ["absent", "object", "empty"].map((id) => ({ ...record(id, card),
    is_historical: true, account_number: null }));
  const sources = rows.map((row, i) => ({ ...source(row.source_data_row_id, card),
    source_json_data: { "Account No": "ACC-SAME", "Card No": [undefined, { card }, ""][i] },
  }));
  await withRows(rows, sources, async () => {
    const matches = await new SearchRepository().findCollectionStatusesForRows(
      rows.map((row) => candidate(row.row_id)), { kind: "all" },
    );
    assert.deepEqual(matches.map((row) => row.latestCardNumber), [null, null, null]);
    assert.deepEqual(matches.map((row) => row.latestAccountNumber), [null, null, null]);
    assert.deepEqual(matches.map((row) => row.isHistorical), [true, true, true]);
  });
});

test("history Cards preserve each payment, POOL and purged record association and unchanged pagination", async () => {
  const cards = ["0000123412341111", "0000123412342222", "0000123412343333"];
  const rows = [...cards, "0000123412344444"].map((card, i) => ({
    ...record(`history-${i}`, card), item_id: `item-${i}`, item_kind: i === 1 ? "pool" : "collection",
    is_historical: i >= 2, history_item_count: 27, record_count: 25, active_record_count: 20,
    historical_record_count: 5, pool_contribution_count: 2,
    summary_collection_amount: "250.00", summary_pool_amount: "50.00",
    summary_total_covered_amount: "300.00", summary_effective_status: "cp",
    classification_source: "automatic", automatic_classification: "cp", effective_status: "cp",
  }));
  await withRows(rows, cards.map((card, i) => source(`history-${i}`, card)), async (queries) => {
    const page = await new SearchRepository().findCollectionHistoryForRow({ candidate: candidate(),
      sourceObligationKey: rows[0].source_obligation_key, viewerScope: { kind: "all" },
      includeManualAuditDetails: false, includeSourceDetails: false, page: 2, pageSize: 4 });
    assert.deepEqual(page.items.map((row) => row.cardNumber), [...cards, null]);
    assert.deepEqual(page.items.map((row) => row.id), ["item-0", "item-1", "item-2", "item-3"]);
    assert.deepEqual(page.items.map((row) => row.kind), ["collection", "pool", "collection", "collection"]);
    assert.deepEqual(page.items.map((row) => row.amount), rows.map(() => "10.00"));
    assert.deepEqual(page.summary, { recordCount: 25, activeRecordCount: 20, historicalRecordCount: 5,
      poolContributionCount: 2, collectionAmount: "250.00", poolAmount: "50.00",
      totalCoveredAmount: "300.00", effectiveStatus: "cp" });
    assert.deepEqual([page.page, page.pageSize, page.total, page.totalPages, page.hasNextPage,
      page.hasPreviousPage], [2, 4, 27, 7, true, true]);
    assert.equal(queries.length, 2);
    assert.match(collectSqlText(queries[0]), /ORDER BY payment_date DESC, created_at DESC, item_id DESC/);
    assert.ok(collectBoundValues(queries[0]).includes(4));
    assert.ok(collectBoundValues(queries[1]).includes("history-2"));
    assert.equal(JSON.stringify(page).includes("source_obligation_key"), false);
    assert.equal(JSON.stringify(page).includes("source_json_data"), false);
  });
});
