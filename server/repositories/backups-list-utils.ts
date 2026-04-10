import crypto from "crypto";
import { StringDecoder } from "node:string_decoder";
import { sql, type SQL } from "drizzle-orm";
import type {
  Backup,
  InsertBackup,
} from "../../shared/schema-postgres";
import { db } from "../db-postgres";
import {
  decodeBackupDataFromStorage,
  encodeBackupDataForStorage,
  type BackupEncryptionConfig,
} from "./backups-encryption";
import { iteratePreparedBackupPayloadStorageChunks } from "./backups-payload-utils";
import {
  BACKUP_LIST_DEFAULT_PAGE_SIZE,
  BACKUP_LIST_MAX_PAGE_SIZE,
  BACKUP_STORAGE_DB_READ_PAGE_SIZE,
  QUERY_PAGE_LIMIT,
  type BackupListPageParams,
  type BackupListPageResult,
  type BackupsRepositoryOptions,
  type PreparedBackupPayloadFile,
} from "./backups-repository-types";
import { buildLikePattern } from "./sql-like-utils";

type BackupQueryRow = Omit<Backup, "metadata"> & {
  metadata?: unknown;
};

type BackupPayloadChunkQueryRow = {
  chunkIndex?: unknown;
  chunkData?: unknown;
};

type BackupRawDataQueryRow = {
  backupData?: unknown;
};

const BACKUP_DATA_ENCRYPTION_PREFIX_V1 = "enc:v1:";
const BACKUP_DATA_ENCRYPTION_PREFIX_V2 = "enc:v2:";

function mapBackupQueryRow(options: BackupsRepositoryOptions, row: BackupQueryRow): Backup {
  return {
    ...row,
    metadata: options.parseBackupMetadataSafe(row.metadata),
  } as Backup;
}

function normalizeBackupChunkIndex(raw: unknown): number | null {
  const numericValue = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const normalized = Math.trunc(numericValue);
  return normalized >= 0 ? normalized : null;
}

async function* iterateChunkedBackupDataStorageChunks(
  backupId: string,
): AsyncGenerator<string, void, void> {
  let lastChunkIndex = -1;

  while (true) {
    const result = await db.execute(sql`
      SELECT
        chunk_index as "chunkIndex",
        chunk_data as "chunkData"
      FROM public.backup_payload_chunks
      WHERE backup_id = ${backupId}
        AND chunk_index > ${lastChunkIndex}
      ORDER BY chunk_index ASC
      LIMIT ${BACKUP_STORAGE_DB_READ_PAGE_SIZE}
    `);

    const rows = ((result.rows || []) as BackupPayloadChunkQueryRow[]);
    if (!rows.length) {
      break;
    }

    for (const row of rows) {
      const chunkIndex = normalizeBackupChunkIndex(row.chunkIndex) ?? (lastChunkIndex + 1);

      lastChunkIndex = chunkIndex;
      const chunkData = String(row.chunkData || "");
      if (chunkData.length > 0) {
        yield chunkData;
      }
    }

    if (rows.length < BACKUP_STORAGE_DB_READ_PAGE_SIZE) {
      break;
    }
  }
}

async function readChunkedBackupDataFromStorage(backupId: string): Promise<string> {
  let payload = "";
  for await (const chunk of iterateChunkedBackupDataStorageChunks(backupId)) {
    payload += chunk;
  }
  return payload;
}

function normalizeBackupEncryptionKeyId(raw: string): string | null {
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return /^[a-z0-9_-]{1,64}$/.test(normalized) ? normalized : null;
}

