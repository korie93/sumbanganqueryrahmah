import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatClientBreakpointContractReport,
  loadClientBreakpointContractFiles,
  validateClientBreakpointContract,
} from "./lib/client-breakpoint-contract.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const filesByPath = loadClientBreakpointContractFiles({ cwd: repoRoot });
const validation = validateClientBreakpointContract({ filesByPath });
const report = formatClientBreakpointContractReport(validation);

if (validation.failures.length > 0) {
  console.error(report);
  process.exit(1);
}

console.log(report);
