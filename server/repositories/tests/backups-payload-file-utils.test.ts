import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  closeBackupWriter,
  writeBackupStreamChunk,
} from "../backups-payload-file-utils";

class BackpressureWriter extends EventEmitter {
  write() {
    return false;
  }
}

class SuccessfulCloseWriter extends EventEmitter {
  end(callback: () => void) {
    callback();
  }
}

test("writeBackupStreamChunk rejects and removes listeners when writer errors during backpressure", async () => {
  const writer = new BackpressureWriter();
  const pendingWrite = writeBackupStreamChunk(writer as never, "chunk");
  writer.emit("error", new Error("disk write failed"));

  await assert.rejects(() => pendingWrite, /disk write failed/);
  assert.equal(writer.listenerCount("drain"), 0);
  assert.equal(writer.listenerCount("error"), 0);
});

test("closeBackupWriter removes its error listener after a clean close", async () => {
  const writer = new SuccessfulCloseWriter();

  await closeBackupWriter(writer as never);

  assert.equal(writer.listenerCount("error"), 0);
});
