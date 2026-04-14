import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { CollectionReceiptSecurityError } from "../collection-receipt-security";
import { runExternalReceiptScan } from "../collection-receipt-external-scan-runner";
import type { ExternalScanConfig } from "../collection-receipt-external-scan-shared";

class FakeReadableStream extends EventEmitter {
  destroyed = false;
  encoding: BufferEncoding | null = null;

  setEncoding(encoding: BufferEncoding) {
    this.encoding = encoding;
    return this;
  }

  destroy() {
    this.destroyed = true;
    return this;
  }
}

class FakeChildProcess extends EventEmitter {
  stdout = new FakeReadableStream();
  stderr = new FakeReadableStream();
  killCalls = 0;

  kill() {
    this.killCalls += 1;
    return true;
  }
}

function createExternalScanConfig(overrides?: Partial<ExternalScanConfig>): ExternalScanConfig {
  return {
    enabled: true,
    command: "scanner",
    args: ["{file}"],
    timeoutMs: 1_000,
    failClosed: true,
    cleanExitCodes: new Set([0]),
    rejectExitCodes: new Set([1]),
    ...overrides,
  };
}

test("external scan runner removes child listeners and destroys stdio streams after a clean exit", async () => {
  const child = new FakeChildProcess();
  const spawnProcess =
    ((() => child) as unknown) as NonNullable<Parameters<typeof runExternalReceiptScan>[0]["spawnProcess"]>;
  const runPromise = runExternalReceiptScan({
    config: createExternalScanConfig(),
    filePath: "C:\\temp\\receipt.pdf",
    scannerCommand: "scanner",
    args: ["--scan", "C:\\temp\\receipt.pdf"],
    spawnProcess,
  });

  child.stdout.emit("data", "scan ok");
  child.stderr.emit("data", "");
  child.emit("close", 0, null);

  await runPromise;

  assert.equal(child.listenerCount("error"), 0);
  assert.equal(child.listenerCount("close"), 0);
  assert.equal(child.stdout.listenerCount("data"), 0);
  assert.equal(child.stderr.listenerCount("data"), 0);
  assert.equal(child.stdout.destroyed, true);
  assert.equal(child.stderr.destroyed, true);
});

test("external scan runner cleans up child listeners when process spawn fails", async () => {
  const child = new FakeChildProcess();
  const spawnProcess =
    ((() => child) as unknown) as NonNullable<Parameters<typeof runExternalReceiptScan>[0]["spawnProcess"]>;
  const runPromise = runExternalReceiptScan({
    config: createExternalScanConfig(),
    filePath: "C:\\temp\\receipt.pdf",
    scannerCommand: "scanner",
    args: ["--scan", "C:\\temp\\receipt.pdf"],
    spawnProcess,
  });

  child.emit("error", new Error("spawn failed"));

  await assert.rejects(
    () => runPromise,
    (error: unknown) =>
      error instanceof CollectionReceiptSecurityError
      && error.reasonCode === "external-scan-spawn-failed",
  );

  assert.equal(child.listenerCount("error"), 0);
  assert.equal(child.listenerCount("close"), 0);
  assert.equal(child.stdout.listenerCount("data"), 0);
  assert.equal(child.stderr.listenerCount("data"), 0);
  assert.equal(child.stdout.destroyed, true);
  assert.equal(child.stderr.destroyed, true);
});
