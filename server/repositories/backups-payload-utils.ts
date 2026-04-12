import crypto from "crypto";
import { createWriteStream, promises as fs } from "node:fs";
import { sql, type SQL } from "drizzle-orm";
import type {
  AuditLog,
  DataRow,
  Import,
} from "../../shared/schema-postgres";
import { db } from "../db-postgres";
import {
  BACKUP_MAX_SERIALIZED_ROW_BYTES,
  QUERY_PAGE_LIMIT,
  type BackupCollectionReceipt,
  type BackupCollectionRecord,
  type BackupPayloadCounts,
  type BackupUserRecord,
  type PreparedBackupPayloadFile,
} from "./backups-repository-types";
import type { BackupEncryptionConfig } from "./backups-encryption";
import {
  resolveCollectionCustomerNameSearchHashesValue,
  resolveStoredCollectionPiiPlaintextValue,
} from "../lib/collection-pii-encryption";
import { buildProtectedCollectionPiiSelect } from "./collection-pii-select-utils";
import {
  closeBackupWriter,
  createBackupTempFile,
  type PreparedBackupWriteState,
  writeBackupChunk,
  writeBackupStreamChunk,
} from "./backups-payload-file-utils";
export {
  createBackupPayloadChunkReader,
  createBackupPayloadSectionReader,
} from "./backups-payload-reader-utils";

export {
  iteratePreparedBackupPayloadStorageChunks,
  readPreparedBackupPayloadForStorage,
} from "./backups-payload-file-utils";

async function safeSelectRows<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
  try {
    const result = await db.execute(query);
    return (Array.isArray(result.rows) ? result.rows : []) as T[];
  } catch (error) {
    const message = String((error as { message?: string })?.message || "");
    if (/relation\s+["']?[\w.]+["']?\s+does not exist/i.test(message)) {
      return [];
    }
    throw error;
  }
}

async function selectRows<T extends Record<string, unknown>>(query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return (Array.isArray(result.rows) ? result.rows : []) as T[];
}

type BackupCursorRow = {
  id: string;
};

type BackupPageFetcher<T extends BackupCursorRow> = (lastId: string | null) => Promise<T[]>;

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function buildCollectionRecordBackupPiiFields(
  row: Record<string, unknown>,
): Pick<
  BackupCollectionRecord,
  | "customerName"
  | "customerNameEncrypted"
  | "customerNameSearchHashes"
  | "icNumber"
  | "icNumberEncrypted"
  | "customerPhone"
  | "customerPhoneEncrypted"
  | "accountNumber"
  | "accountNumberEncrypted"
> {
  const customerNameEncrypted = hasNonEmptyString(row.customerNameEncrypted)
    ? row.customerNameEncrypted
    : null;
  const icNumberEncrypted = hasNonEmptyString(row.icNumberEncrypted)
    ? row.icNumberEncrypted
    : null;
  const customerPhoneEncrypted = hasNonEmptyString(row.customerPhoneEncrypted)
    ? row.customerPhoneEncrypted
    : null;
  const accountNumberEncrypted = hasNonEmptyString(row.accountNumberEncrypted)
    ? row.accountNumberEncrypted
    : null;
  const customerName = resolveStoredCollectionPiiPlaintextValue({
    field: "customerName",
    plaintext: row.customerName,
    encrypted: row.customerNameEncrypted,
    fallback: null,
  });
  const icNumber = resolveStoredCollectionPiiPlaintextValue({
    field: "icNumber",
    plaintext: row.icNumber,
    encrypted: row.icNumberEncrypted,
    fallback: null,
  });
  const customerPhone = resolveStoredCollectionPiiPlaintextValue({
    field: "customerPhone",
    plaintext: row.customerPhone,
    encrypted: row.customerPhoneEncrypted,
    fallback: null,
  });
  const accountNumber = resolveStoredCollectionPiiPlaintextValue({
    field: "accountNumber",
    plaintext: row.accountNumber,
    encrypted: row.accountNumberEncrypted,
    fallback: null,
  });
  const customerNameSearchHashes = resolveCollectionCustomerNameSearchHashesValue({
    plaintext: customerName,
    encrypted: row.customerNameEncrypted,
    hashes: row.customerNameSearchHashes,
  });

  return {
    ...(customerNameEncrypted
      ? {
        customerNameEncrypted,
        ...(customerNameSearchHashes?.length
          ? { customerNameSearchHashes }
          : {}),
      }
      : {
        ...(customerName ? { customerName } : {}),
      }),
    ...(icNumberEncrypted
      ? { icNumberEncrypted }
      : {
        ...(icNumber ? { icNumber } : {}),
      }),
    ...(customerPhoneEncrypted
      ? { customerPhoneEncrypted }
      : {
        ...(customerPhone ? { customerPhone } : {}),
      }),
    ...(accountNumberEncrypted
      ? { accountNumberEncrypted }
      : {
        ...(accountNumber ? { accountNumber } : {}),
      }),
  };
}

