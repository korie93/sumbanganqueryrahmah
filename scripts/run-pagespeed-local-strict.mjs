import process from "node:process";
import { spawn } from "node:child_process";

const run = () =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/run-pagespeed-local.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PAGESPEED_SOFT_FAIL_RETRYABLE: "false",
      },
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Strict local PageSpeed run failed with exit code ${code}`));
    });
  });

run().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
