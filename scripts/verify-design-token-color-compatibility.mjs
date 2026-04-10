import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import {
  DESIGN_TOKEN_COLOR_COMPATIBILITY_REQUIREMENTS,
  formatDesignTokenColorCompatibilityReport,
  validateDesignTokenColorCompatibility,
} from "./lib/design-token-color-compatibility.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const filesByPath = Object.fromEntries(
  DESIGN_TOKEN_COLOR_COMPATIBILITY_REQUIREMENTS.map((requirement) => [
    requirement.filePath,
    readFileSync(path.join(repoRoot, requirement.filePath), "utf8"),
  ]),
);
const validation = validateDesignTokenColorCompatibility({ filesByPath });
const report = formatDesignTokenColorCompatibilityReport(validation);

if (validation.failures.length > 0) {
  console.error(report);
  process.exit(1);
}

console.log(report);
