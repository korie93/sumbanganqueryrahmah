import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../perf-collection-v9.mjs", import.meta.url), "utf8");

test("Collection V9 performance probe is read-only, bounded, and covers merged workloads", () => {
  assert.match(source, /BEGIN READ ONLY/);
  assert.match(source, /statement_timeout = '15s'/);
  assert.match(source, /EXPLAIN \(ANALYZE, BUFFERS, FORMAT JSON\)/);
  assert.match(source, /general_search_active_history_page/);
  assert.match(source, /general_search_purged_history_page/);
  assert.match(source, /manual_settlement_audit_history/);
  assert.match(source, /team_leader_collection_page/);
  assert.match(source, /table_a_system_payment_dataset/);
  assert.match(source, /table_b_latest_complete_client_snapshot/);
  assert.match(source, /LIMIT 11 OFFSET 0/);
  assert.match(source, /LIMIT 250001/);
  assert.doesNotMatch(source, /console\.log\([^)]*(?:obligationKey|recordId|memberIds|revisionId)/);
});
