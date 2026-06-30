import {
  collectServerJsonParsingContractMatches,
  formatServerJsonParsingContractReport,
} from "./lib/server-json-parsing-contract.mjs";

const result = collectServerJsonParsingContractMatches();
const report = formatServerJsonParsingContractReport(result);

if ((result.matches || []).length > 0) {
  console.error(report);
  process.exit(1);
}

console.log(report);
