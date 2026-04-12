import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";

import {
  formatCollectionAmountFromCents,
  formatCollectionAmountMyrString,
  parseCollectionAmountMyrInput,
  parseCollectionAmountToCents,
  parseCollectionAmountMyrNumber,
  parseStoredCollectionAmountCents,
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

test("collection amount helpers centralize cents parsing and formatting consistently", () => {
  assert.equal(parseCollectionAmountToCents("1,250.50"), 125050);
  assert.equal(parseCollectionAmountToCents("15.555"), null);
  assert.equal(parseCollectionAmountToCents(""), null);
  assert.equal(parseCollectionAmountToCents("0", { allowZero: true }), 0);

  assert.equal(parseStoredCollectionAmountCents("125050"), 125050);
  assert.equal(parseStoredCollectionAmountCents(125050n), 125050);
  assert.equal(parseStoredCollectionAmountCents("invalid"), null);

  assert.equal(formatCollectionAmountFromCents(125050), "1250.50");
  assert.equal(formatCollectionAmountFromCents("99"), "0.99");
  assert.equal(formatCollectionAmountFromCents(-50), "-0.50");
});

test("collection amount helpers validate MYR input without falling back to Number coercion", () => {
  assert.equal(parseCollectionAmountMyrInput("1,250.50", { allowZero: true }), 1250.5);
  assert.equal(parseCollectionAmountMyrInput("0", { allowZero: true }), 0);
  assert.equal(parseCollectionAmountMyrInput("12.345", { allowZero: true }), null);
  assert.equal(parseCollectionAmountMyrInput("invalid", { allowZero: true }), null);
});
