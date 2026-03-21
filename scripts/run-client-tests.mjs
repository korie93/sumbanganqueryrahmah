import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rootDir = process.cwd();
const clientSrcDir = path.join(rootDir, "client", "src");

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
    .sort((left, right) => left.localeCompare(right));

  if (testFiles.length === 0) {
    console.error("No client test files were found under client/src.");
    process.exitCode = 1;
    return;
  }

  const tsxCliPath = require.resolve("tsx/cli");

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
