import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const SECRETLINT_BATCH_SIZE = 80;

const extraIgnoredPrefixes = [".git/", ".husky/_/"];

function shouldIgnoreTrackedFile(relativePath) {
  return extraIgnoredPrefixes.some((prefix) => relativePath.startsWith(prefix));
}

async function listTrackedTextFiles() {
  const { stdout } = await execFileAsync(
    "git",
    ["grep", "-Il", "", "--", "."],
    {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024 * 64,
    },
  );

  return stdout
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .filter((entry) => !shouldIgnoreTrackedFile(entry));
}

function chunkFiles(files, size) {
  const chunks = [];

  for (let index = 0; index < files.length; index += size) {
    chunks.push(files.slice(index, index + size));
  }

  return chunks;
}

function runSecretlintBatch(secretlintBin, files) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        secretlintBin,
        "--secretlintignore",
        ".secretlintignore",
        ...files,
      ],
      {
        cwd: repoRoot,
        stdio: "inherit",
      },
    );

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`secretlint exited with code ${code ?? "unknown"}.`));
    });
  });
}

async function run() {
  const trackedFiles = await listTrackedTextFiles();

  if (trackedFiles.length === 0) {
    console.log("No tracked text files to scan.");
    return;
  }

  const secretlintBin = path.join(repoRoot, "node_modules", "secretlint", "bin", "secretlint.js");
  const batches = chunkFiles(trackedFiles, SECRETLINT_BATCH_SIZE);

  for (const batch of batches) {
    await runSecretlintBatch(secretlintBin, batch);
  }
}

await run();
