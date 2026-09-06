import { sql } from "drizzle-orm";
import type {
  BackupCollectionOspTarget,
  BackupCollectionSourceConfig,
  BackupCollectionSourceRow,
  RestoreStats,
} from "./backups-repository-types";
import { resolveRestoreChunkSize } from "./backups-restore-config";
import {
  normalizeBackupCollectionOspTarget,
  normalizeBackupCollectionSourceConfig,
  normalizeBackupCollectionSourceRow,
} from "./backups-restore-collection-normalize-utils";
import type {
  RestorableCollectionOspTargetRow,
  RestorableCollectionSourceRow,
} from "./backups-restore-collection-dataset-types";
import type {
  BackupPayloadChunkReader,
  BackupRestoreExecutor,
} from "./backups-restore-shared-utils";
import { buildTextArraySql } from "./sql-array-utils";

const RESTORE_INSERT_BATCH_SIZE = 200;
export async function restoreCollectionSourceConfigsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  const restoreChunkSize = resolveRestoreChunkSize();
  for await (const chunk of backupDataReader.iterateArrayChunks<BackupCollectionSourceConfig>(
    "collectionSourceConfigs",
    restoreChunkSize,
  )) {
    for (const record of chunk) {
      const row = normalizeBackupCollectionSourceConfig(record);
      if (!row) {
        stats.collectionSourceConfigs.skipped += 1;
        continue;
      }

      stats.collectionSourceConfigs.processed += 1;
      const insertedResult = await tx.execute(sql`
        INSERT INTO public.collection_source_configs (
          source_import_id,
          valid_from,
          valid_to,
          cycle_key,
          enabled,
          compatibility_status,
          compatibility_issues,
          indexed_row_count,
          configured_by,
          created_at,
          updated_at
        )
        SELECT
          ${row.sourceImportId},
          ${row.validFrom}::date,
          ${row.validTo}::date,
          ${row.cycleKey},
          ${row.enabled},
          ${row.compatibilityStatus},
          ${buildTextArraySql(row.compatibilityIssues)},
          ${row.indexedRowCount},
          actor.username,
          ${row.createdAt},
          ${row.updatedAt}
        FROM LATERAL (
          SELECT usr.username
          FROM public.users usr
          ORDER BY
            CASE
              WHEN lower(usr.username) = lower(${row.configuredBy}) THEN 0
              WHEN lower(usr.username) = 'system' THEN 1
              ELSE 2
            END,
            usr.username ASC
          LIMIT 1
        ) actor
        WHERE EXISTS (
          SELECT 1
          FROM public.imports imp
          WHERE imp.id = ${row.sourceImportId}
            AND imp.is_deleted = false
        )
        ON CONFLICT (source_import_id) DO NOTHING
        RETURNING source_import_id
      `);
      const insertedCount = insertedResult.rows?.length || 0;
      stats.collectionSourceConfigs.inserted += insertedCount;
      stats.collectionSourceConfigs.skipped += 1 - insertedCount;
    }
  }
}

export async function restoreCollectionSourceRowsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  const restoreChunkSize = resolveRestoreChunkSize();
  const flushBatch = async (insertBatch: RestorableCollectionSourceRow[]) => {
    if (!insertBatch.length) return;

    const valuesSql = sql.join(
      insertBatch.map((row) => sql`(
        ${row.sourceImportId},
        ${row.sourceDataRowId},
        ${row.accountNumberHash},
        ${row.cardNumberHash},
        ${row.cardNumberLast4},
        ${row.canonicalObligationKey},
        ${row.totalDue}::numeric,
        ${row.billingPrincipalOsp}::numeric,
        ${row.totalOsb}::numeric,
        ${row.agingBucket},
        ${row.callingDate}::date,
        ${row.createdAt}::timestamptz
      )`),
      sql`, `,
    );
    const insertedResult = await tx.execute(sql`
      INSERT INTO public.collection_source_rows (
        source_import_id,
        source_data_row_id,
        account_number_hash,
        card_number_hash,
        card_number_last4,
        canonical_obligation_key,
        total_due,
        billing_principal_osp,
        total_osb,
        aging_bucket,
        calling_date,
        created_at
      )
      SELECT
        candidate.source_import_id,
        candidate.source_data_row_id,
        candidate.account_number_hash,
        candidate.card_number_hash,
        candidate.card_number_last4,
        candidate.canonical_obligation_key,
        candidate.total_due,
        candidate.billing_principal_osp,
        candidate.total_osb,
        candidate.aging_bucket,
        candidate.calling_date,
        candidate.created_at
      FROM (VALUES ${valuesSql}) AS candidate(
        source_import_id,
        source_data_row_id,
        account_number_hash,
        card_number_hash,
        card_number_last4,
        canonical_obligation_key,
        total_due,
        billing_principal_osp,
        total_osb,
        aging_bucket,
        calling_date,
        created_at
      )
      JOIN public.collection_source_configs config
        ON config.source_import_id = candidate.source_import_id
      JOIN public.data_rows source_row
        ON source_row.id = candidate.source_data_row_id
       AND source_row.import_id = candidate.source_import_id
      ON CONFLICT (source_import_id, source_data_row_id) DO NOTHING
      RETURNING source_data_row_id
    `);
    const insertedCount = insertedResult.rows?.length || 0;
    stats.collectionSourceRows.inserted += insertedCount;
    stats.collectionSourceRows.skipped += insertBatch.length - insertedCount;
  };

  for await (const chunk of backupDataReader.iterateArrayChunks<BackupCollectionSourceRow>(
    "collectionSourceRows",
    restoreChunkSize,
  )) {
    const pendingBatch: RestorableCollectionSourceRow[] = [];
    for (const record of chunk) {
      const normalized = normalizeBackupCollectionSourceRow(record);
      if (!normalized) {
        stats.collectionSourceRows.skipped += 1;
        continue;
      }
      stats.collectionSourceRows.processed += 1;
      pendingBatch.push(normalized);
      if (pendingBatch.length >= RESTORE_INSERT_BATCH_SIZE) {
        await flushBatch(pendingBatch);
        pendingBatch.length = 0;
      }
    }
    await flushBatch(pendingBatch);
  }

  await tx.execute(sql`
    UPDATE public.collection_source_configs config
    SET indexed_row_count = (
      SELECT COUNT(*)::integer
      FROM public.collection_source_rows source_row
      WHERE source_row.source_import_id = config.source_import_id
    )
  `);
}

