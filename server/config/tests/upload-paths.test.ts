import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  isPathInsideDirectory,
  resolveUploadsRootDir,
} from "../upload-paths";

test("resolveUploadsRootDir keeps uploads inside the project workspace", () => {
  const projectRoot = path.resolve(process.cwd(), "tmp-project");

  assert.equal(
    resolveUploadsRootDir({ projectRoot }),
    path.join(projectRoot, "uploads"),
  );
  assert.equal(
    resolveUploadsRootDir({ projectRoot, uploadsDirName: "var/uploads" }),
    path.join(projectRoot, "var", "uploads"),
  );
});

test("resolveUploadsRootDir rejects workspace root and path traversal", () => {
  const projectRoot = path.resolve(process.cwd(), "tmp-project");

  assert.throws(
    () => resolveUploadsRootDir({ projectRoot, uploadsDirName: "." }),
    /Uploads root must resolve inside the project workspace/i,
  );
  assert.throws(
    () => resolveUploadsRootDir({ projectRoot, uploadsDirName: "../outside" }),
    /Uploads root must resolve inside the project workspace/i,
  );
});

test("isPathInsideDirectory rejects sibling paths with shared prefixes", () => {
  const parentDir = path.resolve(process.cwd(), "uploads");
  const siblingPath = path.resolve(process.cwd(), "uploads-malicious", "receipt.pdf");

  assert.equal(isPathInsideDirectory({ parentDir, candidatePath: siblingPath }), false);
  assert.equal(
    isPathInsideDirectory({
      parentDir,
      candidatePath: path.join(parentDir, "collection-receipts", "receipt.pdf"),
    }),
    true,
  );
});
