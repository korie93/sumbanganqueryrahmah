import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const vitePackageJsonPath = require.resolve("vite/package.json");
const viteCliPath = path.join(path.dirname(vitePackageJsonPath), "bin", "vite.js");

const run = () =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [viteCliPath, "build"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`vite build failed with exit code ${code}`));
    });
  });

run().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
