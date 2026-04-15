import process from "node:process";
import fs from "node:fs/promises";

const pidFilePath = process.argv[2] || "server.pid";
const POLL_INTERVAL_MS = 100;
const STOP_TIMEOUT_MS = 10_000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(
      error
      && typeof error === "object"
      && "code" in error
      && (error.code === "ESRCH" || error.code === "EINVAL")
    );
  }
}

async function main() {
  let rawPid;

  try {
    rawPid = await fs.readFile(pidFilePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      console.warn(`PID file not found at ${pidFilePath}; skipping server shutdown.`);
      return;
    }
    throw error;
  }

  const pid = Number.parseInt(String(rawPid || "").trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    console.warn(`PID file ${pidFilePath} does not contain a valid process id; skipping shutdown.`);
    return;
  }

  if (!isProcessAlive(pid)) {
    return;
  }

  process.kill(pid, "SIGTERM");
  const deadline = Date.now() + STOP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  if (isProcessAlive(pid)) {
    process.kill(pid, "SIGKILL");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
