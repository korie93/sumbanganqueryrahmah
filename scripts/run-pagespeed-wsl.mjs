import process from "node:process";
import { execFile, spawn } from "node:child_process";

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: options.env || process.env,
      stdio: options.stdio || "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

function execFileText(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        reject({
          error,
          stdout,
          stderr,
        });
        return;
      }

      resolve({
        stdout,
        stderr,
      });
    });
  });
}

function toWslPath(windowsPath) {
  const normalized = windowsPath.replace(/\\/g, "/");
  const driveMatch = normalized.match(/^([A-Za-z]):\/(.*)$/);
  if (!driveMatch) {
    throw new Error(`Cannot convert path to WSL form: ${windowsPath}`);
  }

  const drive = driveMatch[1].toLowerCase();
  const remainder = driveMatch[2];
  return `/mnt/${drive}/${remainder}`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function normalizeWslOutput(value) {
  return String(value || "").replace(/\u0000/g, "");
}

async function assertWslInstalled() {
  try {
    await execFileText("wsl.exe", ["--status"]);
  } catch (result) {
    const stderr = normalizeWslOutput(result?.stderr);
    const stdout = normalizeWslOutput(result?.stdout);
    const combined = `${stdout}\n${stderr}`;
    if (/not installed/i.test(combined)) {
      throw new Error(
        [
          "WSL is not installed on this machine.",
          "Install it with: wsl.exe --install",
          "Then reboot Windows and rerun: npm run perf:pagespeed:wsl",
        ].join("\n"),
      );
    }

    throw new Error(`Unable to verify WSL status.\n${combined}`.trim());
  }
}

async function run() {
  if (process.platform !== "win32") {
    await runCommand(process.execPath, ["scripts/run-pagespeed-local-strict.mjs"]);
    return;
  }

  await assertWslInstalled();

  const repoPath = toWslPath(process.cwd());
  const command = [
    "cd",
    shellQuote(repoPath),
    "&&",
    "node",
    "scripts/run-pagespeed-local-strict.mjs",
  ].join(" ");

  await runCommand("wsl.exe", ["bash", "-lc", command]);
}

run().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
