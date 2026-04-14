import { readFileSync } from "node:fs";
import {
  analyzePackageOverrides,
  analyzeVendoredPackageSources,
} from "./lib/dependency-audit.mjs";

let packageJson;
let packageLock;

try {
  packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
} catch (error) {
  console.error("Unable to inspect dependency metadata for supply-chain verification.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const overrideResult = analyzePackageOverrides(packageJson);
const vendoredSourceResult = analyzeVendoredPackageSources(packageJson, packageLock);

if (overrideResult.failures.length > 0 || vendoredSourceResult.failures.length > 0) {
  console.error("Dependency supply-chain verification failed:");
  for (const failure of overrideResult.failures) {
    console.error(`- ${failure}`);
  }
  for (const failure of vendoredSourceResult.failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Dependency supply-chain verification passed.");
