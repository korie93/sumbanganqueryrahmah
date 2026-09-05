import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../../db-postgres";
import { purgeCollectionRecordsOlderThan } from "../collection-record-purge-repository-utils";
import { collectBoundValues, collectSqlText } from "./sql-test-utils";

test("collection purge archives classification and revoked POOL evidence before deleting records", async () => {
  const originalTransaction = db.transaction;
  const queries: unknown[] = [];
  const recordId = "11111111-1111-4111-8111-111111111111";

  (db as unknown as { transaction: typeof db.transaction }).transaction = (async (callback) => {
    const executor = {
      execute: async (query: unknown) => {
        queries.push(query);
        const text = collectSqlText(query);
        if (/SELECT\s+id\s+FROM public\.collection_records\s+WHERE payment_date/si.test(text)) {
          return { rows: [{ id: recordId }] };
        }
        if (/SELECT\s+id,\s+amount,\s+receipt_file,\s+settlement_cycle_key/si.test(text)) {
          return {
            rows: [{
              id: recordId,
              amount: "125.50",
              receipt_file: "receipts/legacy.jpg",
              settlement_cycle_key: "cycle-dummy-1",
            }],
          };
        }
        if (/SELECT\s+storage_path\s+FROM public\.collection_record_receipts/si.test(text)) {
          return { rows: [{ storage_path: "receipts/current.jpg" }] };
        }
        return { rows: [] };
      },
    };
    return callback(executor as never);
  }) as typeof db.transaction;

  try {
    const result = await purgeCollectionRecordsOlderThan("2026-02-01", "superuser.audit");
    const queryTexts = queries.map(collectSqlText);
    const archiveIndex = queryTexts.findIndex((text) =>
      /INSERT INTO public\.collection_record_purge_history/i.test(text),
    );
    const deleteIndex = queryTexts.findIndex((text) =>
      /DELETE FROM public\.collection_records/i.test(text),
    );

    assert.equal(result.totalRecords, 1);
    assert.equal(result.totalAmount, 125.5);
    assert.deepEqual(result.receiptPaths.sort(), [
      "receipts/current.jpg",
      "receipts/legacy.jpg",
    ]);
    assert.ok(archiveIndex >= 0);
    assert.ok(deleteIndex > archiveIndex);
    assert.ok(queryTexts.some((text) => /ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING/i.test(text)));

    const archiveSql = queryTexts[archiveIndex] || "";
    const archiveValues = collectBoundValues(queries[archiveIndex]);
    assert.match(archiveSql, /ON CONFLICT \(original_record_id\) DO UPDATE SET/i);
    assert.match(archiveSql, /purged_by = EXCLUDED\.purged_by/i);
    assert.match(archiveSql, /ic_number_search_hash/i);
    assert.match(archiveSql, /customer_phone_search_hash/i);
    assert.match(archiveSql, /account_number_search_hash/i);
    assert.match(archiveSql, /source_obligation_key/i);
    assert.match(archiveSql, /source_obligation_key = EXCLUDED\.source_obligation_key/i);
    assert.match(archiveSql, /automatic_classification/i);
    assert.match(archiveSql, /settlement_override_status/i);
    assert.match(archiveSql, /pool_amount/i);
    assert.match(archiveSql, /manual_settlement_revoked_reason/i);
    assert.match(archiveSql, /pool_amount = EXCLUDED\.pool_amount/i);
    assert.doesNotMatch(archiveSql, /customer_name/i);
    assert.doesNotMatch(archiveSql, /_encrypted/i);
    assert.doesNotMatch(archiveSql, /receipt_file/i);
    assert.ok(archiveValues.includes("superuser.audit"));
  } finally {
    (db as unknown as { transaction: typeof db.transaction }).transaction = originalTransaction;
  }
});

test("collection purge rejects an empty audit actor before opening a transaction", async () => {
  await assert.rejects(
    purgeCollectionRecordsOlderThan("2026-02-01", "   "),
    /purge actor is required/i,
  );
});
