import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { CollectionReceiptSecurityError } from "../../lib/collection-receipt-security";
import { createCollectionReceiptMultipartRoute } from "../collection/collection-multipart-receipt-route";
import { COLLECTION_RECEIPT_MAX_BYTES } from "../collection-receipt-file-type-utils";

type MultipartPart =
  | { kind: "field"; name: string; value: string }
  | {
    kind: "file";
    name: string;
    filename: string;
    contentType: string;
    content: Buffer | string;
  };

function buildMultipartBody(boundary: string, parts: MultipartPart[]) {
  const chunks: Buffer[] = [];

  for (const part of parts) {
    if (part.kind === "field") {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`,
          "utf8",
        ),
      );
      continue;
    }

    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: ${part.contentType}\r\n\r\n`,
        "utf8",
      ),
    );
    chunks.push(Buffer.isBuffer(part.content) ? part.content : Buffer.from(part.content, "utf8"));
    chunks.push(Buffer.from("\r\n", "utf8"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return Buffer.concat(chunks);
}

async function runMultipartHandler(
  parts: MultipartPart[],
  handler: ReturnType<typeof createCollectionReceiptMultipartRoute>,
) {
  const boundary = "----codex-multipart-boundary";
  const body = buildMultipartBody(boundary, parts);
  const req = new PassThrough() as PassThrough & {
    headers: Record<string, string>;
    is: (type: string) => boolean;
    body?: Record<string, unknown>;
  };
  const result = await new Promise<
    | { kind: "next"; body: Record<string, unknown> | undefined }
    | { kind: "next-error"; error: unknown }
    | { kind: "response"; statusCode: number; payload: unknown }
  >((resolve) => {
    let resolved = false;
    const complete = (
      value:
        | { kind: "next"; body: Record<string, unknown> | undefined }
        | { kind: "next-error"; error: unknown }
        | { kind: "response"; statusCode: number; payload: unknown },
    ) => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve(value);
    };

    req.headers = {
      "content-type": `multipart/form-data; boundary=${boundary}`,
    };
    req.is = (type: string) => type === "multipart/form-data";

    const res = {
      status(statusCode: number) {
        return {
          json(payload: unknown) {
            complete({ kind: "response", payload, statusCode });
          },
        };
      },
    };

    handler(req as never, res as never, (error?: unknown) => {
      if (error) {
        complete({ kind: "next-error", error });
        return;
      }
      complete({ kind: "next", body: req.body });
    });
    req.end(body);
  });

  return result;
}

test("createCollectionReceiptMultipartRoute attaches parsed fields and uploaded receipts", async () => {
  const handler = createCollectionReceiptMultipartRoute<
    { filename: string; content: string },
    Record<string, unknown>
  >({
    attachKey: "uploadedReceipts",
    handleReceipt: async ({ fileName, stream }) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      return {
        content: Buffer.concat(chunks).toString("utf8"),
        filename: String(fileName || ""),
      };
    },
  });

  const result = await runMultipartHandler(
    [
      { kind: "field", name: "customerName", value: "Alice" },
      { kind: "field", name: "removeReceiptIds[]", value: "receipt-1" },
      {
        kind: "file",
        name: "receipt",
        filename: "receipt.png",
        contentType: "image/png",
        content: "first receipt",
      },
    ],
    handler,
  );

  assert.equal(result.kind, "next");
  assert.equal(result.body?.customerName, "Alice");
  assert.deepEqual(result.body?.removeReceiptIds, ["receipt-1"]);
  assert.deepEqual(result.body?.uploadedReceipts, [
    {
      content: "first receipt",
      filename: "receipt.png",
    },
  ]);
});

test("createCollectionReceiptMultipartRoute authorizes before processing receipt streams", async () => {
  let receiptHandlerCalled = false;
  const authorizationError = new Error("Forbidden");
  const handler = createCollectionReceiptMultipartRoute<
    { filename: string },
    Record<string, unknown>
  >({
    attachKey: "uploadedReceipts",
    authorizeRequest: async () => {
      throw authorizationError;
    },
    handleReceipt: async ({ stream }) => {
      receiptHandlerCalled = true;
      for await (const _chunk of stream) {
        // Should never run when request authorization fails.
      }
      return { filename: "receipt.png" };
    },
  });

  const result = await runMultipartHandler(
    [
      {
        kind: "file",
        name: "receipt",
        filename: "receipt.png",
        contentType: "image/png",
        content: "receipt body",
      },
    ],
    handler,
  );

  assert.equal(receiptHandlerCalled, false);
  assert.deepEqual(result, {
    kind: "next-error",
    error: authorizationError,
  });
});

