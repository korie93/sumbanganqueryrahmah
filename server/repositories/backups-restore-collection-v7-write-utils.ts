import { sql } from "drizzle-orm";
import type {
  BackupCollectionOspClientResult,
  BackupCollectionOspManualReconciliation,
  BackupCollectionOspManualReconciliationAudit,
  BackupCollectionOspSavedTarget,
  BackupCollectionOspTargetAgingRow,
  BackupCollectionOspTargetRevision,
  BackupCollectionOspTargetSource,
  BackupCollectionOspTargetSourceRow,
  RestoreStats,
} from "./backups-repository-types";
import { resolveRestoreChunkSize } from "./backups-restore-config";
import type { RestorableCollectionOspTargetSourceSnapshotRow } from "./backups-restore-collection-dataset-types";
import {
  normalizeBackupCollectionOspClientResult,
  normalizeBackupCollectionOspManualReconciliation,
  normalizeBackupCollectionOspManualReconciliationAudit,
  normalizeBackupCollectionOspSavedTarget,
  normalizeBackupCollectionOspTargetAgingRow,
  normalizeBackupCollectionOspTargetRevision,
  normalizeBackupCollectionOspTargetSource,
  normalizeBackupCollectionOspTargetSourceRow,
} from "./backups-restore-collection-v7-normalize-utils";
import type {
  BackupPayloadChunkReader,
  BackupRestoreExecutor,
} from "./backups-restore-shared-utils";
import { buildTextArraySql } from "./sql-array-utils";

const RESTORE_INSERT_BATCH_SIZE = 200;

function addInsertResult(
  stats: { inserted: number; skipped: number },
  result: { rows?: unknown[] },
  attempted = 1,
) {
  const insertedCount = result.rows?.length || 0;
  stats.inserted += insertedCount;
  stats.skipped += attempted - insertedCount;
}

export async function restoreCollectionOspSavedTargetsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  const restoreChunkSize = resolveRestoreChunkSize();
  for await (const chunk of backupDataReader.iterateArrayChunks<BackupCollectionOspSavedTarget>(
    "collectionOspSavedTargets",
    restoreChunkSize,
  )) {
    for (const record of chunk) {
      const row = normalizeBackupCollectionOspSavedTarget(record);
      if (!row) {
        stats.collectionOspSavedTargets.skipped += 1;
        continue;
      }
      stats.collectionOspSavedTargets.processed += 1;
      const result = await tx.execute(sql`
        INSERT INTO public.collection_osp_saved_targets (
          id, target_name, normalized_name, description, status, version, assigned_admin_user_id,
          created_by, created_at, updated_by, updated_at, deleted_by, deleted_at
        )
        SELECT
          ${row.id}::uuid, ${row.targetName}, ${row.normalizedName}, ${row.description},
          ${row.status}, ${row.version}, ${row.assignedAdminUserId}::text, created_actor.username, ${row.createdAt},
          updated_actor.username, ${row.updatedAt}, deleted_actor.username, ${row.deletedAt}
        FROM public.users created_actor
        JOIN public.users updated_actor
          ON lower(updated_actor.username) = lower(${row.updatedBy})
        LEFT JOIN public.users deleted_actor
          ON ${row.deletedBy}::text IS NOT NULL
         AND lower(deleted_actor.username) = lower(${row.deletedBy})
        WHERE lower(created_actor.username) = lower(${row.createdBy})
          AND (${row.status} = 'ACTIVE' OR deleted_actor.username IS NOT NULL)
          AND (${row.assignedAdminUserId}::text IS NULL OR EXISTS (
            SELECT 1 FROM public.users assigned_admin WHERE assigned_admin.id = ${row.assignedAdminUserId}::text
          ))
        ON CONFLICT DO NOTHING
        RETURNING id
      `);
      addInsertResult(stats.collectionOspSavedTargets, result);
    }
  }
}

export async function restoreCollectionOspTargetRevisionsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  const restoreChunkSize = resolveRestoreChunkSize();
  for await (const chunk of backupDataReader.iterateArrayChunks<BackupCollectionOspTargetRevision>(
    "collectionOspTargetRevisions",
    restoreChunkSize,
  )) {
    for (const record of chunk) {
      const row = normalizeBackupCollectionOspTargetRevision(record);
      if (!row) {
        stats.collectionOspTargetRevisions.skipped += 1;
        continue;
      }
      stats.collectionOspTargetRevisions.processed += 1;
      const result = await tx.execute(sql`
        INSERT INTO public.collection_osp_target_revisions (
          id, target_id, revision_number, source_scope_hash, period_from, period_to,
          tracking_start_date, tracking_end_date, timezone, nickname_scope, aging_scope,
          calculation_version, created_by, created_at
        )
        SELECT
          ${row.id}::uuid, target.id, ${row.revisionNumber}, ${row.sourceScopeHash},
          ${row.periodFrom}::date, ${row.periodTo}::date, ${row.trackingStartDate}::date,
          ${row.trackingEndDate}::date, ${row.timezone}, ${buildTextArraySql(row.nicknameScope)},
          ${buildTextArraySql(row.agingScope)}, ${row.calculationVersion}, actor.username,
          ${row.createdAt}
        FROM public.collection_osp_saved_targets target
        JOIN public.users actor
          ON lower(actor.username) = lower(${row.createdBy})
        WHERE target.id = ${row.targetId}::uuid
        ON CONFLICT DO NOTHING
        RETURNING id
      `);
      addInsertResult(stats.collectionOspTargetRevisions, result);
    }
  }
}

export async function restoreCollectionOspTargetSourcesFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  const restoreChunkSize = resolveRestoreChunkSize();
  for await (const chunk of backupDataReader.iterateArrayChunks<BackupCollectionOspTargetSource>(
    "collectionOspTargetSources",
    restoreChunkSize,
  )) {
    for (const record of chunk) {
      const row = normalizeBackupCollectionOspTargetSource(record);
      if (!row) {
        stats.collectionOspTargetSources.skipped += 1;
        continue;
      }
      stats.collectionOspTargetSources.processed += 1;
      const result = await tx.execute(sql`
        INSERT INTO public.collection_osp_target_sources (
          target_revision_id, source_import_id, source_name_snapshot,
          source_filename_snapshot, source_version_snapshot,
          source_content_hash_snapshot, created_at
        )
        SELECT
          revision.id, ${row.sourceImportId}, ${row.sourceNameSnapshot},
          ${row.sourceFilenameSnapshot}, ${row.sourceVersionSnapshot},
          ${row.sourceContentHashSnapshot}, ${row.createdAt}
        FROM public.collection_osp_target_revisions revision
        WHERE revision.id = ${row.targetRevisionId}::uuid
        ON CONFLICT DO NOTHING
        RETURNING source_import_id
      `);
      addInsertResult(stats.collectionOspTargetSources, result);
    }
  }
}

export async function restoreCollectionOspTargetSourceRowsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  const restoreChunkSize = resolveRestoreChunkSize();
  const flushBatch = async (insertBatch: RestorableCollectionOspTargetSourceSnapshotRow[]) => {
    if (!insertBatch.length) return;
    const valuesSql = sql.join(insertBatch.map((row) => sql`(
      ${row.targetRevisionId}::uuid, ${row.sourceImportId}, ${row.sourceDataRowId},
      ${row.canonicalObligationKey}, ${row.cycleKey}, ${row.accountNumberEncrypted},
      ${row.accountNumberSearchHash}, ${row.cardNumberLast4}, ${row.customerNameEncrypted},
      ${row.cardNumberEncrypted}, ${row.identificationNumberEncrypted}, ${row.phoneEncrypted},
      ${row.customerNameSearchHashes === null ? null : buildTextArraySql(row.customerNameSearchHashes)}::text[],
      ${row.agingBucket}, ${row.callingDate}::date, ${row.callingWindowEndExclusive}::date,
      ${row.totalDue}::numeric(16,2), ${row.billingPrincipalOsp}::numeric(16,2), ${row.createdAt}::timestamptz
    )`), sql`, `);
    const result = await tx.execute(sql`
      INSERT INTO public.collection_osp_target_source_rows (
        target_revision_id, source_import_id, source_data_row_id,
        canonical_obligation_key, cycle_key, account_number_encrypted,
        account_number_search_hash, card_number_last4, customer_name_encrypted,
        card_number_encrypted, identification_number_encrypted, phone_encrypted,
        customer_name_search_hashes, aging_bucket, calling_date,
        calling_window_end_exclusive, total_due, billing_principal_osp, created_at
      )
      SELECT candidate.*
      FROM (VALUES ${valuesSql}) AS candidate(
        target_revision_id, source_import_id, source_data_row_id,
        canonical_obligation_key, cycle_key, account_number_encrypted,
        account_number_search_hash, card_number_last4, customer_name_encrypted,
        card_number_encrypted, identification_number_encrypted, phone_encrypted,
        customer_name_search_hashes, aging_bucket, calling_date,
        calling_window_end_exclusive, total_due, billing_principal_osp, created_at
      )
      JOIN public.collection_osp_target_sources source
        ON source.target_revision_id = candidate.target_revision_id
       AND source.source_import_id = candidate.source_import_id
      ON CONFLICT DO NOTHING
      RETURNING source_data_row_id
    `);
    addInsertResult(stats.collectionOspTargetSourceRows, result, insertBatch.length);
  };

  for await (const chunk of backupDataReader.iterateArrayChunks<BackupCollectionOspTargetSourceRow>(
    "collectionOspTargetSourceRows",
    restoreChunkSize,
  )) {
    const pending: RestorableCollectionOspTargetSourceSnapshotRow[] = [];
    for (const record of chunk) {
      const row = normalizeBackupCollectionOspTargetSourceRow(record);
      if (!row) {
        stats.collectionOspTargetSourceRows.skipped += 1;
        continue;
      }
      stats.collectionOspTargetSourceRows.processed += 1;
      pending.push(row);
      if (pending.length >= RESTORE_INSERT_BATCH_SIZE) {
        await flushBatch(pending);
        pending.length = 0;
      }
    }
    await flushBatch(pending);
  }
}

export async function restoreCollectionOspTargetAgingRowsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  const restoreChunkSize = resolveRestoreChunkSize();
  for await (const chunk of backupDataReader.iterateArrayChunks<BackupCollectionOspTargetAgingRow>(
    "collectionOspTargetAgingRows",
    restoreChunkSize,
  )) {
    for (const record of chunk) {
      const row = normalizeBackupCollectionOspTargetAgingRow(record);
      if (!row) {
        stats.collectionOspTargetAgingRows.skipped += 1;
        continue;
      }
      stats.collectionOspTargetAgingRows.processed += 1;
      const result = await tx.execute(sql`
        INSERT INTO public.collection_osp_target_aging_rows (
          target_revision_id, aging_bucket, total_osp_baseline,
          target_percentage, target_osp, created_at
        )
        SELECT
          revision.id, ${row.agingBucket}, ${row.totalOspBaseline}::numeric(16,2),
          ${row.targetPercentage}::numeric(7,4), ${row.targetOsp}::numeric(16,2),
          ${row.createdAt}
        FROM public.collection_osp_target_revisions revision
        WHERE revision.id = ${row.targetRevisionId}::uuid
        ON CONFLICT DO NOTHING
        RETURNING target_revision_id
      `);
      addInsertResult(stats.collectionOspTargetAgingRows, result);
    }
  }
}

export async function restoreCollectionOspClientResultsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  const restoreChunkSize = resolveRestoreChunkSize();
  for await (const chunk of backupDataReader.iterateArrayChunks<BackupCollectionOspClientResult>(
    "collectionOspClientResults",
    restoreChunkSize,
  )) {
    for (const record of chunk) {
      const row = normalizeBackupCollectionOspClientResult(record);
      if (!row) {
        stats.collectionOspClientResults.skipped += 1;
        continue;
      }
      stats.collectionOspClientResults.processed += 1;
      const result = await tx.execute(sql`
        INSERT INTO public.collection_osp_client_results (
          id, target_id, target_revision_id, as_of_date, aging_bucket,
          result_percentage, osp_closed, client_reference, note, version,
          created_by, created_at, updated_by, updated_at
        )
        SELECT
          ${row.id}::uuid, revision.target_id, revision.id, ${row.asOfDate}::date,
          ${row.agingBucket}, ${row.resultPercentage}::numeric(9,4),
          ${row.ospClosed}::numeric(16,2), ${row.clientReference}, ${row.note},
          ${row.version}, created_actor.username, ${row.createdAt},
          updated_actor.username, ${row.updatedAt}
        FROM public.collection_osp_target_revisions revision
        JOIN public.users created_actor
          ON lower(created_actor.username) = lower(${row.createdBy})
        JOIN public.users updated_actor
          ON lower(updated_actor.username) = lower(${row.updatedBy})
        WHERE revision.id = ${row.targetRevisionId}::uuid
          AND revision.target_id = ${row.targetId}::uuid
        ON CONFLICT DO NOTHING
        RETURNING id
      `);
      addInsertResult(stats.collectionOspClientResults, result);
    }
  }
}

export async function restoreCollectionOspManualReconciliationsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  const restoreChunkSize = resolveRestoreChunkSize();
  for await (const chunk of backupDataReader.iterateArrayChunks<BackupCollectionOspManualReconciliation>(
    "collectionOspManualReconciliations",
    restoreChunkSize,
  )) {
    for (const record of chunk) {
      const row = normalizeBackupCollectionOspManualReconciliation(record);
      if (!row) {
        stats.collectionOspManualReconciliations.skipped += 1;
        continue;
      }
      stats.collectionOspManualReconciliations.processed += 1;
      const result = await tx.execute(sql`
        INSERT INTO public.collection_osp_manual_reconciliations (
          id, target_id, target_revision_id, source_import_id, source_data_row_id,
          canonical_obligation_key, cycle_key, account_number_encrypted,
          account_number_search_hash, card_number_last4, customer_name_encrypted,
          aging_bucket, calling_date, calling_window_end_exclusive,
          total_due, billing_principal_osp, manual_prior_amount,
          manual_as_of_date, actual_payment_date, date_source, reason_code,
          note, evidence_reference, status, version,
          created_by, created_at, updated_by, updated_at,
          voided_by, voided_at, void_reason
        )
        SELECT
          ${row.id}::uuid, revision.target_id, revision.id,
          source_row.source_import_id, source_row.source_data_row_id,
          source_row.canonical_obligation_key, source_row.cycle_key,
          source_row.account_number_encrypted, source_row.account_number_search_hash,
          source_row.card_number_last4, source_row.customer_name_encrypted,
          source_row.aging_bucket, source_row.calling_date,
          source_row.calling_window_end_exclusive, source_row.total_due,
          source_row.billing_principal_osp, ${row.manualPriorAmount}::numeric(16,2),
          ${row.manualAsOfDate}::date, ${row.actualPaymentDate}::date,
          ${row.dateSource}, ${row.reasonCode}, ${row.note}, ${row.evidenceReference},
          ${row.status}, ${row.version}, created_actor.username, ${row.createdAt},
          updated_actor.username, ${row.updatedAt}, voided_actor.username,
          ${row.voidedAt}, ${row.voidReason}
        FROM public.collection_osp_target_revisions revision
        JOIN public.collection_osp_target_source_rows source_row
          ON source_row.target_revision_id = revision.id
         AND source_row.source_import_id = ${row.sourceImportId}
         AND source_row.source_data_row_id = ${row.sourceDataRowId}
        JOIN public.users created_actor
          ON lower(created_actor.username) = lower(${row.createdBy})
        JOIN public.users updated_actor
          ON lower(updated_actor.username) = lower(${row.updatedBy})
        LEFT JOIN public.users voided_actor
          ON ${row.voidedBy}::text IS NOT NULL
         AND lower(voided_actor.username) = lower(${row.voidedBy})
        WHERE revision.id = ${row.targetRevisionId}::uuid
          AND revision.target_id = ${row.targetId}::uuid
          AND source_row.canonical_obligation_key = ${row.canonicalObligationKey}
          AND source_row.cycle_key = ${row.cycleKey}
          AND source_row.account_number_search_hash IS NOT DISTINCT FROM ${row.accountNumberSearchHash}
          AND source_row.card_number_last4 IS NOT DISTINCT FROM ${row.cardNumberLast4}
          AND source_row.customer_name_search_hashes IS NOT DISTINCT FROM ${
            row.customerNameSearchHashes === null
              ? null
              : buildTextArraySql(row.customerNameSearchHashes)
          }
          AND source_row.aging_bucket = ${row.agingBucket}
          AND source_row.calling_date = ${row.callingDate}::date
          AND source_row.calling_window_end_exclusive = ${row.callingWindowEndExclusive}::date
          AND source_row.total_due = ${row.totalDue}::numeric(16,2)
          AND source_row.billing_principal_osp = ${row.billingPrincipalOsp}::numeric(16,2)
          AND (${row.status} = 'ACTIVE' OR voided_actor.username IS NOT NULL)
        ON CONFLICT DO NOTHING
        RETURNING id
      `);
      addInsertResult(stats.collectionOspManualReconciliations, result);
    }
  }
}

