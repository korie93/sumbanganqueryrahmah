import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  parseSha512ChecksumLine,
  readVendorXlsxChecksum,
  verifyXlsxVendorIntegrity,
} from "../lib/xlsx-vendor-integrity.mjs";

test("parseSha512ChecksumLine accepts sha512sum-compatible entries", () => {
  const parsed = parseSha512ChecksumLine(`${"a".repeat(128)}  xlsx-0.20.2.tgz`);

  assert.deepEqual(parsed, {
    fileName: "xlsx-0.20.2.tgz",
    sha512: "a".repeat(128),
  });
});

test("parseSha512ChecksumLine rejects malformed entries", () => {
  assert.throws(
    () => parseSha512ChecksumLine("not-a-checksum  xlsx-0.20.2.tgz"),
    /Invalid SHA512 checksum line/,
  );
});

test("vendored SheetJS tarball matches CHECKSUMS.sha512", async () => {
  const checksum = await readVendorXlsxChecksum();
  const verified = await verifyXlsxVendorIntegrity();

  assert.equal(checksum.fileName, "xlsx-0.20.2.tgz");
  assert.equal(verified.filePath, "vendor/sheetjs/xlsx-0.20.2.tgz");
  assert.equal(verified.sha512, checksum.sha512);
});

test("release workflow verifies XLSX vendor integrity before release readiness", () => {
  const workflow = readFileSync(
    path.resolve(process.cwd(), ".github", "workflows", "release-verification.yml"),
    "utf8",
  );
  const integrityStepIndex = workflow.indexOf("Verify XLSX vendor integrity");
  const releaseStepIndex = workflow.indexOf("Run release readiness verification");

  assert.ok(integrityStepIndex > 0);
  assert.ok(releaseStepIndex > integrityStepIndex);
  assert.match(workflow, /npm run verify:xlsx-vendor-integrity/);
});
