import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rootDir = process.cwd();
const clientSrcDir = path.join(rootDir, "client", "src");

async function findClientAccessibilityTestFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findClientAccessibilityTestFiles(entryPath));
      continue;
    }

    if (
      entry.isFile()
      && (
        entry.name.endsWith(".a11y.test.ts")
        || entry.name.endsWith(".a11y.test.tsx")
      )
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

async function run() {
  const testFiles = (await findClientAccessibilityTestFiles(clientSrcDir))
    .sort((left, right) => left.localeCompare(right));

  if (testFiles.length === 0) {
    console.error("No client accessibility test files were found under client/src.");
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
        reject(new Error(`Client accessibility tests terminated by signal ${signal}`));
        return;
      }

      if (typeof code === "number" && code !== 0) {
        reject(new Error(`Client accessibility tests exited with code ${code}`));
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
