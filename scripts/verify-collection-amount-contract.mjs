import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatCollectionAmountContractReport,
  loadCollectionAmountContractFiles,
  validateCollectionAmountContract,
} from "./lib/collection-amount-contract.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const filesByPath = loadCollectionAmountContractFiles({ cwd: repoRoot });
const validation = validateCollectionAmountContract({ filesByPath });
const report = formatCollectionAmountContractReport(validation);

if (validation.failures.length > 0) {
  console.error(report);
  process.exit(1);
}

console.log(report);
