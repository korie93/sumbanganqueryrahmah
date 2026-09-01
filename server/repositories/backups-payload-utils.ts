import crypto from "crypto";
import { createWriteStream, promises as fs } from "node:fs";
import { sql } from "drizzle-orm";
import type {
  AuditLog,
  DataRow,
  Import,
} from "../../shared/schema-postgres";
import {
  QUERY_PAGE_LIMIT,
  type BackupCollectionOspTarget,
  type BackupCollectionReceipt,
  type BackupCollectionRecord,
  type BackupCollectionRecordPurgeHistory,
  type BackupCollectionSourceConfig,
  type BackupCollectionSourceRow,
  type BackupUserRecord,
  type PreparedBackupPayloadFile,
} from "./backups-repository-types";
import {
  createBackupPayloadCipher,
  createBackupPayloadStoragePrefix,
  type BackupEncryptionConfig,
} from "./backups-encryption";
import { buildProtectedCollectionPiiSelect } from "./collection-pii-select-utils";
import {
  closeBackupWriter,
  createBackupTempFile,
  destroyBackupWriterAfterFailure,
  type PreparedBackupWriteState,
  writeBackupChunk,
  writeBackupStreamChunk,
} from "./backups-payload-file-utils";
import {
  type BackupCursorRow,
  safeSelectBackupRows,
  selectBackupRows,
} from "./backups-payload-db-utils";
import { mapBackupCollectionRecordRow } from "./backups-payload-collection-utils";
import {
  appendPagedJsonArray,
  createEmptyBackupPayloadCounts,
} from "./backups-payload-write-utils";
export {
  createBackupPayloadChunkReader,
  createBackupPayloadSectionReader,
} from "./backups-payload-reader-utils";

export {
  iteratePreparedBackupPayloadStorageChunks,
  readPreparedBackupPayloadForStorage,
} from "./backups-payload-file-utils";

