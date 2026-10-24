import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { isPathInsideDirectory, resolveUploadsRootDir } from "../../server/config/upload-paths";

// Lexical policy only: realpath/symlink/race tests remain in the existing
// server/routes/tests/path-security.test.ts sandboxed filesystem suite.
const projectRoot = path.resolve("audit-fixtures", "project");
const receiptRoot = path.join(projectRoot, "uploads", "collection-receipts");

test("receipt namespace does not accept a sibling with the same string prefix", () => {
  for (const candidatePath of [
    `${receiptRoot}-outside/receipt.pdf`,
    path.resolve(receiptRoot, "..", "private.pdf"),
    path.resolve(projectRoot, "private.pdf"),
  ]) {
    assert.equal(isPathInsideDirectory({ parentDir: receiptRoot, candidatePath }), false);
  }
  assert.equal(isPathInsideDirectory({ parentDir: receiptRoot, candidatePath: path.join(receiptRoot, "receipt.pdf") }), true);
});

test("configured uploads root cannot be the workspace itself or escape it", () => {
  for (const uploadsDirName of [".", "..", "../outside", path.resolve(projectRoot, "..", "outside")]) {
    assert.throws(() => resolveUploadsRootDir({ projectRoot, uploadsDirName }));
  }
  assert.equal(resolveUploadsRootDir({ projectRoot, uploadsDirName: "uploads" }), path.join(projectRoot, "uploads"));
});