function parseEncryptedBackupDataV2Header(rawPayload: string):
  | {
      keyId: string;
      ivBase64: string;
      authTagBase64: string;
      ciphertextBase64Remainder: string;
    }
  | null {
  if (!rawPayload.startsWith(BACKUP_DATA_ENCRYPTION_PREFIX_V2)) {
    return null;
  }

  const token = rawPayload.slice(BACKUP_DATA_ENCRYPTION_PREFIX_V2.length);
  const firstDot = token.indexOf(".");
  if (firstDot < 0) {
    return null;
  }
  const secondDot = token.indexOf(".", firstDot + 1);
  if (secondDot < 0) {
    return null;
  }
  const thirdDot = token.indexOf(".", secondDot + 1);
  if (thirdDot < 0) {
    return null;
  }

  return {
    keyId: token.slice(0, firstDot),
    ivBase64: token.slice(firstDot + 1, secondDot),
    authTagBase64: token.slice(secondDot + 1, thirdDot),
    ciphertextBase64Remainder: token.slice(thirdDot + 1),
  };
}

function detectStoredBackupPayloadFormat(
  probe: string,
): "need-more" | "plaintext" | "encrypted-v1" | "encrypted-v2" | "invalid" {
  const normalized = probe.trimStart();
  if (!normalized) {
    return "need-more";
  }

  if (normalized.startsWith("{")) {
    return "plaintext";
  }

  if (normalized.startsWith(BACKUP_DATA_ENCRYPTION_PREFIX_V1)) {
    return "encrypted-v1";
  }

  if (normalized.startsWith(BACKUP_DATA_ENCRYPTION_PREFIX_V2)) {
    return "encrypted-v2";
  }

  if (
    BACKUP_DATA_ENCRYPTION_PREFIX_V1.startsWith(normalized)
    || BACKUP_DATA_ENCRYPTION_PREFIX_V2.startsWith(normalized)
  ) {
    return "need-more";
  }

  return "invalid";
}

