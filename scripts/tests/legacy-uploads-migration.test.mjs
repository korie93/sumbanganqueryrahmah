import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { migrateLegacyUploads } from "../migrate-legacy-uploads.mjs";

test("legacy uploads migration copies missing files without overwriting shared files", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sqr-legacy-uploads-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "legacy");
  const destination = path.join(root, "shared");

  await mkdir(path.join(source, "collection-receipts"), { recursive: true });
  await mkdir(path.join(destination, "collection-receipts"), { recursive: true });
  await writeFile(path.join(source, "collection-receipts", "legacy.pdf"), "legacy");
  await writeFile(path.join(source, "collection-receipts", "collision.pdf"), "old");
  await writeFile(path.join(destination, "collection-receipts", "collision.pdf"), "new");

  const result = await migrateLegacyUploads(source, destination);

  assert.deepEqual(result, { copiedFiles: 1, preservedFiles: 1 });
  assert.equal(
    await readFile(path.join(destination, "collection-receipts", "legacy.pdf"), "utf8"),
    "legacy",
  );
  assert.equal(
    await readFile(path.join(destination, "collection-receipts", "collision.pdf"), "utf8"),
    "new",
  );
  assert.equal(
    await readFile(path.join(source, "collection-receipts", "legacy.pdf"), "utf8"),
    "legacy",
  );
});

test("legacy uploads migration rejects symbolic links", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sqr-legacy-uploads-link-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "legacy");
  const destination = path.join(root, "shared");
  const outsideFile = path.join(root, "outside.txt");

  await mkdir(source, { recursive: true });
  await mkdir(destination, { recursive: true });
  await writeFile(outsideFile, "outside");
  try {
    await symlink(outsideFile, path.join(source, "receipt-link.pdf"));
  } catch (error) {
    if (error?.code === "EPERM") {
      t.skip("Symbolic links require elevated privileges on this platform.");
      return;
    }
    throw error;
  }

  await assert.rejects(
    migrateLegacyUploads(source, destination),
    /symbolic link or unsupported entry/i,
  );
});

test("legacy uploads migration rejects overlapping storage roots", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sqr-legacy-uploads-overlap-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = path.join(root, "shared");
  const source = path.join(destination, "legacy");

  await mkdir(source, { recursive: true });

  await assert.rejects(
    migrateLegacyUploads(source, destination),
    /legacy uploads source cannot be inside shared storage/i,
  );
});