export async function restoreCollectionOspTargetsFromBackup(
  tx: BackupRestoreExecutor,
  backupDataReader: BackupPayloadChunkReader,
  stats: RestoreStats,
) {
  const restoreChunkSize = resolveRestoreChunkSize();
  const flushBatch = async (insertBatch: RestorableCollectionOspTargetRow[]) => {
    if (!insertBatch.length) return;

    const valuesSql = sql.join(
      insertBatch.map((row) => sql`(
        ${row.id}::uuid,
        ${row.sourceScopeHash},
        ${buildTextArraySql(row.sourceImportIds)},
        ${row.periodFrom}::date,
        ${row.periodTo}::date,
        ${row.agingBucket},
        ${row.totalOspBaseline}::numeric,
        ${row.targetPercentage}::numeric,
        ${row.configuredBy},
        ${row.createdAt}::timestamptz,
        ${row.updatedAt}::timestamptz
      )`),
      sql`, `,
    );
    const insertedResult = await tx.execute(sql`
      INSERT INTO public.collection_osp_targets (
        id,
        source_scope_hash,
        source_import_ids,
        period_from,
        period_to,
        aging_bucket,
        total_osp_baseline,
        target_percentage,
        configured_by,
        created_at,
        updated_at
      )
      SELECT
        candidate.id,
        candidate.source_scope_hash,
        candidate.source_import_ids,
        candidate.period_from,
        candidate.period_to,
        candidate.aging_bucket,
        candidate.total_osp_baseline,
        candidate.target_percentage,
        actor.username,
        candidate.created_at,
        candidate.updated_at
      FROM (VALUES ${valuesSql}) AS candidate(
        id,
        source_scope_hash,
        source_import_ids,
        period_from,
        period_to,
        aging_bucket,
        total_osp_baseline,
        target_percentage,
        configured_by,
        created_at,
        updated_at
      )
      CROSS JOIN LATERAL (
        SELECT usr.username
        FROM public.users usr
        ORDER BY
          CASE
            WHEN lower(usr.username) = lower(candidate.configured_by) THEN 0
            WHEN lower(usr.username) = 'system' THEN 1
            ELSE 2
          END,
          usr.username ASC
        LIMIT 1
      ) actor
      WHERE NOT EXISTS (
        SELECT 1
        FROM unnest(candidate.source_import_ids) source_id
        LEFT JOIN public.collection_source_configs config
          ON config.source_import_id = source_id
        WHERE config.source_import_id IS NULL
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    const insertedCount = insertedResult.rows?.length || 0;
    stats.collectionOspTargets.inserted += insertedCount;
    stats.collectionOspTargets.skipped += insertBatch.length - insertedCount;
  };

  for await (const chunk of backupDataReader.iterateArrayChunks<BackupCollectionOspTarget>(
    "collectionOspTargets",
    restoreChunkSize,
  )) {
    const pendingBatch: RestorableCollectionOspTargetRow[] = [];
    for (const record of chunk) {
      const normalized = normalizeBackupCollectionOspTarget(record);
      if (!normalized) {
        stats.collectionOspTargets.skipped += 1;
        continue;
      }
      stats.collectionOspTargets.processed += 1;
      pendingBatch.push(normalized);
      if (pendingBatch.length >= RESTORE_INSERT_BATCH_SIZE) {
        await flushBatch(pendingBatch);
        pendingBatch.length = 0;
      }
    }
    await flushBatch(pendingBatch);
  }
}