async function* iterateDecodedBackupDataJsonChunksFromStorageChunks(
  storagePayloadChunks: AsyncIterable<string>,
  backupEncryption: BackupEncryptionConfig,
): AsyncGenerator<string, void, void> {
  const iterator = storagePayloadChunks[Symbol.asyncIterator]();
  const readNextNonEmptyChunk = async (): Promise<string | null> => {
    while (true) {
      const result = await iterator.next();
      if (result.done) {
        return null;
      }

      const chunk = String(result.value || "");
      if (chunk.length > 0) {
        return chunk;
      }
    }
  };

  let headerBuffer = "";
  let format: ReturnType<typeof detectStoredBackupPayloadFormat> = "need-more";

  while (format === "need-more") {
    const nextChunk = await readNextNonEmptyChunk();
    if (nextChunk === null) {
      return;
    }

    headerBuffer += nextChunk;
    format = detectStoredBackupPayloadFormat(headerBuffer);
  }

  if (format === "invalid") {
    throw new Error("Stored backup payload has an invalid encrypted format.");
  }

  if (format === "plaintext") {
    yield headerBuffer;
    while (true) {
      const nextChunk = await readNextNonEmptyChunk();
      if (nextChunk === null) {
        return;
      }
      yield nextChunk;
    }
  }

  let encryptedPayload = headerBuffer.trimStart();
  if (format === "encrypted-v1") {
    while (true) {
      const nextChunk = await readNextNonEmptyChunk();
      if (nextChunk === null) {
        break;
      }
      encryptedPayload += nextChunk;
    }
    yield decodeBackupDataFromStorage(encryptedPayload, backupEncryption);
    return;
  }

  let parsedHeader = parseEncryptedBackupDataV2Header(encryptedPayload);
  while (!parsedHeader) {
    const nextChunk = await readNextNonEmptyChunk();
    if (nextChunk === null) {
      throw new Error("Stored backup payload has an invalid encrypted format.");
    }
    encryptedPayload += nextChunk;
    parsedHeader = parseEncryptedBackupDataV2Header(encryptedPayload);
  }

  const normalizedKeyId = normalizeBackupEncryptionKeyId(parsedHeader.keyId);
  if (!normalizedKeyId) {
    throw new Error("Stored backup payload has an invalid encrypted format.");
  }

  const key = backupEncryption.keysById.get(normalizedKeyId);
  if (!key) {
    throw new Error(
      `Missing backup encryption key '${normalizedKeyId}'. Configure BACKUP_ENCRYPTION_KEYS for key rotation support.`,
    );
  }

  const iv = Buffer.from(parsedHeader.ivBase64, "base64");
  const authTag = Buffer.from(parsedHeader.authTagBase64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const utf8Decoder = new StringDecoder("utf8");

  let base64Remainder = "";
  const flushCiphertextChunk = (segment: string) => {
    const combined = `${base64Remainder}${segment}`;
    const safeLength = combined.length - (combined.length % 4);

    if (safeLength <= 0) {
      base64Remainder = combined;
      return "";
    }

    base64Remainder = combined.slice(safeLength);
    const decryptedBuffer = decipher.update(Buffer.from(combined.slice(0, safeLength), "base64"));
    return decryptedBuffer.length > 0 ? utf8Decoder.write(decryptedBuffer) : "";
  };

  const firstDecryptedChunk = flushCiphertextChunk(parsedHeader.ciphertextBase64Remainder);
  if (firstDecryptedChunk) {
    yield firstDecryptedChunk;
  }

  while (true) {
    const nextChunk = await readNextNonEmptyChunk();
    if (nextChunk === null) {
      break;
    }
    const decryptedChunk = flushCiphertextChunk(nextChunk);
    if (decryptedChunk) {
      yield decryptedChunk;
    }
  }

  if (base64Remainder.length > 0) {
    const trailingBuffer = decipher.update(Buffer.from(base64Remainder, "base64"));
    const trailingChunk = trailingBuffer.length > 0 ? utf8Decoder.write(trailingBuffer) : "";
    if (trailingChunk) {
      yield trailingChunk;
    }
  }

  const finalChunk = utf8Decoder.end(decipher.final());
  if (finalChunk) {
    yield finalChunk;
  }
}

async function* iterateSingleStoragePayloadChunk(chunk: string): AsyncGenerator<string, void, void> {
  if (chunk.length > 0) {
    yield chunk;
  }
}

async function getBackupStoragePayloadChunkStreamById(id: string): Promise<AsyncIterable<string> | undefined> {
  const result = await db.execute(sql`
    SELECT
      backup_data as "backupData"
    FROM public.backups
    WHERE id = ${id}
    LIMIT 1
  `);

  const row = result.rows[0] as BackupRawDataQueryRow | undefined;
  if (!row) {
    return undefined;
  }

  const rawBackupData = String(row.backupData || "");
  if (rawBackupData.trim().length > 0) {
    return iterateSingleStoragePayloadChunk(rawBackupData);
  }

  return iterateChunkedBackupDataStorageChunks(id);
}

export async function createBackup(
  options: BackupsRepositoryOptions,
  backupEncryption: BackupEncryptionConfig,
  data: InsertBackup,
): Promise<Backup> {
  await options.ensureBackupsTable();
  const id = crypto.randomUUID();
  const backupDataForStorage = encodeBackupDataForStorage(
    String(data.backupData || "{}"),
    backupEncryption,
  );
  const result = await db.execute(sql`
    INSERT INTO public.backups (id, name, created_at, created_by, backup_data, metadata)
    VALUES (${id}, ${data.name}, ${new Date()}, ${data.createdBy}, ${backupDataForStorage}, ${data.metadata ?? null})
    RETURNING
      id,
      name,
      created_at as "createdAt",
      created_by as "createdBy",
      ''::text as "backupData",
      metadata
  `);

  return result.rows[0] as Backup;
}

type PreparedBackupInsert = Omit<InsertBackup, "backupData"> & {
  preparedBackupPayload: Pick<
    PreparedBackupPayloadFile,
    "tempFilePath" | "tempPayloadEncrypted" | "tempPayloadStoragePrefix"
  >;
};

export async function createBackupFromPreparedPayload(
  options: BackupsRepositoryOptions,
  data: PreparedBackupInsert,
): Promise<Backup> {
  await options.ensureBackupsTable();
  const id = crypto.randomUUID();
  const createdAt = new Date();

  return db.transaction(async (tx) => {
    const insertResult = await tx.execute(sql`
      INSERT INTO public.backups (id, name, created_at, created_by, backup_data, metadata)
      VALUES (${id}, ${data.name}, ${createdAt}, ${data.createdBy}, ''::text, ${data.metadata ?? null})
      RETURNING
        id,
        name,
        created_at as "createdAt",
        created_by as "createdBy",
        ''::text as "backupData",
        metadata
    `);

    let chunkIndex = 0;

    for await (const chunk of iteratePreparedBackupPayloadStorageChunks(data.preparedBackupPayload)) {
      if (!chunk) {
        continue;
      }

      await tx.execute(sql`
        INSERT INTO public.backup_payload_chunks (backup_id, chunk_index, chunk_data)
        VALUES (${id}, ${chunkIndex}, ${chunk})
        ON CONFLICT (backup_id, chunk_index) DO UPDATE
        SET chunk_data = EXCLUDED.chunk_data
      `);
      chunkIndex += 1;
    }

    return insertResult.rows[0] as Backup;
  });
}

export async function getBackups(
  options: BackupsRepositoryOptions,
): Promise<Backup[]> {
  const firstPage = await listBackupsPage(options, {
    page: 1,
    pageSize: QUERY_PAGE_LIMIT,
    sortBy: "newest",
  });

  if (firstPage.total <= firstPage.backups.length) {
    return firstPage.backups;
  }

  const rows: Backup[] = [...firstPage.backups];
  let page = 2;
  while (rows.length < firstPage.total) {
    const nextPage = await listBackupsPage(options, {
      page,
      pageSize: QUERY_PAGE_LIMIT,
      sortBy: "newest",
    });
    if (!nextPage.backups.length) break;
    rows.push(...nextPage.backups);
    page += 1;
  }

  return rows;
}

export async function listBackupsPage(
  options: BackupsRepositoryOptions,
  params: BackupListPageParams = {},
): Promise<BackupListPageResult> {
  await options.ensureBackupsTable();
  const rawPage = Number(params.page);
  const rawPageSize = Number(params.pageSize);
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  const pageSize = Number.isFinite(rawPageSize)
    ? Math.max(1, Math.min(BACKUP_LIST_MAX_PAGE_SIZE, Math.floor(rawPageSize)))
    : BACKUP_LIST_DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const whereClauses: SQL[] = [];
  const searchName = String(params.searchName || "").trim();
  if (searchName) {
    whereClauses.push(sql`name ILIKE ${buildLikePattern(searchName, "contains")} ESCAPE '\'`);
  }

  const createdBy = String(params.createdBy || "").trim();
  if (createdBy) {
    whereClauses.push(sql`created_by ILIKE ${buildLikePattern(createdBy, "contains")} ESCAPE '\'`);
  }

  const dateFrom = params.dateFrom instanceof Date && Number.isFinite(params.dateFrom.getTime())
    ? params.dateFrom
    : null;
  const dateTo = params.dateTo instanceof Date && Number.isFinite(params.dateTo.getTime())
    ? params.dateTo
    : null;
  if (dateFrom) {
    whereClauses.push(sql`created_at >= ${dateFrom}`);
  }
  if (dateTo) {
    whereClauses.push(sql`created_at <= ${dateTo}`);
  }

  const whereSql = whereClauses.length
    ? sql`WHERE ${sql.join(whereClauses, sql` AND `)}`
    : sql``;

  const sortBy = String(params.sortBy || "newest").toLowerCase();
  const orderBySql =
    sortBy === "oldest"
      ? sql`ORDER BY created_at ASC, id ASC`
      : sortBy === "name-asc"
        ? sql`ORDER BY lower(name) ASC, created_at DESC, id DESC`
        : sortBy === "name-desc"
          ? sql`ORDER BY lower(name) DESC, created_at DESC, id DESC`
          : sql`ORDER BY created_at DESC, id DESC`;

  const [countResult, rowsResult] = await Promise.all([
    db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM public.backups
      ${whereSql}
    `),
    db.execute(sql`
      SELECT
        id,
        name,
        created_at as "createdAt",
        created_by as "createdBy",
        ''::text as "backupData",
        CASE
          WHEN metadata IS NULL THEN NULL
          WHEN length(metadata) > 200000 THEN NULL
          ELSE metadata
        END as metadata
      FROM public.backups
      ${whereSql}
      ${orderBySql}
      LIMIT ${pageSize}
      OFFSET ${offset}
    `),
  ]);

  const total = Number((countResult.rows?.[0] as { total?: number } | undefined)?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const backups = ((rowsResult.rows || []) as BackupQueryRow[]).map((row) =>
    mapBackupQueryRow(options, row),
  );

  return {
    backups,
    page,
    pageSize,
    total,
    totalPages,
  };
}

export async function getBackupById(
  options: BackupsRepositoryOptions,
  backupEncryption: BackupEncryptionConfig,
  id: string,
): Promise<Backup | undefined> {
  await options.ensureBackupsTable();
  const result = await db.execute(sql`
    SELECT
      id,
      name,
      created_at as "createdAt",
      created_by as "createdBy",
      backup_data as "backupData",
      CASE
        WHEN metadata IS NULL THEN NULL
        WHEN length(metadata) > 200000 THEN NULL
        ELSE metadata
      END as metadata
    FROM public.backups
    WHERE id = ${id}
    LIMIT 1
  `);

  const row = (result.rows[0] as BackupQueryRow | undefined);
  if (!row) return undefined;

  const rawBackupData = String(row.backupData || "");
  const storagePayload = rawBackupData.trim().length > 0
    ? rawBackupData
    : await readChunkedBackupDataFromStorage(id);

  return mapBackupQueryRow(options, {
    ...row,
    backupData: decodeBackupDataFromStorage(storagePayload, backupEncryption),
  });
}

export async function iterateBackupDataJsonChunksById(
  options: BackupsRepositoryOptions,
  backupEncryption: BackupEncryptionConfig,
  id: string,
): Promise<AsyncIterable<string> | undefined> {
  await options.ensureBackupsTable();
  const storagePayloadChunks = await getBackupStoragePayloadChunkStreamById(id);
  if (!storagePayloadChunks) {
    return undefined;
  }

  return iterateDecodedBackupDataJsonChunksFromStorageChunks(storagePayloadChunks, backupEncryption);
}

export async function getBackupMetadataById(
  options: BackupsRepositoryOptions,
  id: string,
): Promise<Backup | undefined> {
  await options.ensureBackupsTable();
  const result = await db.execute(sql`
    SELECT
      id,
      name,
      created_at as "createdAt",
      created_by as "createdBy",
      ''::text as "backupData",
      CASE
        WHEN metadata IS NULL THEN NULL
        WHEN length(metadata) > 200000 THEN NULL
        ELSE metadata
      END as metadata
    FROM public.backups
    WHERE id = ${id}
    LIMIT 1
  `);

  const row = (result.rows[0] as BackupQueryRow | undefined);
  if (!row) return undefined;

  return mapBackupQueryRow(options, {
    ...row,
    backupData: "",
  });
}

export async function deleteBackup(
  options: BackupsRepositoryOptions,
  id: string,
): Promise<boolean> {
  await options.ensureBackupsTable();
  const result = await db.execute(sql`
    DELETE FROM public.backups
    WHERE id = ${id}
    RETURNING id
  `);
  return (result.rows?.length || 0) > 0;
}
