import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RESTORE_CHUNK_SIZE,
  resolveRestoreChunkSize,
} from "../backups-restore-config";

test("restore chunk size defaults to the backup chunk size when unset", () => {
  assert.equal(resolveRestoreChunkSize({}), DEFAULT_RESTORE_CHUNK_SIZE);
  assert.equal(resolveRestoreChunkSize({ RESTORE_CHUNK_SIZE: "" }), DEFAULT_RESTORE_CHUNK_SIZE);
});

test("restore chunk size accepts bounded positive integer overrides", () => {
  assert.equal(resolveRestoreChunkSize({ RESTORE_CHUNK_SIZE: "1" }), 1);
  assert.equal(resolveRestoreChunkSize({ RESTORE_CHUNK_SIZE: "750" }), 750);
  assert.equal(resolveRestoreChunkSize({ RESTORE_CHUNK_SIZE: "5000" }), 5000);
});

test("restore chunk size falls back safely for malformed or unbounded values", () => {
  assert.equal(resolveRestoreChunkSize({ RESTORE_CHUNK_SIZE: "0" }), DEFAULT_RESTORE_CHUNK_SIZE);
  assert.equal(resolveRestoreChunkSize({ RESTORE_CHUNK_SIZE: "-1" }), DEFAULT_RESTORE_CHUNK_SIZE);
  assert.equal(resolveRestoreChunkSize({ RESTORE_CHUNK_SIZE: "5001" }), DEFAULT_RESTORE_CHUNK_SIZE);
  assert.equal(resolveRestoreChunkSize({ RESTORE_CHUNK_SIZE: "many" }), DEFAULT_RESTORE_CHUNK_SIZE);
});
