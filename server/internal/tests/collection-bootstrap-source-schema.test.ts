import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureCollectionSourceGovernanceSchema,
} from "../collection-bootstrap-source-schema";
import type { BootstrapSqlExecutor } from "../collection-bootstrap-records-shared";

function flattenSqlChunk(chunk: unknown): string {
  if (chunk === null || chunk === undefined) return "";
  if (typeof chunk === "string") return chunk;
  if (Array.isArray(chunk)) return chunk.map(flattenSqlChunk).join("");
  if (typeof chunk === "object") {
    const value = (chunk as { value?: unknown }).value;
    if (value !== undefined) return flattenSqlChunk(value);
    const queryChunks = (chunk as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(queryChunks)) return queryChunks.map(flattenSqlChunk).join("");
  }
  return "";
}

function normalizeSqlText(query: unknown): string {
  return flattenSqlChunk(query).replace(/\s+/g, " ").trim();
}

test("collection source bootstrap defers dependency foreign keys safely", async () => {
  const executedQueries: string[] = [];
  const executor = {
    execute: ((query: unknown) => {
      executedQueries.push(normalizeSqlText(query));
      return { rows: [] } as unknown as ReturnType<BootstrapSqlExecutor["execute"]>;
    }) as BootstrapSqlExecutor["execute"],
  } satisfies BootstrapSqlExecutor;

  await ensureCollectionSourceGovernanceSchema(executor);

  const configsCreate = executedQueries.find((query) =>
    query.includes("CREATE TABLE IF NOT EXISTS public.collection_source_configs"),
  );
  const rowsCreate = executedQueries.find((query) =>
    query.includes("CREATE TABLE IF NOT EXISTS public.collection_source_rows"),
  );
  const targetsCreate = executedQueries.find((query) =>
    query.includes("CREATE TABLE IF NOT EXISTS public.collection_osp_targets"),
  );
  assert.ok(configsCreate);
  assert.ok(rowsCreate);
  assert.ok(targetsCreate);
  assert.doesNotMatch(configsCreate, /REFERENCES public\.(?:imports|users)/i);
  assert.doesNotMatch(rowsCreate, /REFERENCES public\.(?:imports|data_rows)/i);
  assert.doesNotMatch(targetsCreate, /REFERENCES public\.users/i);

  const deferredForeignKeys = executedQueries[executedQueries.length - 1] || "";
  for (const dependencyTable of [
    "public.collection_source_configs",
    "public.collection_source_rows",
    "public.collection_osp_targets",
    "public.imports",
    "public.data_rows",
    "public.users",
  ]) {
    assert.match(deferredForeignKeys, new RegExp(`to_regclass\\('${dependencyTable}'\\)`, "i"));
  }
  for (const constraintName of [
    "collection_source_configs_source_import_id_fkey",
    "collection_source_configs_configured_by_fkey",
    "collection_source_rows_source_import_id_fkey",
    "collection_source_rows_source_data_row_id_fkey",
    "collection_osp_targets_configured_by_fkey",
  ]) {
    assert.match(deferredForeignKeys, new RegExp(`ADD CONSTRAINT ${constraintName}`, "i"));
  }
  assert.match(deferredForeignKeys, /ON DELETE CASCADE ON UPDATE CASCADE/i);
  assert.match(deferredForeignKeys, /ON DELETE RESTRICT ON UPDATE CASCADE/i);
});
