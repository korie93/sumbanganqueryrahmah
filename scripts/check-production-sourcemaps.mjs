import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SOURCEMAP_SCAN_DIRS,
  resolveProductionSourcemapPolicy,
} from "./lib/production-sourcemap-policy.mjs";

function parseArgs(argv) {
  const dirs = [];
  let forceProduction;

  for (const arg of argv) {
    if (arg === "--production") {
      forceProduction = true;
      continue;
    }

    if (arg === "--non-production") {
      forceProduction = false;
      continue;
    }

    dirs.push(arg);
  }

  return {
    forceProduction,
    scanDirs: dirs.length > 0 ? dirs : DEFAULT_SOURCEMAP_SCAN_DIRS,
  };
}

export async function runProductionSourcemapCheck(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = await resolveProductionSourcemapPolicy(options);
  const modeLabel = result.productionLike ? "production" : "non-production";

  if (!result.allowed) {
    console.error(`FATAL: production sourcemap gate failed (${modeLabel}).`);
    console.error(result.reason);
    if (result.sourcemapFiles.length > 0) {
      for (const filePath of result.sourcemapFiles.slice(0, 20)) {
        console.error(` - ${path.relative(process.cwd(), filePath)}`);
      }
      if (result.sourcemapFiles.length > 20) {
        console.error(` - ...and ${result.sourcemapFiles.length - 20} more`);
      }
    }
    process.exitCode = 1;
    return result;
  }

  console.log(
    `Production sourcemap gate passed (${modeLabel}; ${result.sourcemapFiles.length} .map file(s)).`,
  );
  return result;
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (invokedFilePath === currentFilePath) {
  runProductionSourcemapCheck().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
