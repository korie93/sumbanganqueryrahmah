import {
  collectClientJsonParsingContractMatches,
  formatClientJsonParsingContractReport,
} from "./lib/client-json-parsing-contract.mjs";

const result = collectClientJsonParsingContractMatches();
const report = formatClientJsonParsingContractReport(result);

if ((result.matches || []).length > 0) {
  console.error(report);
  process.exit(1);
}

console.log(report);
