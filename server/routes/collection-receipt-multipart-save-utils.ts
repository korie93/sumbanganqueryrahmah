import fs from "fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  CollectionReceiptSecurityError,
  COLLECTION_RECEIPT_SIGNATURE_SCAN_BYTES,
  detectCollectionReceiptSignature,
  type CollectionReceiptFileType,
} from "../lib/collection-receipt-security";
import {
  buildStoredCollectionReceiptMetadata,
  COLLECTION_RECEIPT_ALLOWED_MIME,
  COLLECTION_RECEIPT_MAX_BYTES,
  mapCollectionReceiptExtensionToType,
  normalizeCollectionReceiptMimeType,
} from "./collection-receipt-file-type-utils";
import {
  buildStoredCollectionReceiptFile,
  sanitizeAndInspectCollectionReceiptBuffer,
  type StoredCollectionReceiptFile,
  validateCollectionReceiptDeclaredMetadata,
} from "./collection-receipt-save-utils";
import {
  finalizeStoredCollectionReceiptFile,
  logCollectionReceiptBestEffortFailure,
  quarantineRejectedCollectionReceipt,
} from "./collection-receipt-storage-utils";

export type MultipartCollectionReceiptInput = {
  fileName?: string | null;
  mimeType?: string | null;
  stream: NodeJS.ReadableStream;
};

type MultipartStreamFailureObservation = {
  stage: "source" | "transform" | "write";
  errorName: string | null;
};

export async function saveMultipartCollectionReceipt(
  receipt: MultipartCollectionReceiptInput,
): Promise<StoredCollectionReceiptFile> {
  const fileName = String(receipt.fileName || "receipt").trim();
  const declaredMimeType = normalizeCollectionReceiptMimeType(receipt.mimeType || "");
  const declaredMimeTypeAccepted = COLLECTION_RECEIPT_ALLOWED_MIME.has(declaredMimeType);

  const extensionType = mapCollectionReceiptExtensionToType(
    fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "",
  );
  if (fileName.includes(".") && !extensionType) {
    throw new Error("Receipt file extension is not allowed.");
  }

  const storedReceipt = buildStoredCollectionReceiptMetadata({
    fileName,
    signatureType: "pdf",
  });
  const temporaryFilePath = storedReceipt.absolutePath.replace(/\.[^.]+$/, ".upload");
  const signatureChunks: Buffer[] = [];
  let signatureBytesCaptured = 0;
  let fileSize = 0;
  let signatureType: CollectionReceiptFileType | null = null;
  let maxBytesExceeded = false;
  let observedStreamFailure: MultipartStreamFailureObservation | null = null;

  const captureAndValidate = new Transform({
    transform(chunk, _encoding, callback) {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      fileSize += bufferChunk.length;
      if (fileSize > COLLECTION_RECEIPT_MAX_BYTES) {
        maxBytesExceeded = true;
        callback(new Error("Receipt file exceeds 5MB."));
        return;
      }

      if (signatureBytesCaptured < COLLECTION_RECEIPT_SIGNATURE_SCAN_BYTES) {
        const remainingBytes = COLLECTION_RECEIPT_SIGNATURE_SCAN_BYTES - signatureBytesCaptured;
        signatureChunks.push(bufferChunk.subarray(0, remainingBytes));
        signatureBytesCaptured += Math.min(bufferChunk.length, remainingBytes);
      }

      callback(null, bufferChunk);
    },
  });
  const noteStreamFailure = (
    stage: "source" | "transform" | "write",
    error: unknown,
  ) => {
    observedStreamFailure = {
      stage,
      errorName: error instanceof Error ? error.name : null,
    };
  };
  const handleSourceStreamError = (error: unknown) => {
    noteStreamFailure("source", error);
  };
  const handleTransformStreamError = (error: unknown) => {
    noteStreamFailure("transform", error);
  };

  const sourceStream = receipt.stream as NodeJS.ReadableStream & {
    destroyed?: boolean;
    destroy?: (error?: Error) => void;
    once: (event: "error", listener: (error: unknown) => void) => unknown;
    removeListener: (event: "error", listener: (error: unknown) => void) => unknown;
  };
  sourceStream.once("error", handleSourceStreamError);
  captureAndValidate.once("error", handleTransformStreamError);
  let writeStream: fs.WriteStream | null = null;
  const handleWriteStreamError = (error: unknown) => {
    noteStreamFailure("write", error);
  };
  const detachObservedStreamListeners = () => {
    sourceStream.removeListener("error", handleSourceStreamError);
    captureAndValidate.removeListener("error", handleTransformStreamError);
    writeStream?.removeListener("error", handleWriteStreamError);
  };

  try {
    writeStream = fs.createWriteStream(temporaryFilePath, { flags: "wx" });
    writeStream.once("error", handleWriteStreamError);
    await pipeline(
      sourceStream,
      captureAndValidate,
      writeStream,
    );
    detachObservedStreamListeners();

    if (!fileSize) {
      throw new Error("Invalid receipt payload.");
    }

    signatureType = detectCollectionReceiptSignature(Buffer.concat(signatureChunks));
    if (!signatureType) {
      throw new CollectionReceiptSecurityError(
        "Receipt file signature is not allowed.",
        "receipt-signature-not-allowed",
      );
    }
    validateCollectionReceiptDeclaredMetadata({
      fileName,
      declaredMimeType,
      declaredMimeTypeAccepted,
      signatureType,
    });

    const receiptBytes = await fs.promises.readFile(temporaryFilePath);
    const prepared = await sanitizeAndInspectCollectionReceiptBuffer({
      fileName,
      buffer: receiptBytes,
      signatureType,
    });
    if (prepared.sanitizedBuffer.length !== receiptBytes.length || prepared.removedMetadataKinds.length > 0) {
      await fs.promises.writeFile(temporaryFilePath, prepared.sanitizedBuffer);
    }

    const finalizedReceipt = await finalizeStoredCollectionReceiptFile({
      temporaryFilePath,
      fileName,
      signatureType,
    });

    return buildStoredCollectionReceiptFile({
      storedReceipt: finalizedReceipt,
      inspection: prepared.inspection,
      fileSize: prepared.sanitizedBuffer.length,
    });
  } catch (error) {
    detachObservedStreamListeners();
    if (maxBytesExceeded) {
      sourceStream.destroy?.(error instanceof Error ? error : undefined);
    }
    captureAndValidate.destroy(error instanceof Error ? error : undefined);
    writeStream?.destroy(error instanceof Error ? error : undefined);
    sourceStream.destroy?.(error instanceof Error ? error : undefined);

    const streamFailure = observedStreamFailure as MultipartStreamFailureObservation | null;
    if (streamFailure !== null) {
      logCollectionReceiptBestEffortFailure(
        "Multipart collection receipt stream failed during save",
        {
          fileName,
          temporaryFilePath,
          maxBytesExceeded,
          stage: streamFailure.stage,
          errorName: streamFailure.errorName,
        },
      );
    }

    if (error instanceof CollectionReceiptSecurityError) {
      await quarantineRejectedCollectionReceipt({
        source: "multipart",
        fileName,
        mimeType: receipt.mimeType,
        signatureType,
        rejectionError: error,
        filePath: temporaryFilePath,
      });
    }
    await fs.promises.rm(temporaryFilePath, { force: true }).catch((cleanupError) => {
      logCollectionReceiptBestEffortFailure(
        "Failed to remove staged multipart collection receipt after save failure",
        {
          fileName,
          temporaryFilePath,
          maxBytesExceeded,
          error: cleanupError,
        },
      );
    });
    throw error;
  }
}