test("createCollectionReceiptMultipartRoute cleans up completed uploads when a later upload fails", async () => {
  const cleanedReceipts: Array<{ filename: string }> = [];
  const handler = createCollectionReceiptMultipartRoute<
    { filename: string },
    Record<string, unknown>
  >({
    attachKey: "uploadedReceipts",
    handleReceipt: async ({ fileName, stream }) => {
      for await (const _chunk of stream) {
        // Drain the stream so Busboy can finish consistently.
      }

      const filename = String(fileName || "");
      if (filename === "broken.png") {
        throw new Error("Receipt upload failed.");
      }

      return { filename };
    },
    cleanupReceipts: async (receipts) => {
      cleanedReceipts.push(...receipts);
    },
  });

  const result = await runMultipartHandler(
    [
      {
        kind: "file",
        name: "receipts[]",
        filename: "good.png",
        contentType: "image/png",
        content: "good receipt",
      },
      {
        kind: "file",
        name: "receipts[]",
        filename: "broken.png",
        contentType: "image/png",
        content: "bad receipt",
      },
    ],
    handler,
  );

  assert.deepEqual(cleanedReceipts, [{ filename: "good.png" }]);
  assert.deepEqual(result, {
    kind: "response",
    payload: {
      ok: false,
      message: "Receipt upload failed.",
    },
    statusCode: 400,
  });
});

test("createCollectionReceiptMultipartRoute hides external scanner config internals from responses", async () => {
  const handler = createCollectionReceiptMultipartRoute<
    { filename: string },
    Record<string, unknown>
  >({
    attachKey: "uploadedReceipts",
    handleReceipt: async ({ stream }) => {
      for await (const _chunk of stream) {
        // Drain stream.
      }

      throw new CollectionReceiptSecurityError(
        "Receipt external malware scan failed for receipt.upload (COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON No number after minus sign in JSON at position 2).",
        "external-scan-config-invalid",
      );
    },
  });

  const result = await runMultipartHandler(
    [
      {
        kind: "file",
        name: "receipt",
        filename: "receipt.jpg",
        contentType: "image/jpeg",
        content: "receipt body",
      },
    ],
    handler,
  );

  assert.equal(result.kind, "response");
  assert.equal(result.statusCode, 400);
  const payload = result.payload as {
    message?: string;
    error?: { code?: string };
  };
  assert.equal(payload.error?.code, "COLLECTION_RECEIPT_EXTERNAL_SCAN_CONFIG_INVALID");
  assert.match(String(payload.message), /hubungi admin/i);
  assert.doesNotMatch(String(payload.message), /COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON/i);
  assert.doesNotMatch(String(payload.message), /No number after minus sign/i);
});

test("createCollectionReceiptMultipartRoute sanitizes multipart file names before handing them to receipt storage", async () => {
  const handler = createCollectionReceiptMultipartRoute<
    { filename: string },
    Record<string, unknown>
  >({
    attachKey: "uploadedReceipts",
    handleReceipt: async ({ fileName, stream }) => {
      for await (const _chunk of stream) {
        // Drain stream.
      }

      return {
        filename: String(fileName || ""),
      };
    },
  });

  const result = await runMultipartHandler(
    [
      {
        kind: "file",
        name: "receipt",
        filename: "..\\..\\receipt<>.png",
        contentType: "image/png",
        content: "receipt body",
      },
    ],
    handler,
  );

  assert.equal(result.kind, "next");
  assert.deepEqual(result.body?.uploadedReceipts, [
    {
      filename: "receipt_.png",
    },
  ]);
});

test("createCollectionReceiptMultipartRoute rejects oversized receipt streams with 413", async () => {
  let receiptHandlerStarted = false;
  const handler = createCollectionReceiptMultipartRoute<
    { filename: string },
    Record<string, unknown>
  >({
    attachKey: "uploadedReceipts",
    handleReceipt: async ({ stream }) => {
      receiptHandlerStarted = true;
      for await (const _chunk of stream) {
        // The Busboy size limit should destroy this stream once it exceeds 5MB.
      }
      return { filename: "oversized.png" };
    },
  });

  const result = await runMultipartHandler(
    [
      {
        kind: "file",
        name: "receipt",
        filename: "oversized.png",
        contentType: "image/png",
        content: Buffer.alloc(COLLECTION_RECEIPT_MAX_BYTES + 1, 1),
      },
    ],
    handler,
  );

  assert.equal(receiptHandlerStarted, true);
  assert.deepEqual(result, {
    kind: "response",
    payload: {
      ok: false,
      message: "Receipt file exceeds 5MB.",
    },
    statusCode: 413,
  });
});

