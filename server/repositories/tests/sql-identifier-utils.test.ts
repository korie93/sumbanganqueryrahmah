import assert from "node:assert/strict";
import test from "node:test";
import { assertSqlIdentifier } from "../sql-identifier-utils";

test("assertSqlIdentifier accepts stable internal SQL aliases and column names", () => {
  assert.equal(assertSqlIdentifier("i"), "i");
  assert.equal(assertSqlIdentifier("customer_name"), "customer_name");
  assert.equal(assertSqlIdentifier("customerName"), "customerName");
});

test("assertSqlIdentifier rejects unsafe dynamic SQL identifier text", () => {
  assert.throws(() => assertSqlIdentifier("i; DROP TABLE imports"), /Unsafe SQL identifier/i);
  assert.throws(() => assertSqlIdentifier("public.imports"), /Unsafe SQL identifier/i);
  assert.throws(() => assertSqlIdentifier("1alias"), /Unsafe SQL identifier/i);
  assert.throws(() => assertSqlIdentifier('alias"'), /Unsafe SQL identifier/i);
});
