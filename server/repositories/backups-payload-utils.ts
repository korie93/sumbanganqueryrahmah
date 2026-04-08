import crypto from "crypto";
import { once } from "node:events";
import { createWriteStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql, type SQL } from "drizzle-orm";
import type {
  AuditLog,
  DataRow,
  Import,
} from "../../shared/schema-postgres";
import { db } from "../db-postgres";
import {
  QUERY_PAGE_LIMIT,
  type BackupCollectionReceipt,
  type BackupCollectionRecord,
  type BackupPayloadCounts,
  type BackupUserRecord,
  type PreparedBackupPayloadFile,
} from "./backups-repository-types";
import type { BackupEncryptionConfig } from "./backups-encryption";
export {
  createBackupPayloadChunkReader,
  createBackupPayloadSectionReader,
} from "./backups-payload-reader-utils";

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

type PreparedBackupWriteState = {
  writer: ReturnType<typeof createWriteStream>,
  hash: crypto.Hash,
  cipher?: crypto.CipherGCM,
};

async function writeBackupStreamChunk(
  writer: ReturnType<typeof createWriteStream>,
  chunk: string | Buffer,
) {
  if ((typeof chunk === "string" && !chunk) || (chunk instanceof Buffer && chunk.length === 0)) {
    return;
  }

  const wrote = typeof chunk === "string"
    ? writer.write(chunk, "utf8")
    : writer.write(chunk);
  if (!wrote) {
    await once(writer, "drain");
  }
}

async function writeBackupChunk(
  state: PreparedBackupWriteState,
  chunk: string,
) {
  if (!chunk) return;
  state.hash.update(chunk, "utf8");

  if (!state.cipher) {
    await writeBackupStreamChunk(state.writer, chunk);
    return;
  }

  const encryptedChunk = state.cipher.update(chunk, "utf8");
  await writeBackupStreamChunk(state.writer, encryptedChunk);
}

async function closeBackupWriter(writer: ReturnType<typeof createWriteStream>) {
  await new Promise<void>((resolve, reject) => {
    writer.once("error", reject);
    writer.end(() => resolve());
  });
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
      await writeBackupChunk(state, JSON.stringify(row));
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

async function createBackupTempFile() {
  const tempDirPath = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-backup-export-"));
  await fs.chmod(tempDirPath, 0o700).catch(() => {});
  return {
    tempDirPath,
    tempFilePath: path.join(tempDirPath, "backup-data.json"),
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
      safeSelectRows<BackupCollectionRecord & BackupCursorRow>(sql`
        SELECT
          id,
          customer_name as "customerName",
          ic_number as "icNumber",
          customer_phone as "customerPhone",
          account_number as "accountNumber",
          batch,
          payment_date as "paymentDate",
          amount,
          receipt_file as "receiptFile",
          receipt_total_amount as "receiptTotalAmount",
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
      `),
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
            receipt_amount as "receiptAmount",
            extracted_amount as "extractedAmount",
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
    const tempPayloadStoragePrefix = tempPayloadEncrypted
      ? `enc:v2:${primaryEncryptionKeyId}.${(iv as Buffer).toString("base64")}.${(state.cipher as crypto.CipherGCM).getAuthTag().toString("base64")}.`
      : undefined;

    return {
      tempFilePath,
      payloadChecksumSha256: state.hash.digest("hex"),
      counts,
      payloadBytes: tempFileStats.size,
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