async function appendPagedJsonArray<T extends BackupCursorRow>(
  state: PreparedBackupWriteState,
  key: string,
  fetchPage: BackupPageFetcher<T>,
): Promise<number> {
  await writeBackupChunk(state, `"${key}":[`);

  let lastId: string | null = null;
  let isFirstRow = true;
  let total = 0;

  while (true) {
    const rows = await fetchPage(lastId);
    if (!rows.length) {
      break;
    }

    for (const row of rows) {
      if (!isFirstRow) {
        await writeBackupChunk(state, ",");
      }
      isFirstRow = false;
      const serializedRow = JSON.stringify(row);
      const serializedRowBytes = Buffer.byteLength(serializedRow, "utf8");
      if (serializedRowBytes > BACKUP_MAX_SERIALIZED_ROW_BYTES) {
        throw new Error(
          `Backup export row in '${key}' exceeds the ${BACKUP_MAX_SERIALIZED_ROW_BYTES} byte serialization limit.`,
        );
      }
      state.maxSerializedRowBytes = Math.max(state.maxSerializedRowBytes, serializedRowBytes);
      await writeBackupChunk(state, serializedRow);
      total += 1;
      lastId = row.id;
    }

    if (rows.length < QUERY_PAGE_LIMIT) {
      break;
    }
  }

  await writeBackupChunk(state, "]");
  return total;
}

function createEmptyBackupPayloadCounts(): BackupPayloadCounts {
  return {
    importsCount: 0,
    dataRowsCount: 0,
    usersCount: 0,
    auditLogsCount: 0,
    collectionRecordsCount: 0,
    collectionRecordReceiptsCount: 0,
  };
}

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
  const cipher = tempPayloadEncrypted
    ? crypto.createCipheriv("aes-256-gcm", primaryEncryptionKey as Buffer, iv as Buffer)
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
      selectRows<Import & BackupCursorRow>(sql`
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
      selectRows<DataRow & BackupCursorRow>(sql`
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
      selectRows<BackupUserRecord & BackupCursorRow>(sql`
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
      selectRows<AuditLog & BackupCursorRow>(sql`
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

    counts.collectionRecordsCount = await appendPagedJsonArray(state, "collectionRecords", (lastId) =>
      safeSelectRows<(BackupCollectionRecord & BackupCursorRow) & Record<string, unknown>>(sql`
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
        rows.map((row) => {
          return {
            id: String(row.id || ""),
            ...buildCollectionRecordBackupPiiFields(row),
            batch: String(row.batch || ""),
            paymentDate: String(row.paymentDate || ""),
            amount: row.amount as BackupCollectionRecord["amount"],
            receiptFile:
              typeof row.receiptFile === "string" && row.receiptFile.trim().length > 0
                ? row.receiptFile
                : null,
            receiptTotalAmountCents: row.receiptTotalAmountCents as BackupCollectionRecord["receiptTotalAmountCents"],
            receiptValidationStatus:
              row.receiptValidationStatus as BackupCollectionRecord["receiptValidationStatus"],
            receiptValidationMessage:
              typeof row.receiptValidationMessage === "string" && row.receiptValidationMessage.trim().length > 0
                ? row.receiptValidationMessage
                : null,
            receiptCount:
              typeof row.receiptCount === "number"
                ? row.receiptCount
                : Number(row.receiptCount || 0),
            duplicateReceiptFlag: row.duplicateReceiptFlag === true,
            createdByLogin: String(row.createdByLogin || ""),
            collectionStaffNickname: String(row.collectionStaffNickname || ""),
            staffUsername:
              typeof row.staffUsername === "string" && row.staffUsername.trim().length > 0
                ? row.staffUsername
                : null,
            createdAt: row.createdAt as BackupCollectionRecord["createdAt"],
          };
        }),
      ),
    );

    await writeBackupChunk(state, ",");

    counts.collectionRecordReceiptsCount = await appendPagedJsonArray(
      state,
      "collectionRecordReceipts",
      (lastId) =>
        safeSelectRows<BackupCollectionReceipt & BackupCursorRow>(sql`
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
    const tempPayloadStoragePrefix = tempPayloadEncrypted
      ? `enc:v2:${primaryEncryptionKeyId}.${(iv as Buffer).toString("base64")}.${(state.cipher as crypto.CipherGCM).getAuthTag().toString("base64")}.`
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
    state.writer.destroy();
    await cleanup();
    throw error;
  }
}