export async function restoreCollectionOspManualReconciliationAuditFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  const restoreChunkSize = resolveRestoreChunkSize();
  for await (const chunk of backupDataReader.iterateArrayChunks<BackupCollectionOspManualReconciliationAudit>(
    "collectionOspManualReconciliationAudit",
    restoreChunkSize,
  )) {
    for (const record of chunk) {
      const row = normalizeBackupCollectionOspManualReconciliationAudit(record);
      if (!row) {
        stats.collectionOspManualReconciliationAudit.skipped += 1;
        continue;
      }
      stats.collectionOspManualReconciliationAudit.processed += 1;
      const result = await tx.execute(sql`
        INSERT INTO public.collection_osp_manual_reconciliation_audit (
          id, reconciliation_id, target_id, target_revision_id, operation,
          from_version, to_version, before_state, after_state,
          actor_username, actor_role, request_id, created_at
        )
        SELECT
          ${row.id}::uuid, reconciliation.id, reconciliation.target_id,
          reconciliation.target_revision_id, ${row.operation}, ${row.fromVersion},
          ${row.toVersion}, ${row.beforeState}::jsonb, ${row.afterState}::jsonb,
          actor.username, ${row.actorRole}, ${row.requestId}, ${row.createdAt}
        FROM public.collection_osp_manual_reconciliations reconciliation
        JOIN public.collection_osp_target_revisions revision
          ON revision.id = reconciliation.target_revision_id
         AND revision.target_id = reconciliation.target_id
        JOIN public.users actor
          ON lower(actor.username) = lower(${row.actorUsername})
         AND actor.role = 'superuser'
        WHERE reconciliation.id = ${row.reconciliationId}::uuid
          AND reconciliation.target_id = ${row.targetId}::uuid
          AND reconciliation.target_revision_id = ${row.targetRevisionId}::uuid
        ON CONFLICT DO NOTHING
        RETURNING id
      `);
      addInsertResult(stats.collectionOspManualReconciliationAudit, result);
    }
  }
}
