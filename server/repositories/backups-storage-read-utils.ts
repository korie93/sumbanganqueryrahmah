import crypto from "crypto";
import { StringDecoder } from "node:string_decoder";
import { sql } from "drizzle-orm";
import { db } from "../db-postgres";
import {
  decodeBackupDataFromStorage,
  type BackupEncryptionConfig,
} from "./backups-encryption";
import { BACKUP_STORAGE_DB_READ_PAGE_SIZE } from "./backups-repository-types";

type BackupPayloadChunkQueryRow = {
  chunkIndex?: unknown;
  chunkData?: unknown;
};

type BackupRawDataQueryRow = {
  backupData?: unknown;
};

const BACKUP_DATA_ENCRYPTION_PREFIX_V1 = "enc:v1:";
const BACKUP_DATA_ENCRYPTION_PREFIX_V2 = "enc:v2:";

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

export async function readChunkedBackupDataFromStorage(backupId: string): Promise<string> {
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

export async function* iterateDecodedBackupDataJsonChunksFromStorageChunks(
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

export async function getBackupStoragePayloadChunkStreamById(
  id: string,
): Promise<AsyncIterable<string> | undefined> {
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
