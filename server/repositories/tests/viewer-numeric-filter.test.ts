import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildViewerNumericFilterCondition } from "../viewer-numeric-filter";
import { buildViewerNumericCursorCondition, buildViewerNumericOrder } from "../viewer-numeric-sort";
import { isImportDataNumericSort } from "../../../shared/common/import-data-sort";

const dialect = new PgDialect();

test("Viewer decimal predicates bind exact bounds and hostile column names behind a guarded cast", () => {
  const hostileColumn = "Amount'); DROP TABLE users; --";
  const query = dialect.sqlToQuery(buildViewerNumericFilterCondition(
    hostileColumn, "between", "9,007,199,254,740,993.00", "9007199254740993.01",
  ));
  assert.match(query.sql, /CASE\s+WHEN length\(/);
  assert.match(query.sql, /\s~\s\$\d+/);
  assert.match(query.sql, /THEN replace\([\s\S]*::numeric\s+ELSE NULL\s+END BETWEEN/);
  assert.doesNotMatch(query.sql, /DROP TABLE|9,007|9007199254740993/);
  assert.ok(query.params.includes(hostileColumn));
  assert.ok(query.params.includes("9007199254740993"));
  assert.ok(query.params.includes("9007199254740993.01"));
  assert.ok(!query.params.includes(Number("9007199254740993")));
});

test("Viewer comparisons stay strict while Between includes both decimal endpoints", () => {
  const greater = dialect.sqlToQuery(buildViewerNumericFilterCondition("Amount", "greaterThan", "+0010.50"));
  const less = dialect.sqlToQuery(buildViewerNumericFilterCondition("Amount", "lessThan", "-.5"));
  const between = dialect.sqlToQuery(buildViewerNumericFilterCondition("Amount", "between", "-0", "0.00"));
  assert.match(greater.sql, /END > \$\d+::numeric/);
  assert.match(less.sql, /END < \$\d+::numeric/);
  assert.match(between.sql, /END BETWEEN \$\d+::numeric AND \$\d+::numeric/);
  assert.ok(greater.params.includes("10.5"));
  assert.ok(less.params.includes("-0.5"));
  assert.equal(between.params.filter((value) => value === "0").length, 2);
});

test("Invalid direct repository numeric bounds fail closed rather than dropping the filter", () => {
  for (const value of ["", " ", "NaN", "Infinity", "1e3", "0x10", "12,34", "1 OR 1=1", "\u00a010", "9".repeat(257)]) {
    assert.equal(dialect.sqlToQuery(buildViewerNumericFilterCondition("Amount", "greaterThan", value)).sql, "false");
  }
  for (const [minimum, maximum] of [["1", undefined], ["2", "1"], ["1", "bad"], ["1", "\u00a02"]]) {
    assert.equal(dialect.sqlToQuery(buildViewerNumericFilterCondition("Amount", "between", minimum ?? "", maximum)).sql, "false");
  }
});

test("Viewer numeric ordering binds column names, places dirty cells last and keeps ID ties stable", () => {
  const column = "Amount'); DROP TABLE users; --";
  for (const direction of ["asc", "desc"] as const) {
    const query = dialect.sqlToQuery(buildViewerNumericOrder({ column, direction }));
    assert.match(query.sql, new RegExp(`END ${direction.toUpperCase()} NULLS LAST, dr\\.id ASC`));
    assert.doesNotMatch(query.sql, /DROP TABLE/);
    assert.ok(query.params.includes(column));
    const cursor = dialect.sqlToQuery(buildViewerNumericCursorCondition({ column, direction }, "row-anchor"));
    assert.match(cursor.sql, direction === "desc" ? /END < viewer_sort_anchor.value/ : /END > viewer_sort_anchor.value/);
    assert.match(cursor.sql, /viewer_sort_anchor.value IS NULL AND[\s\S]*IS NULL AND dr.id >/);
    assert.match(cursor.sql, /viewer_sort_anchor.value IS NOT NULL/);
    assert.ok(cursor.params.includes("row-anchor"));
    assert.doesNotMatch(cursor.sql, /row-anchor|DROP TABLE/);
  }
});

test("Viewer numeric sort contract rejects malformed shape and untrusted SQL directions", () => {
  assert.equal(isImportDataNumericSort({ column: "Amount", direction: "asc" }), true);
  assert.equal(isImportDataNumericSort({ column: "Amount", direction: "desc" }), true);
  for (const value of [null, [], "asc", {}, { column: "Amount" }, { column: "", direction: "asc" },
    { column: " Amount", direction: "asc" }, { column: "A".repeat(121), direction: "asc" },
    { column: "Amount", direction: "asc; DROP TABLE users" }, { column: "Amount", direction: "ASC" },
    { column: "Amount", direction: "asc", extra: true }]) {
    assert.equal(isImportDataNumericSort(value), false);
  }
});
