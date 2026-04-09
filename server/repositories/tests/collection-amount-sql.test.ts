import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";

import {
  formatCollectionAmountMyrString,
  parseCollectionAmountMyrNumber,
} from "../../../shared/collection-amount-types";
import { buildCollectionAmountMyrToCentsSql } from "../collection-amount-sql";
import { collectSqlText } from "./sql-test-utils";

test("buildCollectionAmountMyrToCentsSql centralizes MYR-to-cents bigint conversion", () => {
  const fragment = buildCollectionAmountMyrToCentsSql(sql.raw("record.amount"));
  const sqlText = collectSqlText(fragment).replace(/\s+/g, " ");

  assert.match(sqlText, /ROUND\(\(record\.amount\) \* 100\)::bigint/);
});

test("collection amount helpers normalize MYR strings and numbers consistently", () => {
  assert.equal(parseCollectionAmountMyrNumber("1,250.5"), 1250.5);
  assert.equal(parseCollectionAmountMyrNumber(88), 88);
  assert.equal(parseCollectionAmountMyrNumber("invalid"), 0);

  assert.equal(formatCollectionAmountMyrString("1250.5"), "1250.50");
  assert.equal(formatCollectionAmountMyrString(88), "88.00");
  assert.equal(formatCollectionAmountMyrString("invalid"), "0.00");
});
