import crypto from "crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "../lib/logger";
import {
  BACKUP_STORAGE_APPEND_CHUNK_BYTES,
  type PreparedBackupPayloadFile,
} from "./backups-repository-types";

export type PreparedBackupWriteState = {
  writer: ReturnType<typeof createWriteStream>,
  hash: crypto.Hash,
  maxSerializedRowBytes: number,
  cipher?: crypto.CipherGCM,
};

export async function writeBackupStreamChunk(
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

export async function writeBackupChunk(
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

export async function closeBackupWriter(writer: ReturnType<typeof createWriteStream>) {
  await new Promise<void>((resolve, reject) => {
    writer.once("error", reject);
    writer.end(() => resolve());
  });
}

export async function createBackupTempFile() {
  const tempDirPath = await fs.mkdtemp(path.join(os.tmpdir(), "sqr-backup-export-"));
  await fs.chmod(tempDirPath, 0o700).catch((error) => {
    logger.warn("Failed to set backup temp directory permissions", {
      error,
      tempDirPath,
    });
  });
  return {
    tempDirPath,
    tempFilePath: path.join(tempDirPath, "backup-data.json"),
  };
}

async function* iterateUtf8FileViaStream(filePath: string): AsyncGenerator<string, void, void> {
  const stream = createReadStream(filePath, {
    encoding: "utf8",
    highWaterMark: BACKUP_STORAGE_APPEND_CHUNK_BYTES,
  });

  try {
    for await (const chunk of stream) {
      if (typeof chunk === "string" && chunk.length > 0) {
        yield chunk;
      }
    }
  } finally {
    stream.destroy();
  }
}

async function* iterateBase64FileViaStream(filePath: string): AsyncGenerator<string, void, void> {
  let remainder = Buffer.alloc(0);
  const stream = createReadStream(filePath, {
    highWaterMark: BACKUP_STORAGE_APPEND_CHUNK_BYTES,
  });

  try {
    for await (const chunk of stream) {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const combined = remainder.length > 0 ? Buffer.concat([remainder, bufferChunk]) : bufferChunk;
      const safeLength = combined.length - (combined.length % 3);

      if (safeLength > 0) {
        yield combined.subarray(0, safeLength).toString("base64");
      }

      remainder = safeLength < combined.length
        ? combined.subarray(safeLength)
        : Buffer.alloc(0);
    }

    if (remainder.length > 0) {
      yield remainder.toString("base64");
    }
  } finally {
    stream.destroy();
  }
}

export async function* iteratePreparedBackupPayloadStorageChunks(
  preparedBackupPayload: Pick<
    PreparedBackupPayloadFile,
    "tempFilePath" | "tempPayloadEncrypted" | "tempPayloadStoragePrefix"
  >,
): AsyncGenerator<string, void, void> {
  if (
    preparedBackupPayload.tempPayloadEncrypted
    && typeof preparedBackupPayload.tempPayloadStoragePrefix === "string"
  ) {
    yield preparedBackupPayload.tempPayloadStoragePrefix;
    yield* iterateBase64FileViaStream(preparedBackupPayload.tempFilePath);
    return;
  }

  yield* iterateUtf8FileViaStream(preparedBackupPayload.tempFilePath);
}

export async function readPreparedBackupPayloadForStorage(
  preparedBackupPayload: Pick<
    PreparedBackupPayloadFile,
    "tempFilePath" | "tempPayloadEncrypted" | "tempPayloadStoragePrefix"
  >,
): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of iteratePreparedBackupPayloadStorageChunks(preparedBackupPayload)) {
    if (chunk) {
      chunks.push(chunk);
    }
  }
  if (chunks.length === 0) {
    return "";
  }
  if (chunks.length === 1) {
    return chunks[0];
  }
  return chunks.join("");
}
