import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import {
  DESIGN_TOKEN_SPACING_REQUIREMENTS,
  formatDesignTokenSpacingContractReport,
  validateDesignTokenSpacingContract,
} from "./lib/design-token-spacing.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const filesByPath = Object.fromEntries(
  DESIGN_TOKEN_SPACING_REQUIREMENTS.map((requirement) => [
    requirement.filePath,
    readFileSync(path.join(repoRoot, requirement.filePath), "utf8"),
  ]),
);
const validation = validateDesignTokenSpacingContract({ filesByPath });
const report = formatDesignTokenSpacingContractReport(validation);

if (validation.failures.length > 0) {
  console.error(report);
  process.exit(1);
}

console.log(report);
