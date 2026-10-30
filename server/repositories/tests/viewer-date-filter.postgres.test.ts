import assert from "node:assert/strict";
import test from "node:test";
import type { ImportDataColumnFilter } from "../../../shared/common/import-data-filters";
import { matchesImportDateFilter } from "../../../shared/common/import-data-filters";

test("Viewer calendar-date filters stay exact across PostgreSQL pages, sorting, search and exports", {
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
    await pool.query(`CREATE TABLE IF NOT EXISTS imports (
      id text PRIMARY KEY, name text NOT NULL, filename text NOT NULL, content_hash_sha256 text, source_size_bytes bigint,
      created_at timestamptz NOT NULL DEFAULT now(), last_opened_at timestamptz, is_deleted boolean NOT NULL DEFAULT false, created_by text
    ); CREATE TABLE IF NOT EXISTS data_rows (
      id text PRIMARY KEY, import_id text NOT NULL REFERENCES imports(id) ON UPDATE CASCADE ON DELETE CASCADE, json_data jsonb NOT NULL
    );`);
    const { ImportsRepository } = await import("../imports.repository");
    const { SearchRepository } = await import("../search.repository");
    const { ImportsServiceReadOperations } = await import("../../services/imports-service-read-operations");
    const imports = new ImportsRepository(), search = new SearchRepository();
    const reads = new ImportsServiceReadOperations({ searchDataRows: search.searchDataRows.bind(search) } as never, imports, {} as never);
    const dataset = await imports.createImport({ name: "Synthetic calendar dates", filename: "calendar.csv" });
    const hostileColumn = "Date'); DROP TABLE imports; --";
    const values: Array<{ label: string; raw: unknown; day: string | null; amount: number; token?: string }> = Array.from({ length: 40 }, (_, index) => {
      const day = new Date(Date.UTC(2024, 1, index + 1)).toISOString().slice(0, 10);
      const [year, month, date] = day.split("-");
      const raw = index % 4 === 0 ? day : index % 4 === 1 ? day.replace(/-/g, "")
        : index % 4 === 2 ? `${Number(date)}/${Number(month)}/${year}` : `${Number(date)}-${Number(month)}-${year}`;
      return { label: `point-${String(index).padStart(2, "0")}`, raw, day, amount: (index * 17) % 43 };
    });
    values.push(
      { label: "iso-leap", raw: "2024-02-29", day: "2024-02-29", amount: 90 },
      { label: "native-decimal", raw: 20240229, day: "2024-02-29", amount: 91, token: "20240229.0" },
      { label: "native-exponent", raw: 20240229, day: "2024-02-29", amount: 92, token: "2.0240229e7" },
      { label: "native-fraction", raw: 20240229.5, day: null, amount: 93, token: "20240229.5" },
      { label: "decimal-string", raw: "20240229.0", day: null, amount: 94 },
      { label: "early", raw: "0001-01-01", day: "0001-01-01", amount: 95 },
      { label: "late", raw: "99991231", day: "9999-12-31", amount: 96 },
      { label: "leap-2000", raw: "29/02/2000", day: "2000-02-29", amount: 97 },
      { label: "ascii-space", raw: " \t2024-02-29\r\n", day: "2024-02-29", amount: 98 },
      ...[null, "", " ", false, {}, [], "2026-02-29", "1900-02-29", "2100-02-29", "2024-04-31", "0000-01-01", "2024-13-01",
        "2024-01-00", "2024-02-29T23:00:00+08:00", "29/2-2024", "2/29/2024", "29/2/24", "46246", 46246,
        "\u00a02024-02-29", "9".repeat(33), "2024-02-29'); DROP TABLE imports;--"].map((raw, index) => ({
        label: `dirty-${index}`, raw, day: null, amount: 100 + index,
      })),
    );
    const idFor = (index: number) => `date-fixture-${String(index).padStart(4, "0")}`;
    for (const [index, item] of values.entries()) {
      const data = { Date: item.raw, [hostileColumn]: item.raw, Amount: String(item.amount), label: item.label, group: "match" };
      const json = item.token ? JSON.stringify(data).replace(`"Date":${String(item.raw)}`, `"Date":${item.token}`) : JSON.stringify(data);
      await pool.query("INSERT INTO data_rows(id,import_id,json_data) VALUES($1,$2,$3::jsonb)", [idFor(index), dataset.id, json]);
    }
    const query = (filter: ImportDataColumnFilter, extra: Record<string, unknown> = {}) => search.searchDataRows({
      importId: dataset.id, limit: 200, offset: 0, columnFilters: [filter], ...extra,
    });
    const selected = (filter: ImportDataColumnFilter) => values.map((item, index) => ({ ...item, id: idFor(index) }))
      .filter(item => item.day !== null && (filter.operator === "dateBefore" ? item.day < filter.value
        : filter.operator === "dateAfter" ? item.day > filter.value : item.day >= filter.value && item.day <= filter.valueTo!));
    const range: ImportDataColumnFilter = { column: "Date", operator: "dateBetween", value: "2024-02-20", valueTo: "2024-03-10" };
    for (const filter of [range, { ...range, operator: "dateBefore" as const, value: "2024-02-29" },
      { ...range, operator: "dateAfter" as const, value: "2024-02-29" },
      { ...range, value: "2024-02-29", valueTo: "2024-02-29" },
      { ...range, value: "0001-01-01", valueTo: "0001-01-01" },
      { ...range, value: "9999-12-31", valueTo: "9999-12-31" }]) {
      const result = await query(filter), expected = selected(filter);
      assert.deepEqual(result.rows.map(row => row.id), expected.map(item => item.id));
      assert.equal(result.total, expected.length);
      assert.deepEqual(values.filter(item => matchesImportDateFilter(item.raw, filter)).map(item => item.label), expected.map(item => item.label));
    }
    assert.equal((await query({ ...range, value: "2024-02-30" })).total, 0);
    assert.equal((await query({ ...range, valueTo: "2024-02-19" })).total, 0);
    assert.deepEqual((await query({ ...range, column: hostileColumn })).rows.map(row => row.id), selected(range).map(item => item.id));
    assert.deepEqual(await query({ ...range, column: "Missing" }), { rows: [], total: 0, nextCursorRowId: null });
    for (const direction of ["asc", "desc"] as const) {
      const expected = selected(range).sort((a, b) => (a.amount - b.amount) * (direction === "desc" ? -1 : 1) || (a.id < b.id ? -1 : 1));
      const exported: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 8; page++) {
        const result = await query(range, { search: "match", limit: 7, cursor, numericSort: { column: "Amount", direction } });
        assert.equal(result.total, expected.length);
        exported.push(...result.rows.map(row => row.id));
        cursor = result.nextCursorRowId;
        if (!cursor) break;
      }
      assert.equal(cursor, null);
      assert.deepEqual(exported, expected.map(item => item.id));
      assert.equal(new Set(exported).size, expected.length);
      const searchSubset = await query(range, { search: "point-2", numericSort: { column: "Amount", direction } });
      const expectedSubset = expected.filter(item => item.label.startsWith("point-2"));
      assert.ok(expectedSubset.length > 0 && expectedSubset.length < expected.length);
      assert.equal(searchSubset.total, expectedSubset.length);
      assert.deepEqual(searchSubset.rows.map(row => row.id), expectedSubset.map(item => item.id));
      const pageInput = { importId: dataset.id, page: 1, requestedLimit: 10, viewerRowsPerPage: 10,
        isDbProtected: false, search: "match", columnFilters: [range], numericSort: { column: "Amount", direction } };
      const first = await reads.getImportDataPage(pageInput);
      const second = await reads.getImportDataPage({ ...pageInput, page: 2, cursor: first.nextCursor });
      assert.equal(first.total, expected.length);
      assert.equal(second.total, expected.length);
      assert.deepEqual([...first.rows, ...second.rows].map(row => row.id), expected.slice(0, 20).map(item => item.id));
      const absent = await query(range, { search: "absent search", numericSort: { column: "Amount", direction } });
      assert.equal(absent.total, 0);
    }
    const other = await imports.createImport({ name: "Other calendar import", filename: "other.csv" });
    await pool.query("INSERT INTO data_rows(id,import_id,json_data) VALUES($1,$2,$3::jsonb)", ["date-foreign-anchor", other.id, '{"Date":"2024-02-29","Amount":"10"}']);
    for (const cursor of ["date-foreign-anchor", idFor(0), "missing-date-anchor"]) {
      const result = await query(range, { cursor, numericSort: { column: "Amount", direction: "asc" } });
      assert.deepEqual(result.rows, []);
      assert.equal(result.total, selected(range).length);
    }
    await imports.deleteImport(dataset.id);
    assert.deepEqual(await query(range), { rows: [], total: 0, nextCursorRowId: null });
    assert.deepEqual(await query(range, { cursor: idFor(20), numericSort: { column: "Amount", direction: "asc" } }), { rows: [], total: 0, nextCursorRowId: null });
  } finally {
    runtime.stopPgPoolBackgroundTasks();
    await runtime.closePostgresPools();
  }
});
