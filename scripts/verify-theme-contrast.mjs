import path from "node:path";
import process from "node:process";
import { readThemeTokenContrastReport } from "./lib/design-token-contrast.mjs";

const themeTokensPath = path.resolve(process.cwd(), "client", "src", "theme-tokens.css");
const report = readThemeTokenContrastReport(themeTokensPath);

function formatFailures(label, failures) {
  if (failures.length === 0) {
    return `${label}: pass`;
  }

  return `${label}: ${failures.join("; ")}`;
}

if (report.lightFailures.length > 0 || report.darkFailures.length > 0) {
  console.error("Theme contrast verification failed.");
  console.error(formatFailures("light", report.lightFailures));
  console.error(formatFailures("dark", report.darkFailures));
  process.exitCode = 1;
} else {
  console.log("Theme contrast verification passed for light and dark semantic token pairs.");
}
