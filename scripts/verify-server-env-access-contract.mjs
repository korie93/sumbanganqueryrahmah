import {
  collectServerEnvAccessContractMatches,
  formatServerEnvAccessContractReport,
} from "./lib/server-env-access-contract.mjs";

const result = collectServerEnvAccessContractMatches();
const report = formatServerEnvAccessContractReport(result);

if ((result.matches || []).length > 0) {
  console.error(report);
  process.exit(1);
}

console.log(report);
