import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const VENDOR_XLSX_TARBALL = "vendor/sheetjs/xlsx-0.20.2.tgz";
const EXPECTED_SHA256 = "14e0f4cf262c222f61a426864d192b71733a2af4a2b5c2c42d1e45317f246f7c";

async function run() {
  const tarballPath = path.resolve(process.cwd(), VENDOR_XLSX_TARBALL);
  const payload = await readFile(tarballPath);
  const actualSha256 = createHash("sha256").update(payload).digest("hex");

  if (actualSha256 !== EXPECTED_SHA256) {
    throw new Error(
      `XLSX vendor tarball integrity mismatch for ${VENDOR_XLSX_TARBALL}. Expected ${EXPECTED_SHA256}, got ${actualSha256}.`,
    );
  }

  console.log(`Verified XLSX vendor tarball integrity: ${VENDOR_XLSX_TARBALL} sha256=${actualSha256}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
