import assert from "node:assert/strict";
import test from "node:test";
import { dbRead } from "../../db-postgres";
import { SearchRepository } from "../search.repository";
import {
  collectBoundValues,
  collectSqlLiteralText,
  collectSqlText,
} from "./sql-test-utils";

const candidate = (rowId: string, sourceImportId: string) => ({
  rowId,
  sourceImportId,
  icHash: null,
  icValue: null,
  phoneHash: null,
  phoneValue: null,
  accountHashes: [],
  accountValues: [],
});

function historyRow(id: number, total: number) {
  return {
    history_item_count: total,
    record_count: total,
    active_record_count: total,
    historical_record_count: 0,
    pool_contribution_count: 0,
    summary_collection_amount: `${total}.00`,
    summary_pool_amount: "0.00",
    summary_total_covered_amount: `${total}.00`,
    summary_effective_status: "cp",
    item_id: `record-${id.toString().padStart(2, "0")}`,
    item_kind: "collection",
    is_historical: false,
    payment_date: `2026-09-${Math.min(28, id).toString().padStart(2, "0")}`,
    created_at: new Date(`2026-09-${Math.min(28, id).toString().padStart(2, "0")}T08:00:00.000Z`),
    amount: "1.00",
    classification_source: "automatic",
    automatic_classification: "cp",
    effective_status: "cp",
    settlement_date: null,
    collection_staff_nickname: "collector.alpha",
    created_by_login: "collector.login",
    source_import_name: null,
    source_filename: null,
    purged_at: null,
    purged_by: null,
    manual_reason: null,
    manual_note: null,
    manual_reference: null,
  };
}

test("General Search returns all 27 history rows across stable 10/10/7 pages", async () => {
  const repository = new SearchRepository();
  const mutableDb = dbRead as unknown as { execute: typeof dbRead.execute };
  const originalExecute = mutableDb.execute;
  const capturedQueries: unknown[] = [];
  const pageRanges = [[27, 18], [17, 8], [7, 1]] as const;

  mutableDb.execute = (async (query: unknown) => {
    capturedQueries.push(query);
    const [from, to] = pageRanges[capturedQueries.length - 1] ?? [0, 1];
    return {
      rows: Array.from({ length: Math.max(0, from - to + 1) }, (_, index) =>
        historyRow(from - index, 27)),
    };
  }) as typeof dbRead.execute;

  try {
    const pages = [];
    for (const page of [1, 2, 3]) {
      pages.push(await repository.findCollectionHistoryForRow({
        candidate: candidate("row-a", "import-a"),
        sourceObligationKey: "account:exact-a",
        viewerScope: { kind: "all" },
        includeManualAuditDetails: false,
        includeSourceDetails: false,
        page,
        pageSize: 10,
      }));
    }

    assert.deepEqual(pages.map((page) => page.items.length), [10, 10, 7]);
    assert.deepEqual(pages.map((page) => page.total), [27, 27, 27]);
    assert.deepEqual(pages.map((page) => page.totalPages), [3, 3, 3]);
    assert.deepEqual(pages.map((page) => page.hasNextPage), [true, true, false]);
    assert.deepEqual(pages.map((page) => page.hasPreviousPage), [false, true, true]);
    const ids = pages.flatMap((page) => page.items.map((item) => item.id));
    assert.equal(ids.length, 27);
    assert.equal(new Set(ids).size, 27);
    assert.deepEqual(ids, Array.from({ length: 27 }, (_, index) =>
      `record-${(27 - index).toString().padStart(2, "0")}`));

    assert.equal(capturedQueries.length, 3, "one bounded set-based query per requested page");
    for (const [index, query] of capturedQueries.entries()) {
      const sqlText = collectSqlText(query);
      assert.match(sqlText, /ORDER BY payment_date DESC, created_at DESC, item_id DESC/i);
      assert.match(
        sqlText,
        /record\.source_obligation_key\s*=/i,
        "purged rows must follow the canonical account across source replacements",
      );
      assert.match(sqlText, /LIMIT/i);
      assert.match(sqlText, /OFFSET/i);
      const values = collectBoundValues(query);
      assert.ok(values.includes(10));
      assert.ok(values.includes(index * 10));
    }
  } finally {
    mutableDb.execute = originalExecute;
  }
});

test("same customer name cannot join A001 and A002 collection histories", async () => {
  const repository = new SearchRepository();
  const mutableDb = dbRead as unknown as { execute: typeof dbRead.execute };
  const originalExecute = mutableDb.execute;
  const capturedQueries: unknown[] = [];

  mutableDb.execute = (async (query: unknown) => {
    capturedQueries.push(query);
    const values = collectBoundValues(query);
    const isA001 = values.includes("account:exact-a001");
    const total = isA001 ? 3 : 2;
    return {
      rows: Array.from({ length: total }, (_, index) => historyRow(total - index, total)),
    };
  }) as typeof dbRead.execute;

  try {
    const a001 = await repository.findCollectionHistoryForRow({
      candidate: candidate("row-a001", "import-september"),
      sourceObligationKey: "account:exact-a001",
      viewerScope: { kind: "all" },
      includeManualAuditDetails: false,
      includeSourceDetails: false,
      page: 1,
      pageSize: 10,
    });
    const a002 = await repository.findCollectionHistoryForRow({
      candidate: candidate("row-a002", "import-september"),
      sourceObligationKey: "account:exact-a002",
      viewerScope: { kind: "all" },
      includeManualAuditDetails: false,
      includeSourceDetails: false,
      page: 1,
      pageSize: 10,
    });

    assert.equal(a001.summary.recordCount, 3);
    assert.equal(a001.items.length, 3);
    assert.equal(a002.summary.recordCount, 2);
    assert.equal(a002.items.length, 2);
    for (const query of capturedQueries) {
      assert.doesNotMatch(
        collectSqlText(query),
        /customer_name/i,
        "descriptive names must never be a history identity predicate",
      );
    }
    assert.ok(collectBoundValues(capturedQueries[0]).includes("account:exact-a001"));
    assert.ok(!collectBoundValues(capturedQueries[0]).includes("account:exact-a002"));
    assert.ok(collectBoundValues(capturedQueries[1]).includes("account:exact-a002"));
    assert.ok(!collectBoundValues(capturedQueries[1]).includes("account:exact-a001"));
  } finally {
    mutableDb.execute = originalExecute;
  }
});

test("General Search history identity and scope values remain SQL parameters", async () => {
  const repository = new SearchRepository();
  const mutableDb = dbRead as unknown as { execute: typeof dbRead.execute };
  const originalExecute = mutableDb.execute;
  let capturedQuery: unknown;
  const injection = "account:x') OR true; DROP TABLE collection_records; --";

  mutableDb.execute = (async (query: unknown) => {
    capturedQuery = query;
    return { rows: [] };
  }) as unknown as typeof dbRead.execute;

  try {
    await repository.findCollectionHistoryForRow({
      candidate: candidate("row-injection", "import-injection"),
      sourceObligationKey: injection,
      viewerScope: { kind: "nicknames", nicknames: ["collector') OR true --"] },
      includeManualAuditDetails: false,
      includeSourceDetails: false,
      page: 1,
      pageSize: 10,
    });

    assert.ok(capturedQuery);
    assert.doesNotMatch(collectSqlLiteralText(capturedQuery), /DROP TABLE|OR true/i);
    const values = collectBoundValues(capturedQuery);
    assert.ok(values.includes(injection));
    assert.ok(values.includes("collector') or true --"));
  } finally {
    mutableDb.execute = originalExecute;
  }
});
