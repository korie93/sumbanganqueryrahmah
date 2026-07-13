import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  createReleaseManifest,
  RELEASE_MANIFEST_FILENAME,
  writeReleaseManifest,
} from "./lib/release-manifest.mjs";

const cwd = process.cwd();

function runGit(args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const packageJson = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
const commitSha = String(process.env.SQR_RELEASE_SHA || process.env.GITHUB_SHA || runGit(["rev-parse", "HEAD"]));
const sourceDirty = runGit(["status", "--porcelain", "--untracked-files=normal"]).length > 0;
const manifest = createReleaseManifest({
  builtAt: process.env.SQR_RELEASE_BUILT_AT || new Date().toISOString(),
  commitSha,
  sourceDirty,
  version: packageJson.version,
});

const outputDirectory = path.join(cwd, "dist-local");
const outputPath = path.join(outputDirectory, RELEASE_MANIFEST_FILENAME);
mkdirSync(outputDirectory, { recursive: true });
writeReleaseManifest(outputPath, manifest);

console.log(`Release manifest written: ${manifest.releaseId}${manifest.sourceDirty ? " (dirty source)" : ""}`);
