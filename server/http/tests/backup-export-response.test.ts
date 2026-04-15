import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";
import type { Response } from "express";
import { sendBackupExportResponse } from "../../controllers/backup-export-response";
import { logger } from "../../lib/logger";

class MemoryResponse extends Writable {
  public readonly headers = new Map<string, string>();
  public statusCode = 200;
  public readonly chunks: string[] = [];
  public headersSent = false;

  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    this.headersSent = true;
    this.chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    callback(null);
  }
}

class FailingResponse extends Writable {
  public readonly headers = new Map<string, string>();
  public statusCode = 200;
  public headersSent = false;
  public writeCount = 0;

  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  override _write(
    _chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    this.headersSent = true;
    this.writeCount += 1;
    if (this.writeCount >= 2) {
      callback(new Error("socket write failed"));
      return;
    }
    callback(null);
  }
}

test("sendBackupExportResponse streams the JSON envelope with safe download headers", async () => {
  const response = new MemoryResponse();

  await sendBackupExportResponse({
    res: response as unknown as Response,
    backupId: "backup-1",
    fileName: 'nightly"\r\n.json',
    payloadPrefixJson: '{"id":"backup-1","backupData":',
    backupDataJsonChunks: (async function* () {
      yield '{"imports":[{"id":"import-1"}]}';
    })(),
    payloadSuffixJson: "}",
    username: "super.user",
  });

  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="nightly.json"',
  );
  assert.equal(
    response.chunks.join(""),
    '{"id":"backup-1","backupData":{"imports":[{"id":"import-1"}]}}',
  );
});

test("sendBackupExportResponse logs and destroys the response when stream writes fail", async (t) => {
  const response = new FailingResponse();
  const warnCalls: Array<{ message: string; meta: Record<string, unknown> | undefined }> = [];
  t.mock.method(logger, "warn", ((message: string, meta?: Record<string, unknown>) => {
    warnCalls.push({ message, meta });
  }) as typeof logger.warn);

  await sendBackupExportResponse({
    res: response as unknown as Response,
    backupId: "backup-2",
    fileName: "nightly-backup.json",
    payloadPrefixJson: '{"id":"backup-2","backupData":',
    backupDataJsonChunks: (async function* () {
      yield '{"imports":[{"id":"import-1"}]}';
    })(),
    payloadSuffixJson: "}",
    username: "super.user",
  });

  assert.equal(warnCalls.length, 1);
  assert.equal(warnCalls[0]?.message, "Backup export response stream failed");
  assert.equal(warnCalls[0]?.meta?.backupId, "backup-2");
  assert.equal(response.destroyed, true);
});
