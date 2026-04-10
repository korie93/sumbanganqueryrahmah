import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatCollectionPiiRolloutContractReport,
  loadCollectionPiiRolloutContractFiles,
  validateCollectionPiiRolloutContract,
} from "./lib/collection-pii-rollout-contract.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const filesByPath = loadCollectionPiiRolloutContractFiles({ cwd: repoRoot });
const validation = validateCollectionPiiRolloutContract({ filesByPath });
const report = formatCollectionPiiRolloutContractReport(validation);

if (validation.failures.length > 0) {
  console.error(report);
  process.exit(1);
}

console.log(report);
