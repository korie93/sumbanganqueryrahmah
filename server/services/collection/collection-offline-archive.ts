import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, unlink } from "node:fs/promises";
import path from "node:path";
import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { collectionOfflineRecordId, COLLECTION_OFFLINE_EXPORT_MAX_RECORDS, COLLECTION_OFFLINE_EXPORT_MAX_RECEIPTS } from "../../../shared/common/collection-offline-export";
import { HttpError } from "../../http/errors";
import { resolveCollectionReceiptStoragePath } from "../../lib/collection-receipt-files";
import { detectCollectionReceiptSignature, validateCollectionReceiptSecurity } from "../../lib/collection-receipt-security";
import { assertCollectionReceiptPathWithinBounds } from "../../lib/path-security";
import { COLLECTION_RECEIPT_MAX_BYTES, mapCollectionReceiptExtensionToType, mapCollectionReceiptMimeToType } from "../../routes/collection-receipt-file-type-utils";
import type { CollectionRecord, CollectionRecordReceipt } from "../../storage-postgres-collection-types";
import { buildCollectionOfflineWorkbook } from "./collection-offline-workbook";
import type { CollectionExcelColumnId } from "../../../shared/common/collection-excel-columns";

const ARCHIVE_LIMIT = 128 * 1024 * 1024;
const tooLarge = () => new HttpError(413, "Eksport melebihi had. Pilih lebih sedikit rekod dan cuba lagi.", { code: "PAYLOAD_TOO_LARGE" });
type ReceiptPosition = { recordId: string; receiptNumber: number | null; receiptCount: number };
const unavailableReceipt = (details?: ReceiptPosition) => new HttpError(
  409, "Resit berdaftar hilang atau tidak dapat disahkan. Eksport dibatalkan.", { code: "INVALID_RECEIPT", details },
);

export function getOfflineExportReceipts(record: CollectionRecord) {
  const receipts = record.receipts ?? [];
  // Older records can have active attachments and a cached count of zero.
  const expectedCount = Math.max(record.receiptCount ?? 0, record.receiptFile ? 1 : 0);
  if (expectedCount > receipts.length) {
    throw unavailableReceipt({ recordId: record.id, receiptNumber: null, receiptCount: expectedCount });
  }
  return receipts;
}

async function readReceipt(receipt: CollectionRecordReceipt, position: ReceiptPosition) {
  try {
    const location = resolveCollectionReceiptStoragePath(receipt.storagePath);
    if (!location?.isManagedCollectionReceipt) throw unavailableReceipt();
    const realPath = assertCollectionReceiptPathWithinBounds(location.absolutePath, "offline-export");
    const handle = await open(realPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
      const info = await handle.stat();
      if (!info.isFile() || !info.size || info.size > COLLECTION_RECEIPT_MAX_BYTES ||
          (receipt.fileSize > 0 && info.size !== receipt.fileSize)) throw unavailableReceipt();
      // Bound the allocation even if a stored file changes while being read.
      const bytes = Buffer.alloc(info.size);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!bytesRead) throw unavailableReceipt();
        offset += bytesRead;
      }
      const after = await handle.stat();
      if (after.size !== info.size || after.mtimeMs !== info.mtimeMs) throw unavailableReceipt();
      const type = detectCollectionReceiptSignature(bytes);
      if (!type || mapCollectionReceiptExtensionToType(receipt.originalExtension) !== type ||
          mapCollectionReceiptMimeToType(receipt.originalMimeType) !== type ||
          mapCollectionReceiptExtensionToType(path.extname(realPath)) !== type) throw unavailableReceipt();
      if (receipt.fileHash && createHash("sha256").update(bytes).digest("hex") !== receipt.fileHash.toLowerCase()) throw unavailableReceipt();
      validateCollectionReceiptSecurity(bytes, type);
      return { bytes, type };
    } finally {
      await handle.close();
    }
  } catch {
    // Keep filesystem, filename and validation details out of the HTTP error.
    throw unavailableReceipt(position);
  }
}

const readme = [
  "Eksport pilihan SQR",
  "Ekstrak keseluruhan ZIP dahulu. Buka Collection_Selected.xlsx dalam aplikasi Excel desktop.",
  "Jika lajur Resit dipilih, gunakan pautan dalam Excel. Semua fail resit asal tersedia dalam folder Receipts.",
  "Office mungkin meminta pengesahan untuk membuka fail setempat. Buka hanya jika anda mengenali sumber fail.",
  "Eksport ini mengandungi data peribadi. Simpan di lokasi yang dilindungi dan kongsi hanya dengan penerima yang dibenarkan.",
].join("\r\n");

export async function createCollectionOfflineArchive(records: readonly CollectionRecord[], directory: string, signal: AbortSignal,
  columns?: readonly CollectionExcelColumnId[]) {
  signal.throwIfAborted();
  if (!records.length || records.length > COLLECTION_OFFLINE_EXPORT_MAX_RECORDS) throw tooLarge();
  const generatedAt = new Date();
  const folder = "SQR_Collection_Selected_" + generatedAt.toISOString().slice(0, 19).replace(/:/g, "").replace("T", "_");
  const archivePath = path.join(directory, folder + ".zip");
  const output = await open(archivePath, "wx", 0o600);
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, data) => {
    if (error) throw error;
    chunks.push(data);
  });
  let written = 0;
  let receiptCount = 0;
  let complete = false;
  const links = new Map<string, string[]>();
  async function flush() {
    for (const chunk of chunks) {
      signal.throwIfAborted();
      written += chunk.length;
      if (written > ARCHIVE_LIMIT) throw tooLarge();
      await output.writeFile(chunk);
    }
    chunks.length = 0;
  }
  async function add(name: string, data: Uint8Array) {
    const entry = new ZipPassThrough(folder + "/" + name);
    zip.add(entry);
    entry.push(data, true);
    await flush();
  }
  try {
    await add("Receipts/", new Uint8Array());
    for (const record of records) {
      signal.throwIfAborted();
      if (!collectionOfflineRecordId.test(record.id) || links.has(record.id)) throw unavailableReceipt();
      const receipts = getOfflineExportReceipts(record);
      receiptCount += receipts.length;
      if (receiptCount > COLLECTION_OFFLINE_EXPORT_MAX_RECEIPTS) throw tooLarge();
      const paths: string[] = [];
      links.set(record.id, paths);
      const seen = new Set<string>();
      for (const [index, receipt] of receipts.entries()) {
        signal.throwIfAborted();
        const position = { recordId: record.id, receiptNumber: index + 1, receiptCount: receipts.length };
        if (receipt.collectionRecordId !== record.id || receipt.deletedAt || seen.has(receipt.storagePath)) throw unavailableReceipt(position);
        seen.add(receipt.storagePath);
        const { bytes, type } = await readReceipt(receipt, position);
        const name = "Receipts/" + record.id + "_" + String(position.receiptNumber).padStart(2, "0") + "." + type;
        await add(name, bytes);
        paths.push(name);
      }
    }
    signal.throwIfAborted();
    await add("Collection_Selected.xlsx", buildCollectionOfflineWorkbook(records, links, generatedAt, columns));
    await add("Export_Readme.txt", strToU8(readme));
    zip.end();
    await flush();
    complete = true;
    return { path: archivePath, receiptCount };
  } finally {
    zip.terminate();
    await output.close();
    if (!complete) await unlink(archivePath);
  }
}
