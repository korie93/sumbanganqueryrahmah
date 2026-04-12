import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createCollectionReceiptMultipartRoute } from "../collection/collection-multipart-receipt-route";

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
    | { kind: "response"; statusCode: number; payload: unknown }
  >((resolve) => {
    let resolved = false;
    const complete = (
      value:
        | { kind: "next"; body: Record<string, unknown> | undefined }
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

    handler(req as never, res as never, () => {
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
        filename: "receipt.txt",
        contentType: "text/plain",
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
      filename: "receipt.txt",
    },
  ]);
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
      if (filename === "broken.txt") {
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
        filename: "good.txt",
        contentType: "text/plain",
        content: "good receipt",
      },
      {
        kind: "file",
        name: "receipts[]",
        filename: "broken.txt",
        contentType: "text/plain",
        content: "bad receipt",
      },
    ],
    handler,
  );

  assert.deepEqual(cleanedReceipts, [{ filename: "good.txt" }]);
  assert.deepEqual(result, {
    kind: "response",
    payload: {
      ok: false,
      message: "Receipt upload failed.",
    },
    statusCode: 400,
  });
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
        filename: "..\\..\\receipt<>.txt",
        contentType: "text/plain",
        content: "receipt body",
      },
    ],
    handler,
  );

  assert.equal(result.kind, "next");
  assert.deepEqual(result.body?.uploadedReceipts, [
    {
      filename: "receipt_.txt",
    },
  ]);
});
