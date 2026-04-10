import {
  collectClientEntryShellContractMatches,
  formatClientEntryShellContractReport,
} from "./lib/client-entry-shell-contract.mjs";

const result = collectClientEntryShellContractMatches();
const report = formatClientEntryShellContractReport(result);

if ((result.matches || []).length > 0) {
  console.error(report);
  process.exit(1);
}

console.log(report);
