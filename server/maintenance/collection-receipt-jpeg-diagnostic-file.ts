import { constants as fsConstants, type BigIntStats } from "node:fs";
import { open } from "node:fs/promises";
import { diagnoseJpegStructure } from "../lib/collection-receipt-jpeg-security-utils";

const MAX_DIAGNOSTIC_BYTES = 5 * 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;
const SAFE_READ_ERROR = "JPEG diagnostic could not read the selected file safely.";

function supportsSafeOpenFlags(): boolean {
  return process.platform !== "win32"
    && typeof fsConstants.O_NOFOLLOW === "number"
    && fsConstants.O_NOFOLLOW !== 0
    && typeof fsConstants.O_NONBLOCK === "number"
    && fsConstants.O_NONBLOCK !== 0;
}

function isUnchangedFile(before: BigIntStats, after: BigIntStats): boolean {
  return after.isFile()
    && before.dev === after.dev
    && before.ino === after.ino
    && before.nlink === after.nlink
    && before.size === after.size
    && before.mtimeNs === after.mtimeNs
    && before.ctimeNs === after.ctimeNs;
}

// O_NOFOLLOW protects the final component only. Use a trusted, stable input
// directory; this helper does not secure mutable ancestor traversal. Descriptor
// metadata checks detect observed changes, rather than providing an atomic snapshot.
export async function diagnoseCollectionReceiptJpegFile(
  filePath: string,
): Promise<ReturnType<typeof diagnoseJpegStructure>> {
  try {
    if (!supportsSafeOpenFlags()) {
      throw new Error(SAFE_READ_ERROR);
    }

    const handle = await open(
      filePath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK,
    );
    try {
      const before = await handle.stat({ bigint: true });
      if (!before.isFile() || before.nlink !== 1n || before.size < 1n
        || before.size > BigInt(MAX_DIAGNOSTIC_BYTES)) {
        throw new Error(SAFE_READ_ERROR);
      }

      const fileBytes = Number(before.size);
      const buffer = Buffer.alloc(fileBytes);
      let offset = 0;
      while (offset < fileBytes) {
        const { bytesRead } = await handle.read(
          buffer,
          offset,
          Math.min(READ_CHUNK_BYTES, fileBytes - offset),
          offset,
        );
        if (bytesRead === 0) {
          throw new Error(SAFE_READ_ERROR);
        }
        offset += bytesRead;
      }

      const extraByte = Buffer.alloc(1);
      const extra = await handle.read(extraByte, 0, 1, fileBytes);
      const after = await handle.stat({ bigint: true });
      if (extra.bytesRead !== 0 || !isUnchangedFile(before, after)) {
        throw new Error(SAFE_READ_ERROR);
      }

      return diagnoseJpegStructure(buffer);
    } finally {
      await handle.close();
    }
  } catch {
    // Native filesystem errors can contain the selected filename or path.
    throw new Error(SAFE_READ_ERROR);
  }
}
