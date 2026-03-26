import Busboy from "busboy";
import type { RequestHandler } from "express";
import {
  removeCollectionReceiptFile,
  saveMultipartCollectionReceipt,
} from "../collection-receipt.service";

type MultipartCollectionBody = Record<string, unknown> & {
  uploadedReceipts?: StoredCollectionReceiptFile[];
};
type StoredCollectionReceiptFile = Awaited<ReturnType<typeof saveMultipartCollectionReceipt>>;

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
  return createCollectionReceiptMultipartRoute<StoredCollectionReceiptFile, MultipartCollectionBody>({
    attachKey: "uploadedReceipts",
    handleReceipt: saveMultipartCollectionReceipt,
    cleanupReceipts: async (receipts) => {
      await Promise.allSettled(
        receipts.map((receipt) => removeCollectionReceiptFile(receipt.storagePath)),
      );
    },
  });
}

function createCollectionReceiptMultipartRoute<
  TReceipt,
  TBody extends Record<string, unknown>,
>(params: {
  attachKey: keyof TBody;
  handleReceipt: (input: {
    fileName?: string | null;
    mimeType?: string | null;
    stream: NodeJS.ReadableStream;
  }) => Promise<TReceipt>;
  cleanupReceipts?: (receipts: TReceipt[]) => Promise<void>;
}): RequestHandler {
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

    const body = {} as TBody;
    const uploadTasks: Array<Promise<TReceipt>> = [];
    let settled = false;

    const fail = async (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;

      if (params.cleanupReceipts) {
        const completedUploads = await Promise.allSettled(uploadTasks);
        const completedReceipts: TReceipt[] = [];
        for (const result of completedUploads) {
          if (result.status === "fulfilled") {
            completedReceipts.push(result.value as TReceipt);
          }
        }
        await params.cleanupReceipts(completedReceipts);
      }

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
        params.handleReceipt({
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
        body[params.attachKey] = await Promise.all(uploadTasks) as TBody[keyof TBody];
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
