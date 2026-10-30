import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { ensureViewerFilterPresetsTable } from "../viewer-filter-presets-schema";
import { RUNTIME_REQUIRED_SCHEMA_TABLES } from "../runtime-schema-verification";
import type { CoreSchemaSqlExecutor } from "../core-schema-bootstrap-utils";

test("Viewer preset migration and local bootstrap retain owner/import foreign keys and bounded guarded JSON", async () => {
  const statements: string[] = [], dialect = new PgDialect();
  const executor = { execute: async (query: { getSQL: () => Parameters<PgDialect["sqlToQuery"]>[0] }) => {
    statements.push(dialect.sqlToQuery(query.getSQL()).sql); return { rows: [] };
  } } as unknown as CoreSchemaSqlExecutor;
  await ensureViewerFilterPresetsTable(executor);
  const migration = readFileSync(new URL("../../../drizzle/0065_viewer_filter_presets.sql", import.meta.url), "utf8");
  for (const ddl of [migration, statements.join("\n")]) {
    assert.match(ddl, /owner_user_id text NOT NULL REFERENCES public\.users\(id\) ON DELETE CASCADE ON UPDATE CASCADE/);
    assert.match(ddl, /import_id text NOT NULL REFERENCES public\.imports\(id\) ON DELETE CASCADE ON UPDATE CASCADE/);
    assert.match(ddl, /CASE WHEN jsonb_typeof\(column_filters\) = 'array' THEN jsonb_array_length\(column_filters\) <= 10 ELSE false END/);
    assert.match(ddl, /octet_length\(column_filters::text\) <= 131072/);
    assert.match(ddl, /UNIQUE INDEX IF NOT EXISTS idx_viewer_presets_owner_import_name[\s\S]*owner_user_id, import_id, lower\(name\)/);
  }
  assert.ok(RUNTIME_REQUIRED_SCHEMA_TABLES.includes("viewer_filter_presets"));
  const journal = JSON.parse(readFileSync(new URL("../../../drizzle/meta/_journal.json", import.meta.url), "utf8")) as { entries: Array<{ idx: number; tag: string }> };
  assert.equal(journal.entries[journal.entries.length - 1]?.tag, "0065_viewer_filter_presets");
  assert.equal(journal.entries[journal.entries.length - 1]?.idx, 64);
  const rollback = readFileSync(new URL("../../../scripts/db-migration-rollback.manifest.mjs", import.meta.url), "utf8");
  assert.match(rollback, /"0065_viewer_filter_presets"/);
});
