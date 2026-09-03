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
  const savedTargetsCreate = executedQueries.find((query) =>
    query.includes("CREATE TABLE IF NOT EXISTS public.collection_osp_saved_targets"),
  );
  const revisionsCreate = executedQueries.find((query) =>
    query.includes("CREATE TABLE IF NOT EXISTS public.collection_osp_target_revisions"),
  );
  const targetSourcesCreate = executedQueries.find((query) =>
    query.includes("CREATE TABLE IF NOT EXISTS public.collection_osp_target_sources"),
  );
  const targetSourceRowsCreate = executedQueries.find((query) =>
    query.includes("CREATE TABLE IF NOT EXISTS public.collection_osp_target_source_rows"),
  );
  const targetAgingRowsCreate = executedQueries.find((query) =>
    query.includes("CREATE TABLE IF NOT EXISTS public.collection_osp_target_aging_rows"),
  );
  const clientResultsCreate = executedQueries.find((query) =>
    query.includes("CREATE TABLE IF NOT EXISTS public.collection_osp_client_results"),
  );
  const reconciliationsCreate = executedQueries.find((query) =>
    query.includes("CREATE TABLE IF NOT EXISTS public.collection_osp_manual_reconciliations"),
  );
  const reconciliationAuditCreate = executedQueries.find((query) =>
    query.includes("CREATE TABLE IF NOT EXISTS public.collection_osp_manual_reconciliation_audit"),
  );
  assert.ok(configsCreate);
  assert.ok(rowsCreate);
  assert.ok(targetsCreate);
  assert.ok(savedTargetsCreate);
  assert.ok(revisionsCreate);
  assert.ok(targetSourcesCreate);
  assert.ok(targetSourceRowsCreate);
  assert.ok(targetAgingRowsCreate);
  assert.ok(clientResultsCreate);
  assert.ok(reconciliationsCreate);
  assert.ok(reconciliationAuditCreate);
  assert.doesNotMatch(configsCreate, /REFERENCES public\.(?:imports|users)/i);
  assert.doesNotMatch(rowsCreate, /REFERENCES public\.(?:imports|data_rows)/i);
  assert.doesNotMatch(targetsCreate, /REFERENCES public\.users/i);
  assert.doesNotMatch(savedTargetsCreate, /REFERENCES public\.users/i);
  assert.doesNotMatch(revisionsCreate, /REFERENCES public\.users/i);
  assert.doesNotMatch(clientResultsCreate, /REFERENCES public\.users/i);
  assert.doesNotMatch(reconciliationsCreate, /REFERENCES public\.users/i);
  assert.doesNotMatch(reconciliationAuditCreate, /REFERENCES public\.users/i);

  assert.match(rowsCreate, /card_number_last4 IS NULL OR card_number_last4 ~ '\^\[0-9\]\{4\}\$'/i);
  assert.match(
    targetSourceRowsCreate,
    /PRIMARY KEY \(target_revision_id, source_import_id, source_data_row_id\)/i,
  );
  assert.match(
    targetSourceRowsCreate,
    /FOREIGN KEY \(target_revision_id, source_import_id\) REFERENCES public\.collection_osp_target_sources/i,
  );
  assert.match(
    targetSourceRowsCreate,
    /card_number_last4 IS NULL OR card_number_last4 ~ '\^\[0-9\]\{4\}\$'/i,
  );
  assert.match(
    targetSourceRowsCreate,
    /account_number_encrypted IS NULL AND account_number_search_hash IS NULL/i,
  );
  assert.match(
    reconciliationsCreate,
    /FOREIGN KEY \(target_revision_id, source_import_id, source_data_row_id\) REFERENCES public\.collection_osp_target_source_rows/i,
  );
  assert.match(
    reconciliationsCreate,
    /card_number_last4 IS NULL OR card_number_last4 ~ '\^\[0-9\]\{4\}\$'/i,
  );
  assert.match(
    reconciliationAuditCreate,
    /to_version = from_version \+ 1/i,
  );
  assert.match(
    reconciliationAuditCreate,
    /CONSTRAINT collection_osp_manual_reconciliation_audit_reconciliation_fkey/i,
  );

  const auditAppendOnlyFunction = executedQueries.find((query) =>
    query.includes("reject_collection_osp_manual_reconciliation_audit_mutation"),
  );
  assert.ok(auditAppendOnlyFunction);
  assert.match(auditAppendOnlyFunction, /is append-only/i);
  const auditUpdateDeleteTrigger = executedQueries.find((query) =>
    query.includes("trg_collection_osp_manual_reconciliation_audit_no_update_delete")
    && query.includes("CREATE TRIGGER"),
  );
  assert.ok(auditUpdateDeleteTrigger);
  assert.match(auditUpdateDeleteTrigger, /BEFORE UPDATE OR DELETE/i);
  const auditTruncateTrigger = executedQueries.find((query) =>
    query.includes("trg_collection_osp_manual_reconciliation_audit_no_truncate")
    && query.includes("CREATE TRIGGER"),
  );
  assert.ok(auditTruncateTrigger);
  assert.match(auditTruncateTrigger, /BEFORE TRUNCATE/i);

  const cycleUniqueIndex = executedQueries.find((query) =>
    query.includes("idx_collection_osp_target_source_rows_revision_cycle_unique"),
  );
  assert.ok(cycleUniqueIndex);
  assert.match(cycleUniqueIndex, /UNIQUE INDEX/i);
  assert.match(cycleUniqueIndex, /\(target_revision_id, cycle_key\)/i);

  const exactSuffixUpgrade = executedQueries.find((query) =>
    query.includes("position('^[0-9]{4}$' in pg_get_constraintdef(oid))"),
  );
  assert.ok(exactSuffixUpgrade);
  assert.match(exactSuffixUpgrade, /ALTER TABLE public\.collection_records/i);
  assert.match(exactSuffixUpgrade, /ALTER TABLE public\.collection_source_rows/i);

  const deferredForeignKeys = executedQueries[executedQueries.length - 1] || "";
  for (const dependencyTable of [
    "public.collection_source_configs",
    "public.collection_source_rows",
    "public.collection_osp_targets",
    "public.imports",
    "public.data_rows",
    "public.users",
    "public.collection_osp_saved_targets",
    "public.collection_osp_target_revisions",
    "public.collection_osp_client_results",
    "public.collection_osp_manual_reconciliations",
    "public.collection_osp_manual_reconciliation_audit",
  ]) {
    assert.match(deferredForeignKeys, new RegExp(`to_regclass\\('${dependencyTable}'\\)`, "i"));
  }
  for (const constraintName of [
    "collection_source_configs_source_import_id_fkey",
    "collection_source_configs_configured_by_fkey",
    "collection_source_rows_source_import_id_fkey",
    "collection_source_rows_source_data_row_id_fkey",
    "collection_osp_targets_configured_by_fkey",
    "collection_osp_saved_targets_created_by_fkey",
    "collection_osp_saved_targets_updated_by_fkey",
    "collection_osp_saved_targets_deleted_by_fkey",
    "collection_osp_target_revisions_created_by_fkey",
    "collection_osp_client_results_created_by_fkey",
    "collection_osp_client_results_updated_by_fkey",
    "collection_osp_manual_reconciliations_created_by_fkey",
    "collection_osp_manual_reconciliations_updated_by_fkey",
    "collection_osp_manual_reconciliations_voided_by_fkey",
    "collection_osp_manual_recon_audit_actor_username_fkey",
  ]) {
    assert.match(deferredForeignKeys, new RegExp(`ADD CONSTRAINT ${constraintName}`, "i"));
  }
  assert.match(deferredForeignKeys, /ON DELETE CASCADE ON UPDATE CASCADE/i);
  assert.match(deferredForeignKeys, /ON DELETE RESTRICT ON UPDATE CASCADE/i);
});