test("createCollectionReceiptMultipartRoute rejects disallowed receipt MIME types before storage", async () => {
  let receiptHandlerCalled = false;
  const handler = createCollectionReceiptMultipartRoute<
    { filename: string },
    Record<string, unknown>
  >({
    attachKey: "uploadedReceipts",
    handleReceipt: async ({ stream }) => {
      receiptHandlerCalled = true;
      for await (const _chunk of stream) {
        // Disallowed MIME types should be rejected before this handler runs.
      }
      return { filename: "receipt.pdf" };
    },
  });

  const result = await runMultipartHandler(
    [
      {
        kind: "file",
        name: "receipt",
        filename: "receipt.pdf",
        contentType: "text/plain",
        content: "%PDF body",
      },
    ],
    handler,
  );

  assert.equal(receiptHandlerCalled, false);
  assert.equal(result.kind, "response");
  assert.equal(result.statusCode, 400);
  const payload = result.payload as {
    error?: { code?: string };
    message?: string;
  };
  assert.equal(payload.error?.code, "COLLECTION_RECEIPT_RECEIPT_MIME_NOT_ALLOWED");
  assert.match(String(payload.message), /MIME type is not allowed/i);
});

test("createCollectionReceiptMultipartRoute rejects too many receipt files", async () => {
  const handler = createCollectionReceiptMultipartRoute<
    { filename: string },
    Record<string, unknown>
  >({
    attachKey: "uploadedReceipts",
    handleReceipt: async ({ fileName, stream }) => {
      for await (const _chunk of stream) {
        // Drain accepted streams until the file-count limit trips.
      }
      return { filename: String(fileName || "") };
    },
  });

  const result = await runMultipartHandler(
    Array.from({ length: 11 }, (_, index): MultipartPart => ({
      kind: "file",
      name: "receipts[]",
      filename: `receipt-${index}.png`,
      contentType: "image/png",
      content: `receipt ${index}`,
    })),
    handler,
  );

  assert.deepEqual(result, {
    kind: "response",
    payload: {
      ok: false,
      message: "Receipt upload accepts at most 8 files per request.",
    },
    statusCode: 413,
  });
});

test("createCollectionReceiptMultipartRoute rejects oversized streams before request completion", async () => {
  const boundary = "----codex-oversized-streaming-boundary";
  const req = new PassThrough() as PassThrough & {
    headers: Record<string, string>;
    is: (type: string) => boolean;
    body?: Record<string, unknown>;
  };
  const handler = createCollectionReceiptMultipartRoute<
    { filename: string },
    Record<string, unknown>
  >({
    attachKey: "uploadedReceipts",
    handleReceipt: async ({ stream }) => {
      for await (const _chunk of stream) {
        // The test intentionally does not send the closing multipart boundary.
      }
      return { filename: "oversized.png" };
    },
  });

  req.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
  };
  req.is = (type: string) => type === "multipart/form-data";

  const result = await new Promise<{ statusCode: number; payload: unknown }>((resolve) => {
    const res = {
      status(statusCode: number) {
        return {
          json(payload: unknown) {
            resolve({ payload, statusCode });
          },
        };
      },
    };

    handler(req as never, res as never, () => {
      throw new Error("Oversized streaming upload should not reach next().");
    });
    req.write(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="receipt"; filename="oversized.png"\r\nContent-Type: image/png\r\n\r\n`,
      "utf8",
    ));
    req.write(Buffer.alloc(COLLECTION_RECEIPT_MAX_BYTES + 1, 1));
  });

  assert.deepEqual(result, {
    payload: {
      ok: false,
      message: "Receipt file exceeds 5MB.",
    },
    statusCode: 413,
  });
});

test("createCollectionReceiptMultipartRoute fails slow multipart uploads closed with a timeout", async () => {
  const boundary = "----codex-slow-receipt-boundary";
  const req = new PassThrough() as PassThrough & {
    headers: Record<string, string>;
    is: (type: string) => boolean;
    body?: Record<string, unknown>;
  };
  let receiptHandlerStarted = false;
  const handler = createCollectionReceiptMultipartRoute<
    { filename: string },
    Record<string, unknown>
  >({
    attachKey: "uploadedReceipts",
    uploadTimeoutMs: 5,
    handleReceipt: async ({ stream }) => {
      receiptHandlerStarted = true;
      for await (const _chunk of stream) {
        // The timeout path should destroy the stream before the request ends.
      }
      return { filename: "slow.png" };
    },
  });

  req.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
  };
  req.is = (type: string) => type === "multipart/form-data";

  const result = await new Promise<{ statusCode: number; payload: unknown }>((resolve) => {
    const res = {
      status(statusCode: number) {
        return {
          json(payload: unknown) {
            resolve({ payload, statusCode });
          },
        };
      },
    };

    handler(req as never, res as never, () => {
      throw new Error("Timed out multipart upload should not reach next().");
    });
    req.write(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="receipt"; filename="slow.png"\r\nContent-Type: image/png\r\n\r\npartial`,
      "utf8",
    ));
  });

  assert.equal(receiptHandlerStarted, true);
  assert.deepEqual(result, {
    payload: {
      ok: false,
      message: "Receipt upload timed out. Please retry with a stable connection.",
    },
    statusCode: 408,
  });
});
