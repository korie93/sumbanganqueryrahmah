import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyTypecheckBatch } from "./lib/typecheck-low-memory.mjs";

const script = fileURLToPath(import.meta.url);

function report(diagnostics) {
  for (const diagnostic of diagnostics) {
    const location = diagnostic.file ? `${diagnostic.file}(${diagnostic.line},${diagnostic.column}): ` : "";
    console.error(`${location}TS${diagnostic.code}: ${diagnostic.message}`);
  }
}

async function main() {
  if (process.argv[2] === "--worker") {
    const { checkTypecheckBatch } = await import("./lib/typecheck-low-memory.mjs");
    const input = JSON.parse(readFileSync(0, "utf8"));
    console.log(JSON.stringify(await checkTypecheckBatch(input.config, input.files, input.contextTypes)));
    return;
  }
  const options = { batchSize: 64, heapMb: 768, config: path.resolve("tsconfig.json"), contextTypes: [] };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--batch-size=")) options.batchSize = Number(arg.slice(13));
    else if (arg.startsWith("--heap-mb=")) options.heapMb = Number(arg.slice(10));
    else if (arg.startsWith("--project=")) options.config = path.resolve(arg.slice(10));
    else if (arg.startsWith("--context-types=")) options.contextTypes = arg.slice(16).split(",");
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 256
    || !Number.isInteger(options.heapMb) || options.heapMb < 256 || options.heapMb > 1536
    || options.contextTypes.some((name) => !/^[a-zA-Z0-9_@/-]+$/.test(name))) {
    throw new Error("Use batch-size 1–256 and heap-mb 256–1536.");
  }
  function worker(files) {
    const child = spawnSync(process.execPath,
      [`--max-old-space-size=${options.heapMb}`, "--max-semi-space-size=4", script, "--worker"], {
        input: JSON.stringify({ config: options.config, files, contextTypes: options.contextTypes }), encoding: "utf8",
        timeout: 120_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
      });
    if (child.error || child.status !== 0) {
      if (child.stderr) console.error(child.stderr);
      throw new Error(`Typecheck worker did not complete (${child.error?.message ?? child.signal ?? child.status}). No pass is recorded.`);
    }
    return JSON.parse(child.stdout);
  }
  console.log(`[typecheck:low-memory] Planning full project; worker heap ${options.heapMb} MiB.`);
  const plan = worker(null);
  if (plan.diagnostics.length) {
    report(plan.diagnostics);
    process.exitCode = 1;
    return;
  }
  console.log(`[typecheck:low-memory] ${plan.rootCount} roots; ${plan.ambientCount} shared ambient roots; ${plan.files.length} files to check.`);
  let checked = 0;
  for (let offset = 0; offset < plan.files.length; offset += options.batchSize) {
    const files = plan.files.slice(offset, offset + options.batchSize);
    console.log(`[typecheck:low-memory] Checking roots ${offset + 1}–${offset + files.length}.`);
    const result = worker(files);
    verifyTypecheckBatch(plan, result, files);
    if (result.diagnostics.length) {
      report(result.diagnostics);
      process.exitCode = 1;
      return;
    }
    checked += files.length;
    console.log(`[typecheck:low-memory] ${checked}/${plan.files.length} checked; worker heap used ${(result.heapUsedBytes / 1024 / 1024).toFixed(0)} MiB.`);
  }
  if (checked !== plan.files.length) throw new Error("Incomplete semantic coverage.");
  console.log(`[typecheck:low-memory] PASS: all ${checked} root files checked in local batches with unchanged compiler options. CI's full-program typecheck remains required.`);
}

main().catch((error) => {
  console.error(`[typecheck:low-memory] ${error.message}`);
  process.exitCode = 1;
});