export async function prepareBackupPayloadFileForCreate(
  backupEncryption?: BackupEncryptionConfig,
): Promise<PreparedBackupPayloadFile> {
  const { tempDirPath, tempFilePath } = await createBackupTempFile();
  const primaryEncryptionKeyId = backupEncryption?.primaryKeyId ?? null;
  const primaryEncryptionKey = primaryEncryptionKeyId
    ? backupEncryption?.keysById.get(primaryEncryptionKeyId) ?? null
    : null;
  const tempPayloadEncrypted = Boolean(primaryEncryptionKeyId && primaryEncryptionKey);
  const iv = tempPayloadEncrypted ? crypto.randomBytes(12) : null;
  const cipher = tempPayloadEncrypted && primaryEncryptionKeyId && primaryEncryptionKey && iv
    ? createBackupPayloadCipher(primaryEncryptionKeyId, primaryEncryptionKey, iv)
    : undefined;
  const writer = createWriteStream(tempFilePath, {
    flags: "wx",
    mode: 0o600,
    ...(tempPayloadEncrypted ? {} : { encoding: "utf8" as const }),
  });
  const state: PreparedBackupWriteState = {
    writer,
    hash: crypto.createHash("sha256"),
    maxSerializedRowBytes: 0,
    ...(cipher ? { cipher } : {}),
  };
  const counts = createEmptyBackupPayloadCounts();

  const cleanup = async () => {
    await fs.rm(tempDirPath, { recursive: true, force: true });
  };

  try {
    await writeBackupChunk(state, "{");

    counts.importsCount = await appendPagedJsonArray(state, "imports", (lastId) =>
      selectBackupRows<Import & BackupCursorRow>(sql`
        SELECT
          id,
          name,
          filename,
          created_at as "createdAt",
          is_deleted as "isDeleted",
          created_by as "createdBy"
        FROM public.imports
        WHERE is_deleted = false
          ${lastId ? sql`AND id > ${lastId}` : sql``}
        ORDER BY id ASC
        LIMIT ${QUERY_PAGE_LIMIT}
      `),
    );

    await writeBackupChunk(state, ",");

    counts.dataRowsCount = await appendPagedJsonArray(state, "dataRows", (lastId) =>
      selectBackupRows<DataRow & BackupCursorRow>(sql`
        SELECT
          id,
          import_id as "importId",
          json_data as "jsonDataJsonb"
        FROM public.data_rows
        WHERE ${lastId ? sql`id > ${lastId}` : sql`TRUE`}
        ORDER BY id ASC
        LIMIT ${QUERY_PAGE_LIMIT}
      `),
    );

    await writeBackupChunk(state, ",");

    counts.usersCount = await appendPagedJsonArray(state, "users", (lastId) =>
      selectBackupRows<BackupUserRecord & BackupCursorRow>(sql`
        SELECT
          id,
          username,
          role,
          is_banned as "isBanned",
          password_hash as "passwordHash",
          two_factor_enabled as "twoFactorEnabled",
          two_factor_secret_encrypted as "twoFactorSecretEncrypted",
          two_factor_configured_at as "twoFactorConfiguredAt",
          failed_login_attempts as "failedLoginAttempts",
          locked_at as "lockedAt",
          locked_reason as "lockedReason",
          locked_by_system as "lockedBySystem"
        FROM public.users
        WHERE ${lastId ? sql`id > ${lastId}` : sql`TRUE`}
        ORDER BY id ASC
        LIMIT ${QUERY_PAGE_LIMIT}
      `),
    );

    await writeBackupChunk(state, ",");

    counts.auditLogsCount = await appendPagedJsonArray(state, "auditLogs", (lastId) =>
      selectBackupRows<AuditLog & BackupCursorRow>(sql`
        SELECT
          id,
          action,
          performed_by as "performedBy",
          request_id as "requestId",
          target_user as "targetUser",
          target_resource as "targetResource",
          details,
          timestamp
        FROM public.audit_logs
        WHERE ${lastId ? sql`id > ${lastId}` : sql`TRUE`}
        ORDER BY id ASC
        LIMIT ${QUERY_PAGE_LIMIT}
      `),
    );

    await writeBackupChunk(state, ",");

    counts.collectionSourceConfigsCount = await appendPagedJsonArray(
      state,
      "collectionSourceConfigs",
      (lastId) =>
        safeSelectBackupRows<BackupCollectionSourceConfig & BackupCursorRow>(sql`
          SELECT
            config.source_import_id as id,
            config.valid_from as "validFrom",
            config.valid_to as "validTo",
            config.cycle_key as "cycleKey",
            config.enabled,
            config.compatibility_status as "compatibilityStatus",
            config.compatibility_issues as "compatibilityIssues",
            config.indexed_row_count as "indexedRowCount",
            config.configured_by as "configuredBy",
            config.created_at as "createdAt",
            config.updated_at as "updatedAt"
          FROM public.collection_source_configs config
          JOIN public.imports imp ON imp.id = config.source_import_id
          WHERE imp.is_deleted = false
            ${lastId ? sql`AND config.source_import_id > ${lastId}` : sql``}
          ORDER BY config.source_import_id ASC
          LIMIT ${QUERY_PAGE_LIMIT}
        `),
    );

    await writeBackupChunk(state, ",");

    counts.collectionSourceRowsCount = await appendPagedJsonArray(
      state,
      "collectionSourceRows",
      (lastId) =>
        safeSelectBackupRows<BackupCollectionSourceRow & BackupCursorRow>(sql`
          SELECT
            source_row.source_data_row_id as id,
            source_row.source_import_id as "sourceImportId",
            source_row.account_number_hash as "accountNumberHash",
            source_row.card_number_hash as "cardNumberHash",
            source_row.card_number_last4 as "cardNumberLast4",
            source_row.canonical_obligation_key as "canonicalObligationKey",
            source_row.total_due as "totalDue",
            source_row.billing_principal_osp as "billingPrincipalOsp",
            source_row.total_osb as "totalOsb",
            source_row.aging_bucket as "agingBucket",
            source_row.calling_date as "callingDate",
            source_row.created_at as "createdAt"
          FROM public.collection_source_rows source_row
          JOIN public.imports imp ON imp.id = source_row.source_import_id
          WHERE imp.is_deleted = false
            ${lastId ? sql`AND source_row.source_data_row_id > ${lastId}` : sql``}
          ORDER BY source_row.source_data_row_id ASC
          LIMIT ${QUERY_PAGE_LIMIT}
        `),
    );

    await writeBackupChunk(state, ",");

    counts.collectionOspTargetsCount = await appendPagedJsonArray(
      state,
      "collectionOspTargets",
      (lastId) =>
        safeSelectBackupRows<BackupCollectionOspTarget & BackupCursorRow>(sql`
          SELECT
            id,
            source_scope_hash as "sourceScopeHash",
            source_import_ids as "sourceImportIds",
            period_from as "periodFrom",
            period_to as "periodTo",
            aging_bucket as "agingBucket",
            total_osp_baseline as "totalOspBaseline",
            target_percentage as "targetPercentage",
            configured_by as "configuredBy",
            created_at as "createdAt",
            updated_at as "updatedAt"
          FROM public.collection_osp_targets
          WHERE ${lastId ? sql`id > ${lastId}::uuid` : sql`TRUE`}
          ORDER BY id ASC
          LIMIT ${QUERY_PAGE_LIMIT}
        `),
    );

    await writeBackupChunk(state, ",");

    counts.collectionRecordsCount = await appendPagedJsonArray(state, "collectionRecords", (lastId) =>
      safeSelectBackupRows<(BackupCollectionRecord & BackupCursorRow) & Record<string, unknown>>(sql`
        SELECT
          id,
          ${buildProtectedCollectionPiiSelect("customer_name", "customer_name_encrypted", "customerName", "customerName")},
          customer_name_encrypted as "customerNameEncrypted",
          customer_name_search_hashes as "customerNameSearchHashes",
          ${buildProtectedCollectionPiiSelect("ic_number", "ic_number_encrypted", "icNumber", "icNumber")},
          ic_number_encrypted as "icNumberEncrypted",
          ${buildProtectedCollectionPiiSelect("customer_phone", "customer_phone_encrypted", "customerPhone", "customerPhone")},
          customer_phone_encrypted as "customerPhoneEncrypted",
          ${buildProtectedCollectionPiiSelect("account_number", "account_number_encrypted", "accountNumber", "accountNumber")},
          account_number_encrypted as "accountNumberEncrypted",
          card_number_last4 as "cardNumberLast4",
          source_import_id as "sourceImportId",
          source_data_row_id as "sourceDataRowId",
          source_import_name as "sourceImportName",
          source_filename as "sourceFilename",
          aging_bucket as "agingBucket",
          total_due as "totalDue",
          billing_principal_osp as "billingPrincipalOsp",
          calling_date as "callingDate",
          calling_window_end_exclusive as "callingWindowEndExclusive",
          source_match_basis as "sourceMatchBasis",
          source_match_accuracy as "sourceMatchAccuracy",
          source_obligation_key as "sourceObligationKey",
          settlement_cycle_key as "settlementCycleKey",
          classification,
          cumulative_collected as "cumulativeCollected",
          remaining_amount as "remainingAmount",
          batch,
          payment_date as "paymentDate",
          amount,
          receipt_file as "receiptFile",
          receipt_total_amount as "receiptTotalAmountCents",
          receipt_validation_status as "receiptValidationStatus",
          receipt_validation_message as "receiptValidationMessage",
          receipt_count as "receiptCount",
          duplicate_receipt_flag as "duplicateReceiptFlag",
          created_by_login as "createdByLogin",
          collection_staff_nickname as "collectionStaffNickname",
          staff_username as "staffUsername",
          created_at as "createdAt"
        FROM public.collection_records
        WHERE ${lastId ? sql`id > ${lastId}` : sql`TRUE`}
        ORDER BY id ASC
        LIMIT ${QUERY_PAGE_LIMIT}
      `).then((rows) =>
        rows.map((row) => mapBackupCollectionRecordRow(row)),
      ),
    );

    await writeBackupChunk(state, ",");

    counts.collectionRecordPurgeHistoryCount = await appendPagedJsonArray(
      state,
      "collectionRecordPurgeHistory",
      (lastId) =>
        safeSelectBackupRows<BackupCollectionRecordPurgeHistory & BackupCursorRow>(sql`
          SELECT
            original_record_id as id,
            source_import_id as "sourceImportId",
            source_data_row_id as "sourceDataRowId",
            source_import_name as "sourceImportName",
            source_filename as "sourceFilename",
            ic_number_search_hash as "icNumberSearchHash",
            customer_phone_search_hash as "customerPhoneSearchHash",
            account_number_search_hash as "accountNumberSearchHash",
            payment_date as "paymentDate",
            amount,
            created_by_login as "createdByLogin",
            collection_staff_nickname as "collectionStaffNickname",
            original_created_at as "originalCreatedAt",
            purged_at as "purgedAt",
            purged_by as "purgedBy",
            purge_reason as "purgeReason"
          FROM public.collection_record_purge_history
          WHERE ${lastId ? sql`original_record_id > ${lastId}::uuid` : sql`TRUE`}
          ORDER BY original_record_id ASC
          LIMIT ${QUERY_PAGE_LIMIT}
        `),
    );

    await writeBackupChunk(state, ",");

    counts.collectionRecordReceiptsCount = await appendPagedJsonArray(
      state,
      "collectionRecordReceipts",
      (lastId) =>
        safeSelectBackupRows<BackupCollectionReceipt & BackupCursorRow>(sql`
          SELECT
            id,
            collection_record_id as "collectionRecordId",
            storage_path as "storagePath",
            original_file_name as "originalFileName",
            original_mime_type as "originalMimeType",
            original_extension as "originalExtension",
            file_size as "fileSize",
            receipt_amount as "receiptAmountCents",
            extracted_amount as "extractedAmountCents",
            extraction_status as "extractionStatus",
            extraction_confidence as "extractionConfidence",
            receipt_date as "receiptDate",
            receipt_reference as "receiptReference",
            file_hash as "fileHash",
            created_at as "createdAt"
          FROM public.collection_record_receipts
          WHERE ${lastId ? sql`id > ${lastId}` : sql`TRUE`}
          ORDER BY id ASC
          LIMIT ${QUERY_PAGE_LIMIT}
        `),
    );

    await writeBackupChunk(state, "}");
    if (state.cipher) {
      const finalChunk = state.cipher.final();
      await writeBackupStreamChunk(state.writer, finalChunk);
    }
    await closeBackupWriter(state.writer);
    const tempFileStats = await fs.stat(tempFilePath);
    const memoryUsage = process.memoryUsage();
    const tempPayloadStoragePrefix = tempPayloadEncrypted && primaryEncryptionKeyId && iv && state.cipher
      ? createBackupPayloadStoragePrefix(primaryEncryptionKeyId, iv, state.cipher.getAuthTag())
      : undefined;

    return {
      tempFilePath,
      payloadChecksumSha256: state.hash.digest("hex"),
      counts,
      payloadBytes: tempFileStats.size,
      maxSerializedRowBytes: state.maxSerializedRowBytes,
      memoryRssBytes: memoryUsage.rss,
      memoryHeapUsedBytes: memoryUsage.heapUsed,
      tempPayloadEncrypted,
      ...(tempPayloadStoragePrefix ? { tempPayloadStoragePrefix } : {}),
      cleanup,
    };
  } catch (error) {
    destroyBackupWriterAfterFailure(state.writer, error);
    await cleanup();
    throw error;
  }
}
