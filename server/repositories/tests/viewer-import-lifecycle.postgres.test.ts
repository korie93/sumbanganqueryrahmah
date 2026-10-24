import assert from "node:assert/strict";
import test from "node:test";
import type { SearchImportRowsInput } from "../../services/imports-service-types";

test("Viewer rows, counts and headers follow the parent import lifecycle", {
  skip: process.env.SQR_AUTH_ISOLATED_CLUSTER !== "1",
}, async () => {
  assert.equal(process.env.PG_HOST, "127.0.0.1");
  assert.equal(process.env.PG_DATABASE, "sqr_auth_recovery_test");
  assert.equal(process.env.PG_USER, "sqr_fixture");
  assert.equal(Object.prototype.hasOwnProperty.call(process.env, "DATABASE_URL"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(process.env, "DATABASE_READ_REPLICA_URL"), false);
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
    const { SearchRepository, MAX_SEARCH_OFFSET } = await import("../search.repository");
    const { ImportsServiceReadOperations } = await import("../../services/imports-service-read-operations");
    const imports = new ImportsRepository();
    const search = new SearchRepository();
    const reads = new ImportsServiceReadOperations({
      getImportById: imports.getImportById.bind(imports),
      getDataRowsByImport: imports.getDataRowsByImport.bind(imports),
      searchDataRows: search.searchDataRows.bind(search),
    } as never, imports, {} as never);
    const removed = await imports.createImport({ name: "Removed fixture", filename: "removed.csv" });
    const active = await imports.createImport({ name: "Active fixture", filename: "active.csv" });
    await imports.createDataRows(Array.from({ length: 11 }, (_, ordinal) => ({
      importId: removed.id, jsonDataJsonb: { marker: "fixturelifecycle", ordinal },
    })));
    await imports.createDataRow({ importId: active.id, jsonDataJsonb: { marker: "activefixture" } });
    const pageInput = { importId: removed.id, page: 1, requestedLimit: 10,
      viewerRowsPerPage: 10, isDbProtected: false };
    const before = await reads.getImportDataPage(pageInput);
    assert.equal(before.rows.length, 10);
    assert.equal(before.total, 11);
    assert.deepEqual(before.headers, ["marker", "ordinal"]);
    assert.ok(before.nextCursor);
    assert.equal((await reads.searchImportRows({ importId: removed.id, limit: 1, offset: 0 })).total, 11);
    assert.equal(await imports.getDataRowCountByImport(removed.id), 11);
    assert.equal((await imports.getDataRowsByImportPage(removed.id, 2, 0)).length, 2);

    await imports.deleteImport(removed.id);
    assert.equal(await imports.getImportById(removed.id), undefined);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM data_rows WHERE import_id=$1", [removed.id])).rows[0].count, 11,
      "Soft deletion retains the fixture children; denial must come from query-time lifecycle checks");
    const deletedQueries: SearchImportRowsInput[] = [
      { importId: removed.id, limit: 1, offset: 0 },
      { importId: removed.id, limit: 1, offset: 1 },
      { importId: removed.id, limit: 1, offset: MAX_SEARCH_OFFSET + 1 },
      { importId: removed.id, limit: 1, offset: 0, columnFilters: [{ column: "marker", operator: "equals", value: "fixturelifecycle" }] },
    ];
    for (const query of deletedQueries) {
      assert.deepEqual(await reads.searchImportRows(query), { rows: [], total: 0, nextCursorRowId: null });
    }
    for (const input of [pageInput, { ...pageInput, cursor: before.nextCursor }]) {
      const after = await reads.getImportDataPage(input);
      assert.deepEqual(after.rows, []);
      assert.deepEqual(after.headers, []);
      assert.equal(after.total, 0);
      assert.equal(after.nextCursor, null);
    }
    assert.deepEqual(await imports.getImportColumnNames(removed.id), []);
    assert.deepEqual(await imports.getDataRowsByImport(removed.id), []);
    assert.deepEqual(await imports.getDataRowsByImportPage(removed.id, 10, 0), []);
    assert.deepEqual(await imports.getDataRowsByImportPageAfterId(removed.id, 10, before.rows[0].id), []);
    assert.equal(await imports.getDataRowCountByImport(removed.id), 0);
    assert.equal((await reads.searchImportRows({ importId: active.id, limit: 10, offset: 0 })).rows.length, 1);
    assert.deepEqual(await imports.getImportColumnNames(active.id), ["marker"]);
    assert.equal((await reads.getImportDataPage({ ...pageInput, importId: active.id })).total, 1);
    assert.deepEqual(await reads.searchImportRows({ importId: "missing-fixture", limit: 10, offset: 0 }),
      { rows: [], total: 0, nextCursorRowId: null });
  } finally {
    runtime.stopPgPoolBackgroundTasks();
    await runtime.closePostgresPools();
  }
});
