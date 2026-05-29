import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_SOURCEMAP_SCAN_DIRS = ["dist-local"];

export function isProductionLikeEnvironment(env = process.env) {
  return env.NODE_ENV === "production"
    || env.APP_ENV === "production"
    || env.DEPLOY_ENV === "production"
    || env.VERCEL_ENV === "production";
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(rootPath) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function findSourcemapFiles(scanDirs = DEFAULT_SOURCEMAP_SCAN_DIRS) {
  const resolvedDirs = scanDirs.map((dir) => path.resolve(dir));
  const existingDirs = [];
  const sourcemapFiles = [];

  for (const dir of resolvedDirs) {
    if (!await pathExists(dir)) {
      continue;
    }

    existingDirs.push(dir);
    const files = await walkFiles(dir);
    sourcemapFiles.push(
      ...files.filter((filePath) => filePath.endsWith(".map")),
    );
  }

  return {
    checkedDirs: resolvedDirs,
    existingDirs,
    sourcemapFiles: sourcemapFiles.sort(),
  };
}

export async function resolveProductionSourcemapPolicy({
  env = process.env,
  forceProduction,
  scanDirs = DEFAULT_SOURCEMAP_SCAN_DIRS,
} = {}) {
  const productionLike =
    typeof forceProduction === "boolean"
      ? forceProduction
      : isProductionLikeEnvironment(env);
  const scan = await findSourcemapFiles(scanDirs);

  if (scan.existingDirs.length === 0) {
    return {
      ...scan,
      allowed: false,
      productionLike,
      reason: `No build output directory found. Checked: ${scan.checkedDirs.join(", ")}`,
    };
  }

  if (productionLike && scan.sourcemapFiles.length > 0) {
    return {
      ...scan,
      allowed: false,
      productionLike,
      reason: `${scan.sourcemapFiles.length} sourcemap file(s) found in production artifact.`,
    };
  }

  return {
    ...scan,
    allowed: true,
    productionLike,
    reason: "ok",
  };
}
