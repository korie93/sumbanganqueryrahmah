import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  readReleaseManifest,
  RELEASE_MANIFEST_FILENAME,
} from "./lib/release-manifest.mjs";

const cwd = process.cwd();
const artifactsRoot = path.resolve(cwd, "artifacts");
const packageRoot = path.resolve(
  cwd,
  process.env.RELEASE_PACKAGE_DIR || path.join("artifacts", "release", "package"),
);

function assertPathInsideArtifacts(targetPath) {
  const relative = path.relative(artifactsRoot, targetPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("RELEASE_PACKAGE_DIR must resolve to a child directory under artifacts/.");
  }
}

function copyRequired(relativePath) {
  const sourcePath = path.resolve(cwd, relativePath);
  const destinationPath = path.resolve(packageRoot, relativePath);
  const sourceStat = statSync(sourcePath);
  mkdirSync(path.dirname(destinationPath), { recursive: true });
  cpSync(sourcePath, destinationPath, {
    recursive: sourceStat.isDirectory(),
    force: true,
    errorOnExist: false,
  });
}

function collectFiles(directory, prefix = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolutePath, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error(`Release package cannot contain symbolic links or special files: ${relativePath}`);
    }
  }
  return files;
}

function writeFileChecksums() {
  const checksumPath = path.join(packageRoot, "release-files.sha512");
  const lines = collectFiles(packageRoot)
    .filter((relativePath) => relativePath !== "release-files.sha512")
    .sort((left, right) => left.localeCompare(right))
    .map((relativePath) => {
      const digest = createHash("sha512")
        .update(readFileSync(path.join(packageRoot, ...relativePath.split("/"))))
        .digest("hex");
      return `${digest}  ${relativePath}`;
    });
  writeFileSync(checksumPath, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o644 });
  return lines.length;
}

assertPathInsideArtifacts(packageRoot);

const manifestPath = path.join(cwd, "dist-local", RELEASE_MANIFEST_FILENAME);
const manifest = readReleaseManifest(manifestPath);
if (manifest.sourceDirty && process.env.SQR_ALLOW_DIRTY_RELEASE !== "1") {
  throw new Error(
    "Release packaging rejected a dirty source tree. Commit the reviewed changes and rebuild first.",
  );
}

rmSync(packageRoot, { recursive: true, force: true });
mkdirSync(packageRoot, { recursive: true });

for (const requiredPath of [
  "dist-local",
  "package-lock.json",
  "vendor",
  "drizzle",
  "scripts/db-migrate.mjs",
  "scripts/lib/postgres-migration-lock.mjs",
  "scripts/lib/postgres-preflight.mjs",
  "scripts/post-deploy-health-check.sh",
  "deploy/pm2/ecosystem.release.config.cjs",
  "deploy/immutable/deploy-release.sh",
  "deploy/immutable/rollback-release.sh",
]) {
  copyRequired(requiredPath);
}

const packageJson = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
if (packageJson.scripts && typeof packageJson.scripts === "object") {
  delete packageJson.scripts.prepare;
}
writeFileSync(
  path.join(packageRoot, "package.json"),
  `${JSON.stringify(packageJson, null, 2)}\n`,
  { encoding: "utf8", mode: 0o644 },
);

writeFileSync(
  path.join(packageRoot, RELEASE_MANIFEST_FILENAME),
  `${JSON.stringify(manifest, null, 2)}\n`,
  { encoding: "utf8", mode: 0o644 },
);

const fileCount = writeFileChecksums();
console.log(`Release package prepared: ${packageRoot}`);
console.log(`Release ID: ${manifest.releaseId}`);
console.log(`Checksummed files: ${fileCount}`);
