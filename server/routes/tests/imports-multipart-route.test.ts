import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import {
  cleanupTrackedMultipartUploadStreamsForTests,
  createImportsMultipartRoute,
} from "../imports-multipart-route";
import { createActiveImportUploadQuotaTracker } from "../imports-upload-quota";
import type { PreparedMultipartImportUpload } from "../imports-multipart-utils";

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

async function pathExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function waitForPathRemoval(filePath: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!(await pathExists(filePath))) {
      return;
    }
    await delay(10);
  }

  assert.fail(`Expected path to be removed: ${filePath}`);
}

async function runMultipartHandler(
  parts: MultipartPart[],
  handler: ReturnType<typeof createImportsMultipartRoute>,
  options?: {
    username?: string;
  },
) {
  const boundary = "----codex-import-multipart-boundary";
  const body = buildMultipartBody(boundary, parts);
  const req = new PassThrough() as PassThrough & {
    headers: Record<string, string>;
    is: (type: string) => boolean;
    body?: Record<string, unknown>;
    user?: { username?: string };
  };

  const result = await new Promise<
    | { kind: "next"; body: Record<string, unknown> | undefined; locals: Record<string, unknown> | undefined }
    | { kind: "response"; statusCode: number; payload: unknown }
  >((resolve) => {
    let settled = false;
    const complete = (
      value:
        | { kind: "next"; body: Record<string, unknown> | undefined; locals: Record<string, unknown> | undefined }
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
    if (options?.username) {
      req.user = { username: options.username };
    }

    const res = Object.assign(new EventEmitter(), {
      locals: {} as Record<string, unknown>,
      status(statusCode: number) {
        return {
          json(payload: unknown) {
            complete({ kind: "response", payload, statusCode });
          },
        };
      },
    });

    handler(req as never, res as never, () => {
      complete({ kind: "next", body: req.body, locals: res.locals });
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
    filename: "customers.csv",
    name: "March Batch",
  });
  assert.equal(result.locals?.multipartImportUpload !== undefined, true);
});

test("createImportsMultipartRoute cleans staged CSV uploads if downstream leaves ownership unclaimed", async () => {
  const handler = createImportsMultipartRoute(0);
  const boundary = "----codex-import-multipart-boundary";
  const body = buildMultipartBody(boundary, [
    {
      kind: "file",
      name: "file",
      filename: "customers.csv",
      contentType: "text/csv",
      content: "name,amount\nAlice,12\n",
    },
  ]);
  const req = new PassThrough() as PassThrough & {
    headers: Record<string, string>;
    is: (type: string) => boolean;
    body?: Record<string, unknown>;
  };
  const res = Object.assign(new EventEmitter(), {
    locals: {} as Record<string, unknown>,
    status() {
      return {
        json() {
          throw new Error("The successful multipart path should call next().");
        },
      };
    },
  });

  req.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
  };
  req.is = (type: string) => type === "multipart/form-data";

  const upload = await new Promise<PreparedMultipartImportUpload>((resolve) => {
    handler(req as never, res as never, () => {
      const stagedUpload = res.locals.multipartImportUpload as PreparedMultipartImportUpload;
      resolve(stagedUpload);
    });
    req.end(body);
  });

  assert.equal(upload.kind, "csv-file");
  if (upload.kind !== "csv-file") {
    return;
  }

  assert.equal(await pathExists(upload.filePath), true);
  assert.equal(await pathExists(upload.tempDir), true);

  res.emit("finish");
  await waitForPathRemoval(upload.filePath);
  await waitForPathRemoval(upload.tempDir);
  assert.equal(res.locals.multipartImportUpload, undefined);

  res.emit("close");
  assert.equal(res.locals.multipartImportUpload, undefined);
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

test("createImportsMultipartRoute rejects multipart uploads that exceed the active per-user quota", async () => {
  const quotaTracker = createActiveImportUploadQuotaTracker(1024);
  assert.equal(quotaTracker.tryReserve("admin.user", 1024), true);

  const handler = createImportsMultipartRoute(1024, 1024, quotaTracker);
  const result = await runMultipartHandler(
    [
      {
        kind: "file",
        name: "file",
        filename: "customers.csv",
        contentType: "text/csv",
        content: "name,amount\nAlice,12\n",
      },
    ],
    handler,
    { username: "admin.user" },
  );

  assert.deepEqual(result, {
    kind: "response",
    payload: {
      ok: false,
      message:
        "You already have an import upload in progress that uses your per-user upload quota. Please wait and try again.",
    },
    statusCode: 413,
  });
  quotaTracker.release("admin.user", 1024);
});

test("createImportsMultipartRoute releases reserved quota when the request closes before completion", async () => {
  const quotaTracker = createActiveImportUploadQuotaTracker(1024);
  const handler = createImportsMultipartRoute(1024, 1024, quotaTracker);
  const boundary = "----codex-import-multipart-boundary";
  const req = new PassThrough() as PassThrough & {
    complete: boolean;
    headers: Record<string, string>;
    is: (type: string) => boolean;
    body?: Record<string, unknown>;
    user?: { username?: string };
  };

  req.complete = false;
  req.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`,
  };
  req.is = (type: string) => type === "multipart/form-data";
  req.user = { username: "admin.user" };

  let nextCalled = false;
  const res = {
    locals: {} as Record<string, unknown>,
    status() {
      return {
        json() {
          throw new Error("The multipart close path should not send a response.");
        },
      };
    },
  };

  handler(req as never, res as never, () => {
    nextCalled = true;
  });

  assert.equal(quotaTracker.getUsage("admin.user"), 1024);

  const closePromise = new Promise<void>((resolve) => {
    req.once("close", () => resolve());
  });
  req.destroy();
  await closePromise;

  assert.equal(quotaTracker.getUsage("admin.user"), 0);
  assert.equal(nextCalled, false);

  req.emit("close");
  assert.equal(quotaTracker.getUsage("admin.user"), 0);
});

test("cleanupTrackedMultipartUploadStreamsForTests destroys tracked multipart file streams defensively", () => {
  const lifecycleCalls: string[] = [];
  const stream = {
    unpipe() {
      lifecycleCalls.push("unpipe");
    },
    resume() {
      lifecycleCalls.push("resume");
    },
    destroy(error?: Error) {
      lifecycleCalls.push(`destroy:${error?.message ?? "none"}`);
    },
  };

  const cleaned = cleanupTrackedMultipartUploadStreamsForTests([stream], new Error("parser failed"));

  assert.equal(cleaned, 1);
  assert.deepEqual(lifecycleCalls, ["unpipe", "resume", "destroy:parser failed"]);
});

test("cleanupTrackedMultipartUploadStreamsForTests reports best-effort cleanup failures", () => {
  const cleanupFailures: Array<{ step: string; message: string | undefined }> = [];
  const stream = {
    unpipe() {
      throw new Error("unpipe failed");
    },
    resume() {
      throw new Error("resume failed");
    },
    destroy() {
      throw new Error("destroy failed");
    },
  };

  const cleaned = cleanupTrackedMultipartUploadStreamsForTests(
    [stream],
    new Error("parser failed"),
    (step, error) => {
      cleanupFailures.push({
        step,
        message: error?.message,
      });
    },
  );

  assert.equal(cleaned, 0);
  assert.deepEqual(cleanupFailures, [
    { step: "unpipe", message: "unpipe failed" },
    { step: "resume", message: "resume failed" },
    { step: "destroy", message: "destroy failed" },
  ]);
});

test("createImportsMultipartRoute protects hanging file streams with an unref timeout", () => {
  const source = readFileSync("server/routes/imports-multipart-route.ts", "utf8");

  assert.match(source, /IMPORT_MULTIPART_FILE_STREAM_TIMEOUT_MS\s*=\s*30_000/);
  assert.match(source, /multipart_import_file_stream_timeout/);
  assert.match(source, /timeoutId\.unref\?\.\(\)/);
});
