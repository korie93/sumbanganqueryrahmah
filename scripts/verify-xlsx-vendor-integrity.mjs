import process from "node:process";
import { verifyXlsxVendorIntegrity } from "./lib/xlsx-vendor-integrity.mjs";

async function run() {
  const result = await verifyXlsxVendorIntegrity();
  console.log(`Verified XLSX vendor tarball integrity: ${result.filePath} sha512=${result.sha512}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
