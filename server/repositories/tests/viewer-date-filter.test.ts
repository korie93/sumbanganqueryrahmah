import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildViewerDateFilterCondition } from "../viewer-date-filter";
import { normalizeImportFilterDate, normalizeImportFilterDateBound } from "../../../shared/common/import-data-dates";
import { getImportFilterValidationIssue, matchesImportDateFilter } from "../../../shared/common/import-data-filters";

const dialect = new PgDialect();

test("Viewer dates parse supported calendar formats without timezone or rollover guessing", () => {
  for (const [raw, date] of [
    ["2026-10-29", "2026-10-29"], ["20261029", "2026-10-29"], [20261029, "2026-10-29"],
    ["29/10/2026", "2026-10-29"], ["9-1-2026", "2026-01-09"], [" \t2024-02-29\r\n", "2024-02-29"],
    ["2000-02-29", "2000-02-29"], ["0001-01-01", "0001-01-01"], ["99991231", "9999-12-31"],
  ] as const) assert.equal(normalizeImportFilterDate(raw), date);
  for (const raw of [null, undefined, true, {}, [], "", " ", "2026-02-29", "1900-02-29", "2100-02-29", "2024-04-31",
    "0000-01-01", "2026-00-10", "2026-13-10", "2026-01-00", "29/10-2026", "10/29/2026", "29/10/26",
    "2026-10-29T00:00:00Z", "2026-10-29 bad", "46246", 46246, 20261029.5, Infinity, NaN, "20261029.0", "2.0261029e7",
    "\u00a02026-10-29", "9".repeat(33), "2026-01-01'); DROP TABLE imports;--"]) {
    assert.equal(normalizeImportFilterDate(raw), null, String(raw));
  }
});

test("Viewer date bounds are canonical, validate both range ends and keep strict/inclusive semantics", () => {
  for (const raw of ["29/10/2026", "20261029", 20261029, "2026-10-29\n", " 2026-10-29", "2026-02-30"]) {
    assert.equal(normalizeImportFilterDateBound(raw), null);
  }
  assert.equal(normalizeImportFilterDateBound("2024-02-29"), "2024-02-29");
  const filter = { column: "Date", operator: "dateBetween" as const, value: "2024-02-29", valueTo: "2024-02-29" };
  assert.equal(matchesImportDateFilter("29/2/2024", filter), true);
  assert.equal(matchesImportDateFilter("2024-03-01", filter), false);
  assert.equal(matchesImportDateFilter("29/2/2024", { ...filter, operator: "dateBefore" }), false);
  assert.equal(matchesImportDateFilter("29/2/2024", { ...filter, operator: "dateAfter" }), false);
  assert.equal(matchesImportDateFilter("2024-02-28", { ...filter, operator: "dateBefore" }), true);
  assert.equal(matchesImportDateFilter("2024-03-01", { ...filter, operator: "dateAfter" }), true);
  assert.equal(getImportFilterValidationIssue({ ...filter, valueTo: "" }), "Enter both a start and end date.");
  assert.equal(getImportFilterValidationIssue({ ...filter, value: "2024-02-30" }), "Enter a valid date (YYYY-MM-DD).");
  assert.equal(getImportFilterValidationIssue({ ...filter, valueTo: "2024-02-28" }), "Start date must be on or before end date.");
});

test("Viewer date SQL binds hostile column names and strict bounds behind regex/calendar CASE guards", () => {
  const column = "Date'); DROP TABLE imports; --";
  for (const operator of ["dateBefore", "dateAfter", "dateBetween"] as const) {
    const query = dialect.sqlToQuery(buildViewerDateFilterCondition(column, operator, "2024-02-29", "2024-03-01"));
    assert.ok(query.params.includes(column));
    assert.ok(query.params.includes(20240229));
    assert.doesNotMatch(query.sql, /DROP TABLE|to_date|::date|make_date/);
    assert.match(query.sql, /CASE WHEN jsonb_typeof/);
    assert.match(query.sql, /CASE WHEN length\(v.text\)/);
    assert.match(query.sql, /p.parts\[1\] % 400/);
    if (operator === "dateBetween") assert.match(query.sql, /BETWEEN \$\d+::int AND \$\d+::int$/);
    else assert.match(query.sql, operator === "dateBefore" ? /< \$\d+::int$/ : /> \$\d+::int$/);
  }
});

test("Invalid direct repository date bounds fail closed instead of silently removing a filter", () => {
  for (const value of ["", "2024-02-30", "1900-02-29", "29/2/2024", "20240229", "2024-02-29\n", "x' OR true --"]) {
    assert.equal(dialect.sqlToQuery(buildViewerDateFilterCondition("Date", "dateBefore", value)).sql, "false");
  }
  for (const valueTo of [undefined, "", "2024-02-28", "not a date"]) {
    assert.equal(dialect.sqlToQuery(buildViewerDateFilterCondition("Date", "dateBetween", "2024-02-29", valueTo)).sql, "false");
  }
});
