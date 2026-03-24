import Busboy from "busboy";
import type { RequestHandler } from "express";
import type { StoredCollectionReceiptFile } from "../collection-receipt.service";
import {
  removeCollectionReceiptFile,
  saveMultipartCollectionReceipt,
} from "../collection-receipt.service";

type MultipartCollectionBody = Record<string, unknown> & {
  uploadedReceipts?: StoredCollectionReceiptFile[];
};

function normalizeMultipartFieldName(rawName: string): string {
  const normalized = String(rawName || "").trim();
  return normalized.endsWith("[]") ? normalized.slice(0, -2) : normalized;
}

function appendMultipartField(body: MultipartCollectionBody, rawName: string, value: string) {
  const fieldName = normalizeMultipartFieldName(rawName);
  const normalizedValue = String(value || "");

  if (fieldName === "removeReceipt") {
    body.removeReceipt = normalizedValue === "true";
    return;
  }

  if (fieldName === "removeReceiptIds") {
    const currentValues = Array.isArray(body.removeReceiptIds)
      ? body.removeReceiptIds.map((item) => String(item || ""))
      : [];
    currentValues.push(normalizedValue);
    body.removeReceiptIds = currentValues;
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(body, fieldName)) {
    body[fieldName] = normalizedValue;
    return;
  }

  const currentValue = body[fieldName];
  if (Array.isArray(currentValue)) {
    currentValue.push(normalizedValue);
    body[fieldName] = currentValue;
    return;
  }

  body[fieldName] = [currentValue, normalizedValue];
}

export function createCollectionMultipartRoute(): RequestHandler {
  return (req, res, next) => {
    if (!req.is("multipart/form-data")) {
      next();
      return;
    }

    const parser = Busboy({
      headers: req.headers,
      limits: {
        files: 8,
        fields: 40,
      },
    });

    const body: MultipartCollectionBody = {};
    const uploadTasks: Array<Promise<StoredCollectionReceiptFile>> = [];
    let settled = false;

    const fail = async (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;

      const completedUploads = await Promise.allSettled(uploadTasks);
      const savedReceipts = completedUploads
        .filter((result): result is PromiseFulfilledResult<StoredCollectionReceiptFile> => result.status === "fulfilled")
        .map((result) => result.value);
      await Promise.allSettled(
        savedReceipts.map((receipt) => removeCollectionReceiptFile(receipt.storagePath)),
      );

      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to parse multipart collection payload.";
      res.status(400).json({
        ok: false,
        message,
      });
    };

    parser.on("field", (fieldName, value) => {
      appendMultipartField(body, fieldName, value);
    });

    parser.on("file", (fieldName, file, info) => {
      const normalizedField = normalizeMultipartFieldName(fieldName);
      if (!info.filename || (normalizedField !== "receipts" && normalizedField !== "receipt")) {
        file.resume();
        return;
      }

      uploadTasks.push(
        saveMultipartCollectionReceipt({
          fileName: info.filename,
          mimeType: info.mimeType,
          stream: file,
        }),
      );
    });

    parser.once("error", (error) => {
      void fail(error);
    });

    parser.once("finish", async () => {
      if (settled) {
        return;
      }

      try {
        body.uploadedReceipts = await Promise.all(uploadTasks);
        settled = true;
        req.body = body;
        next();
      } catch (error) {
        await fail(error);
      }
    });

    req.pipe(parser);
  };
}
