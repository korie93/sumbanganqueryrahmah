import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const tsxCliPath = require.resolve("tsx/cli");

test("validate-restore-chunk accepts a backup with bounded restore chunks", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "sqr-restore-chunk-"));
  try {
    const backupPath = join(tempDir, "backup.json");
    await writeFile(
      backupPath,
      JSON.stringify({
        imports: Array.from({ length: 5 }, (_, index) => ({ id: index + 1 })),
        rows: Array.from({ length: 3 }, (_, index) => ({ id: index + 1 })),
      }),
      "utf8",
    );

    const result = spawnSync(
      process.execPath,
      [tsxCliPath, "scripts/validate-restore-chunk.ts", "--backup", backupPath, "--chunk-size", "2"],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Chunk size valid for this backup/);
    assert.match(result.stdout, /totalChunks: 5/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("validate-restore-chunk rejects a chunk plan with excessive chunk count", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "sqr-restore-chunk-"));
  try {
    const backupPath = join(tempDir, "huge-backup.json");
    await writeFile(
      backupPath,
      JSON.stringify({
        rows: Array.from({ length: 10_001 }, (_, index) => index),
      }),
      "utf8",
    );

    const result = spawnSync(
      process.execPath,
      [tsxCliPath, "scripts/validate-restore-chunk.ts", "--backup", backupPath, "--chunk-size", "1"],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /too many restore chunks/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
