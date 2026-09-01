import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../../db-postgres";
import { getCollectionBillingPrincipalReport } from "../collection-source-repository-utils";
import {
  collectBoundValues,
  collectSqlLiteralText,
  collectSqlText,
} from "./sql-test-utils";

test("Billing Principal OSP report uses canonical Abort CP events and parameterized filters", async () => {
  const sourceId = "source-a'); DROP TABLE collection_records; --";
  const nickname = "Agent%_O'Hara";
  const createdByLogin = "Admin'); SELECT pg_sleep(10); --";
  const from = "2026-09-01";
  const to = "2026-09-30";
  const queries: unknown[] = [];
  const responses = [
    {
      rows: [
        { aging_bucket: "D3", amount: "1000.00", account_count: 2 },
        { aging_bucket: "D4", amount: "500.00", account_count: 1 },
      ],
    },
    {
      rows: [
        { aging_bucket: "D3", amount: "250.00", account_count: 1 },
      ],
    },
    {
      rows: [
        {
          aging_bucket: "D3",
          total_osp_baseline: null,
          target_percentage: "20.0000",
        },
      ],
    },
  ];
  let responseIndex = 0;
  const originalExecute = db.execute;
  (db as unknown as { execute: typeof db.execute }).execute = (async (query) => {
    queries.push(query);
    return responses[responseIndex++] ?? { rows: [] };
  }) as typeof db.execute;

  try {
    const report = await getCollectionBillingPrincipalReport({
      sourceImportIds: [sourceId],
      from,
      to,
      agingBuckets: ["D3"],
      nicknames: [nickname],
      createdByLogin,
    });

    assert.equal(queries.length, 3);
    assert.deepEqual(report.rows[0], {
      aging: "D3",
      totalOsp: "1000.00",
      targetPercentage: "20.0000",
      targetOsp: "200.00",
      resultPercentage: "25.00",
      ospClosed: "250.00",
      closedAccountCount: 1,
    });
    assert.deepEqual(report.all, {
      aging: "ALL",
      totalOsp: "1500.00",
      targetPercentage: "13.33",
      targetOsp: "200.00",
      resultPercentage: "16.67",
      ospClosed: "250.00",
      closedAccountCount: 1,
    });

    const baselineSql = collectSqlText(queries[0]).replace(/\s+/g, " ");
    assert.match(
      baselineSql,
      /PARTITION BY source_row\.canonical_obligation_key/i,
      "the same canonical obligation must contribute only once to the OSP baseline",
    );
    assert.match(baselineSql, /WHERE source_rank = 1/i);
    assert.match(baselineSql, /SUM\(billing_principal_osp\)/i);
    assert.doesNotMatch(baselineSql, /total_osb/i);

    const closedSql = collectSqlText(queries[1]).replace(/\s+/g, " ");
    assert.match(closedSql, /SELECT DISTINCT ON \(record\.source_obligation_key\)/i);
    assert.match(closedSql, /record\.classification = 'abort_cp'/i);
    assert.match(closedSql, /record\.duplicate_receipt_flag = false/i);
    assert.match(closedSql, /record\.source_data_row_id IS NOT NULL/i);
    assert.match(closedSql, /record\.source_match_basis IS NOT NULL/i);
    assert.match(closedSql, /record\.total_due IS NOT NULL/i);
    assert.match(closedSql, /record\.calling_date IS NOT NULL/i);
    assert.match(closedSql, /record\.calling_window_end_exclusive IS NOT NULL/i);
    assert.match(closedSql, /record\.payment_date >= record\.calling_date/i);
    assert.match(
      closedSql,
      /record\.payment_date < record\.calling_window_end_exclusive/i,
    );
    assert.match(closedSql, /config\.compatibility_status = 'compatible'/i);
    assert.match(
      closedSql,
      /ORDER BY record\.source_obligation_key, record\.payment_date, record\.created_at, record\.id/i,
      "only the first Abort CP for a canonical obligation may close OSP",
    );
    assert.match(closedSql, /SUM\(billing_principal_osp\)/i);
    assert.doesNotMatch(closedSql, /\bclassification\s*=\s*'cp'/i);
    assert.doesNotMatch(closedSql, /total_osb/i);

    const literalSql = queries.map((query) => collectSqlLiteralText(query)).join("\n");
    for (const untrustedValue of [sourceId, nickname, createdByLogin, from, to]) {
      assert.doesNotMatch(
        literalSql,
        new RegExp(untrustedValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
        `untrusted report filter must not be interpolated into SQL: ${untrustedValue}`,
      );
    }

    const allBoundValues = queries.flatMap((query) => collectBoundValues(query));
    for (const expected of [sourceId, "D3", nickname.toLowerCase(), createdByLogin.toLowerCase(), from, to]) {
      assert.ok(
        allBoundValues.includes(expected),
        `missing parameterized report filter ${expected}`,
      );
    }
  } finally {
    (db as unknown as { execute: typeof db.execute }).execute = originalExecute;
  }
});
