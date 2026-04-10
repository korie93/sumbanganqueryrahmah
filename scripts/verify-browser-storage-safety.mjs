import {
  collectBrowserStorageSafetyMatches,
  formatBrowserStorageSafetyReport,
} from "./lib/browser-storage-safety.mjs";

const result = collectBrowserStorageSafetyMatches();
const report = formatBrowserStorageSafetyReport(result);

if ((result.matches || []).length > 0) {
  console.error(report);
  process.exit(1);
}

console.log(report);
