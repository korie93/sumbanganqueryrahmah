import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rootDir = process.cwd();
const clientSrcDir = path.join(rootDir, "client", "src");
const MAX_TEST_COMMAND_LENGTH = 24_000;

async function findClientTestFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findClientTestFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(entryPath);
    }
  }

  return files;
}

async function run() {
  const testFiles = (await findClientTestFiles(clientSrcDir))
    .map((filePath) => path.relative(rootDir, filePath))
    .sort((left, right) => left.localeCompare(right));

  if (testFiles.length === 0) {
    console.error("No client test files were found under client/src.");
    process.exitCode = 1;
    return;
  }

  const tsxCliPath = require.resolve("tsx/cli");
  const testBatches = buildTestBatches(testFiles, tsxCliPath);

  for (const [index, batch] of testBatches.entries()) {
    await runClientTestBatch(tsxCliPath, batch, index + 1, testBatches.length);
  }
}

function buildTestBatches(testFiles, tsxCliPath) {
  const batches = [];
  let currentBatch = [];
  let currentLength = estimateCommandLength([tsxCliPath, "--test"]);

  for (const testFile of testFiles) {
    const nextLength = currentLength + estimateCommandLength([testFile]);
    if (currentBatch.length > 0 && nextLength > MAX_TEST_COMMAND_LENGTH) {
      batches.push(currentBatch);
      currentBatch = [];
      currentLength = estimateCommandLength([tsxCliPath, "--test"]);
    }

    currentBatch.push(testFile);
    currentLength += estimateCommandLength([testFile]);
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

function estimateCommandLength(args) {
  return args.reduce((total, arg) => total + String(arg).length + 3, process.execPath.length + 1);
}

async function runClientTestBatch(tsxCliPath, testFiles, batchNumber, batchCount) {
  if (batchCount > 1) {
    console.log(`Running client test batch ${batchNumber}/${batchCount} (${testFiles.length} files)`);
  }

  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [tsxCliPath, "--test", ...testFiles],
      {
        cwd: rootDir,
        stdio: "inherit",
      },
    );

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Client tests terminated by signal ${signal}`));
        return;
      }

      if (typeof code === "number" && code !== 0) {
        reject(new Error(`Client tests exited with code ${code}`));
        return;
      }

      resolve();
    });
  });
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
