import {
  collectClientTsconfigContractMatches,
  formatClientTsconfigContractReport,
} from "./lib/client-tsconfig-contract.mjs";

const result = collectClientTsconfigContractMatches();
const report = formatClientTsconfigContractReport(result);

if ((result.matches || []).length > 0) {
  console.error(report);
  process.exit(1);
}

console.log(report);
