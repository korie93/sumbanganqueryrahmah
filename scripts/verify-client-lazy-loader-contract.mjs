import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatClientLazyLoaderContractReport,
  loadClientLazyLoaderContractFiles,
  validateClientLazyLoaderContract,
} from "./lib/client-lazy-loader-contract.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const filesByPath = loadClientLazyLoaderContractFiles({ cwd: repoRoot });
const validation = validateClientLazyLoaderContract({ filesByPath });
const report = formatClientLazyLoaderContractReport(validation);

if (validation.failures.length > 0) {
  console.error(report);
  process.exit(1);
}

console.log(report);
