import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createImportsMultipartRoute } from "../imports-multipart-route";

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
  handler: ReturnType<typeof createImportsMultipartRoute>,
) {
  const boundary = "----codex-import-multipart-boundary";
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
    let settled = false;
    const complete = (
      value:
        | { kind: "next"; body: Record<string, unknown> | undefined }
        | { kind: "response"; statusCode: number; payload: unknown },
    ) => {
      if (settled) {
        return;
      }
      settled = true;
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

test("createImportsMultipartRoute passes through non-multipart requests", async () => {
  const handler = createImportsMultipartRoute();
  const req = new PassThrough() as PassThrough & {
    headers: Record<string, string>;
    is: (type: string) => boolean;
    body?: Record<string, unknown>;
  };

  const result = await new Promise<{ kind: "next" }>((resolve) => {
    req.headers = {};
    req.is = () => false;

    const res = {
      status() {
        throw new Error("Response should not be used for non-multipart requests.");
      },
    };

    handler(req as never, res as never, () => {
      resolve({ kind: "next" });
    });
  });

  assert.deepEqual(result, { kind: "next" });
  assert.equal(req.body, undefined);
});

test("createImportsMultipartRoute parses multipart uploads and normalizes the import name", async () => {
  const handler = createImportsMultipartRoute(0);

  const result = await runMultipartHandler(
    [
      { kind: "field", name: "name", value: "  March Batch  " },
      {
        kind: "file",
        name: "file",
        filename: "customers.csv",
        contentType: "text/csv",
        content: "name,amount\nAlice,12\nBob,33\n",
      },
    ],
    handler,
  );

  assert.equal(result.kind, "next");
  assert.deepEqual(result.body, {
    data: [
      { amount: "12", name: "Alice" },
      { amount: "33", name: "Bob" },
    ],
    filename: "customers.csv",
    name: "March Batch",
  });
});

test("createImportsMultipartRoute rejects multipart requests without a file", async () => {
  const handler = createImportsMultipartRoute();

  const result = await runMultipartHandler(
    [{ kind: "field", name: "name", value: "No file" }],
    handler,
  );

  assert.deepEqual(result, {
    kind: "response",
    payload: {
      ok: false,
      message: "Please select a CSV or Excel file to import.",
    },
    statusCode: 400,
  });
});

test("createImportsMultipartRoute ignores file parts without filenames and still requires a valid upload", async () => {
  const handler = createImportsMultipartRoute();

  const result = await runMultipartHandler(
    [
      {
        kind: "file",
        name: "file",
        filename: "",
        contentType: "text/plain",
        content: "unused",
      },
    ],
    handler,
  );

  assert.deepEqual(result, {
    kind: "response",
    payload: {
      ok: false,
      message: "Please select a CSV or Excel file to import.",
    },
    statusCode: 400,
  });
});

test("createImportsMultipartRoute returns parser failures as safe client errors", async () => {
  const handler = createImportsMultipartRoute();

  const result = await runMultipartHandler(
    [
      {
        kind: "file",
        name: "file",
        filename: "customers.txt",
        contentType: "text/plain",
        content: "unsupported",
      },
    ],
    handler,
  );

  assert.deepEqual(result, {
    kind: "response",
    payload: {
      ok: false,
      message: "Please select a CSV or Excel file (.xlsx, .xls, .xlsb)",
    },
    statusCode: 400,
  });
});
