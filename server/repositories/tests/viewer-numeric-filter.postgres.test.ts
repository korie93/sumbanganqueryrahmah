import assert from "node:assert/strict";
import test from "node:test";
import type { ImportDataColumnFilter } from "../../../shared/common/import-data-filters";
import { compareImportFilterNumbers, matchesImportNumericFilter, normalizeImportFilterNumber } from "../../../shared/common/import-data-filters";

test("Viewer numeric filters use exact guarded PostgreSQL comparisons across pages and exports", {
  skip: process.env.SQR_AUTH_ISOLATED_CLUSTER !== "1",
}, async () => {
  assert.equal(process.env.PG_HOST, "127.0.0.1");
  assert.equal(process.env.PG_DATABASE, "sqr_auth_recovery_test");
  assert.equal(process.env.PG_USER, "sqr_fixture");
  for (const key of ["DATABASE_URL", "DATABASE_READ_REPLICA_URL"]) assert.equal(Object.prototype.hasOwnProperty.call(process.env, key), false);
  delete process.env.SQR_AUTH_ISOLATED_CLUSTER;
  const runtime = await import("../../db-postgres");
  runtime.stopPgPoolBackgroundTasks();
  const { pool } = runtime;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS imports (
        id text PRIMARY KEY, name text NOT NULL, filename text NOT NULL,
        content_hash_sha256 text, source_size_bytes bigint,
        created_at timestamptz NOT NULL DEFAULT now(), last_opened_at timestamptz,
        is_deleted boolean NOT NULL DEFAULT false, created_by text
      );
      CREATE TABLE IF NOT EXISTS data_rows (
        id text PRIMARY KEY,
        import_id text NOT NULL REFERENCES imports(id) ON UPDATE CASCADE ON DELETE CASCADE,
        json_data jsonb NOT NULL
      );
    `);
    const { ImportsRepository } = await import("../imports.repository");
    const { SearchRepository } = await import("../search.repository");
    const { ImportsServiceReadOperations } = await import("../../services/imports-service-read-operations");
    const imports = new ImportsRepository();
    const search = new SearchRepository();
    const reads = new ImportsServiceReadOperations({
      getImportById: imports.getImportById.bind(imports),
      getDataRowsByImport: imports.getDataRowsByImport.bind(imports),
      searchDataRows: search.searchDataRows.bind(search),
    } as never, imports, {} as never);
    const dataset = await imports.createImport({ name: "Synthetic numeric dataset", filename: "numeric.csv" });
    const hostileColumn = "Amount'); DROP TABLE imports; --";
    const tiny = `.${"0".repeat(254)}1`;
    const values: Array<{ label: string; value: unknown }> = [
      ...Array.from({ length: 131 }, (_, value) => ({ label: `integer-${value}`, value: String(value) })),
      { label: "negative", value: "-10.5" }, { label: "decimal", value: "0.50" },
      { label: "grouped", value: "1,000.50" }, { label: "zero-signed", value: "-0" },
      { label: "blank", value: "" }, { label: "space", value: " \t\r\n" }, { label: "null", value: null },
      { label: "text", value: "N/A" }, { label: "bool", value: false }, { label: "object", value: { value: 15 } },
      { label: "array", value: [15] }, { label: "exponent-string", value: "1e3" },
      { label: "bad-group", value: "12,34" }, { label: "sql-string", value: "1); DROP TABLE imports; --" },
      { label: "unicode-space", value: "\u00a010" }, { label: "ascii-space", value: " \t15.5\r\n" },
      { label: "precise-lower", value: "9007199254740993.01" }, { label: "precise-upper", value: "9007199254740993.02" },
      { label: "json-tiny", value: 1e-7 }, { label: "json-large", value: 1e21 },
      { label: "tiny-boundary", value: tiny }, { label: "too-long", value: "9".repeat(257) },
    ];
    for (const [index, item] of values.entries()) {
      await pool.query("INSERT INTO data_rows (id,import_id,json_data) VALUES ($1,$2,$3::jsonb)",
        [`numeric-fixture-${String(index).padStart(4, "0")}`, dataset.id,
          JSON.stringify({ Amount: item.value, label: item.label, [hostileColumn]: item.value })]);
    }
    const query = (filter: ImportDataColumnFilter) => search.searchDataRows({ importId: dataset.id, limit: 200, offset: 0, columnFilters: [filter] });
    const labels = (rows: Array<{ jsonDataJsonb: unknown }>) => rows.map(row => (row.jsonDataJsonb as { label: string }).label).sort();
    const range: ImportDataColumnFilter = { column: "Amount", operator: "between", value: "10", valueTo: "20" };
    const cases: Array<[ImportDataColumnFilter, string[]]> = [
      [{ column: "Amount", operator: "lessThan", value: "0" }, ["negative"]],
      [{ column: "Amount", operator: "greaterThan", value: "1000" }, ["grouped", "precise-lower", "precise-upper", "json-large"]],
      [{ column: "Amount", operator: "between", value: "0", valueTo: "0" }, ["integer-0", "zero-signed"]],
      [{ column: "Amount", operator: "between", value: "1000.50", valueTo: "1,000.50" }, ["grouped"]],
      [{ column: "Amount", operator: "greaterThan", value: "9007199254740993.01" }, ["precise-upper", "json-large"]],
      [{ column: "Amount", operator: "between", value: tiny, valueTo: tiny }, ["tiny-boundary"]],
      [{ column: "Amount", operator: "between", value: "0.0000001", valueTo: "0.0000001" }, ["json-tiny"]],
      [range, [...Array.from({ length: 11 }, (_, i) => `integer-${i + 10}`), "ascii-space"]],
    ];
    for (const [filter, expected] of cases) {
      const result = await query(filter);
      assert.deepEqual(labels(result.rows), [...expected].sort());
      assert.equal(result.total, expected.length);
      assert.equal(result.nextCursorRowId, null);
      assert.deepEqual(values.filter(item => matchesImportNumericFilter(item.value, filter)).map(item => item.label).sort(), [...expected].sort(),
        "Browser decimal matching must agree with actual PostgreSQL, including native JSON numbers");
    }
    for (const filter of [
      { ...range, valueTo: undefined }, { ...range, valueTo: "9" }, { ...range, value: "NaN" },
    ]) assert.equal((await query(filter as ImportDataColumnFilter)).total, 0);
    assert.deepEqual(labels((await query({ ...range, column: hostileColumn })).rows), cases[cases.length - 1]![1].slice().sort());
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM imports WHERE id=$1", [dataset.id])).rows[0].count, 1);

    const pageInput = { importId: dataset.id, page: 1, requestedLimit: 10, viewerRowsPerPage: 10,
      isDbProtected: false, columnFilters: [range] };
    const first = await reads.getImportDataPage(pageInput);
    assert.equal(first.rows.length, 10);
    assert.equal(first.total, 12);
    assert.ok(first.nextCursor);
    const second = await reads.getImportDataPage({ ...pageInput, page: 2, cursor: first.nextCursor });
    assert.equal(second.rows.length, 2);
    assert.equal(second.total, 12);
    assert.equal(second.nextCursor, null);
    const narrower = await reads.getImportDataPage({ ...pageInput, columnFilters: [{ ...range, valueTo: "10" }] });
    assert.equal(narrower.total, 1);
    assert.deepEqual(labels(narrower.rows), ["integer-10"]);

    const exported: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 3; page++) {
      const result = await search.searchDataRows({ importId: dataset.id, limit: 10, offset: 0, columnFilters: [range], cursor });
      exported.push(...labels(result.rows));
      cursor = result.nextCursorRowId;
      if (!cursor) break;
    }
    assert.equal(cursor, null);
    assert.equal(new Set(exported).size, 12);
    assert.deepEqual(exported.sort(), cases[cases.length - 1]![1].slice().sort());

    // Numeric ordering is applied before pagination, uses exact decimal values,
    // and traverses both numeric ties and the dirty/null bucket without gaps.
    for (const direction of ["asc", "desc"] as const) {
      const expected = values.map((item, index) => ({ ...item,
        id: `numeric-fixture-${String(index).padStart(4, "0")}`,
        numeric: normalizeImportFilterNumber(item.value),
      })).sort((a, b) => {
        const order = a.numeric === null ? (b.numeric === null ? 0 : 1)
          : b.numeric === null ? -1 : (compareImportFilterNumbers(a.numeric, b.numeric) ?? 0) * (direction === "desc" ? -1 : 1);
        return order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      });
      const ordered: string[] = [];
      let sortCursor: string | null = null;
      for (let page = 1; page <= 30; page++) {
        const result = await search.searchDataRows({ importId: dataset.id, limit: 7, offset: 0,
          cursor: sortCursor, numericSort: { column: "Amount", direction } });
        assert.equal(result.total, values.length);
        ordered.push(...result.rows.map(row => row.id));
        sortCursor = result.nextCursorRowId;
        if (!sortCursor) break;
      }
      assert.equal(sortCursor, null);
      assert.deepEqual(ordered, expected.map(item => item.id));
      assert.equal(new Set(ordered).size, values.length);
      const filtered = await search.searchDataRows({ importId: dataset.id, limit: 200, offset: 0,
        columnFilters: [range], numericSort: { column: "Amount", direction } });
      assert.deepEqual(filtered.rows.map(row => row.id), expected.filter(item => matchesImportNumericFilter(item.value, range)).map(item => item.id));
      const hostile = await search.searchDataRows({ importId: dataset.id, limit: 200, offset: 0,
        columnFilters: [range], numericSort: { column: hostileColumn, direction } });
      assert.deepEqual(hostile.rows.map(row => row.id), filtered.rows.map(row => row.id));
      const first = await reads.getImportDataPage({ ...pageInput, numericSort: { column: "Amount", direction } });
      const next = await reads.getImportDataPage({ ...pageInput, page: 2, cursor: first.nextCursor,
        numericSort: { column: "Amount", direction } });
      assert.deepEqual([...first.rows, ...next.rows].map(row => row.id), filtered.rows.map(row => row.id));
      // Search and numeric filters must constrain both the rows and each cursor
      // anchor before sorting; traverse beyond the first matching page.
      const searched: string[] = [];
      let searchCursor: string | null = null;
      const expectedSearch = expected.filter(item => item.label.startsWith("integer-1")
        && matchesImportNumericFilter(item.value, range));
      for (let page = 0; page < 3; page++) {
        const result = await search.searchDataRows({ importId: dataset.id, limit: 7, offset: 0,
          search: "integer-1", cursor: searchCursor, columnFilters: [range],
          numericSort: { column: "Amount", direction } });
        assert.equal(result.total, 10);
        searched.push(...result.rows.map(row => row.id));
        searchCursor = result.nextCursorRowId;
        if (!searchCursor) break;
      }
      assert.equal(searchCursor, null);
      assert.deepEqual(searched, expectedSearch.map(item => item.id));
    }
    // A cursor outside the current filtered import cannot establish an anchor.
    const another = await imports.createImport({ name: "Other synthetic import", filename: "other.csv" });
    await pool.query("INSERT INTO data_rows (id,import_id,json_data) VALUES ($1,$2,$3::jsonb)",
      ["numeric-foreign-anchor", another.id, '{"Amount":10,"label":"foreign"}']);
    for (const cursor of ["numeric-foreign-anchor", "numeric-fixture-0000", "missing-anchor"]) {
      const wrong = await search.searchDataRows({ importId: dataset.id, limit: 10, offset: 0,
        cursor, columnFilters: [range], numericSort: { column: "Amount", direction: "asc" } });
      assert.deepEqual(wrong.rows, []);
      assert.equal(wrong.total, 12);
      assert.equal(wrong.nextCursorRowId, null);
    }
    // Send an exact JSON numeric token, rather than rounding it in this fixture.
    await pool.query("INSERT INTO data_rows (id,import_id,json_data) VALUES ($1,$2,$3::jsonb)",
      ["numeric-unsafe-json", dataset.id, '{"Amount":9007199254740993,"label":"unsafe-json"}']);
    const unsafe = await query({ column: "Amount", operator: "between", value: "9007199254740993", valueTo: "9007199254740993" });
    assert.equal(unsafe.total, 1);
    assert.deepEqual(labels(unsafe.rows), ["unsafe-json"]);
    assert.equal((unsafe.rows[0]!.jsonDataJsonb as { Amount: number }).Amount, 9007199254740992,
      "The browser must not re-filter numeric membership after JSON precision is lost");
    const exactSort = await search.searchDataRows({ importId: dataset.id, limit: 10, offset: 0,
      columnFilters: [{ column: "Amount", operator: "between", value: "9007199254740993", valueTo: "9007199254740993.02" }],
      numericSort: { column: "Amount", direction: "asc" } });
    assert.deepEqual(exactSort.rows.map(row => (row.jsonDataJsonb as { label: string }).label), ["unsafe-json", "precise-lower", "precise-upper"]);
    await imports.deleteImport(dataset.id);
    assert.deepEqual(await query(range), { rows: [], total: 0, nextCursorRowId: null });
    assert.deepEqual(await search.searchDataRows({ importId: dataset.id, limit: 10, offset: 0,
      cursor: "numeric-fixture-0010", numericSort: { column: "Amount", direction: "asc" } }),
    { rows: [], total: 0, nextCursorRowId: null });
  } finally {
    runtime.stopPgPoolBackgroundTasks();
    await runtime.closePostgresPools();
  }
});
