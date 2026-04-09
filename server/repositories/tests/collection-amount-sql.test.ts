import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";

import { buildCollectionAmountMyrToCentsSql } from "../collection-amount-sql";
import { collectSqlText } from "./sql-test-utils";

test("buildCollectionAmountMyrToCentsSql centralizes MYR-to-cents bigint conversion", () => {
  const fragment = buildCollectionAmountMyrToCentsSql(sql.raw("record.amount"));
  const sqlText = collectSqlText(fragment).replace(/\s+/g, " ");

  assert.match(sqlText, /ROUND\(\(record\.amount\) \* 100\)::bigint/);
});
