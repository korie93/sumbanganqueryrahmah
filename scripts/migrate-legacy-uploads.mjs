import { constants as fsConstants } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  opendir,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function isPathInside(parentPath, candidatePath) {
  const relativePath = path.relative(parentPath, candidatePath);
  return relativePath === "" || (
    Boolean(relativePath)
    && !relativePath.startsWith("..")
    && !path.isAbsolute(relativePath)
  );
}

async function readExistingEntryType(entryPath) {
  try {
    const stats = await lstat(entryPath);
    if (stats.isSymbolicLink()) return "symlink";
    if (stats.isDirectory()) return "directory";
    if (stats.isFile()) return "file";
    return "unsupported";
  } catch (error) {
    if (error?.code === "ENOENT") return "missing";
    throw error;
  }
}

export async function migrateLegacyUploads(sourcePath, destinationPath) {
  const sourceInput = path.resolve(String(sourcePath || ""));
  const destinationInput = path.resolve(String(destinationPath || ""));
  const sourceInputType = await readExistingEntryType(sourceInput);
  if (sourceInputType !== "directory") {
    throw new Error("Legacy uploads source must be a regular directory.");
  }

  await mkdir(destinationInput, { recursive: true });
  const destinationInputType = await readExistingEntryType(destinationInput);
  if (destinationInputType !== "directory") {
    throw new Error("Shared uploads destination must be a regular directory.");
  }

  const sourceRoot = await realpath(sourceInput);
  const destinationRoot = await realpath(destinationInput);
  if (sourceRoot === destinationRoot) {
    return { copiedFiles: 0, preservedFiles: 0 };
  }
  if (isPathInside(sourceRoot, destinationRoot)) {
    throw new Error("Shared uploads destination cannot be inside the legacy source.");
  }
  if (isPathInside(destinationRoot, sourceRoot)) {
    throw new Error("Legacy uploads source cannot be inside shared storage.");
  }

  const result = { copiedFiles: 0, preservedFiles: 0 };

  async function migrateDirectory(sourceDirectory, relativeDirectory = "") {
    const directory = await opendir(sourceDirectory);
    for await (const entry of directory) {
      const sourceEntryPath = path.join(sourceDirectory, entry.name);
      const relativeEntryPath = path.join(relativeDirectory, entry.name);
      const destinationEntryPath = path.resolve(destinationRoot, relativeEntryPath);
      if (!isPathInside(destinationRoot, destinationEntryPath)) {
        throw new Error("Legacy uploads entry resolves outside shared storage.");
      }

      const sourceEntryType = await readExistingEntryType(sourceEntryPath);
      if (sourceEntryType === "directory") {
        const destinationEntryType = await readExistingEntryType(destinationEntryPath);
        if (destinationEntryType === "missing") {
          await mkdir(destinationEntryPath);
        } else if (destinationEntryType !== "directory") {
          throw new Error("Legacy uploads directory conflicts with an existing shared entry.");
        }
        await migrateDirectory(sourceEntryPath, relativeEntryPath);
        continue;
      }

      if (sourceEntryType !== "file") {
        throw new Error("Legacy uploads source contains a symbolic link or unsupported entry.");
      }

      const destinationEntryType = await readExistingEntryType(destinationEntryPath);
      if (destinationEntryType === "file") {
        result.preservedFiles += 1;
        continue;
      }
      if (destinationEntryType !== "missing") {
        throw new Error("Legacy upload file conflicts with an existing shared entry.");
      }

      try {
        await copyFile(sourceEntryPath, destinationEntryPath, fsConstants.COPYFILE_EXCL);
        result.copiedFiles += 1;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const racedDestinationType = await readExistingEntryType(destinationEntryPath);
        if (racedDestinationType !== "file") {
          throw new Error("Legacy upload destination changed to an unsafe entry during migration.");
        }
        result.preservedFiles += 1;
      }
    }
  }

  await migrateDirectory(sourceRoot);
  return result;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const sourcePath = process.argv[2];
  const destinationPath = process.argv[3];
  if (!sourcePath || !destinationPath) {
    console.error("Usage: node scripts/migrate-legacy-uploads.mjs <source> <destination>");
    process.exitCode = 64;
  } else {
    migrateLegacyUploads(sourcePath, destinationPath)
      .then(({ copiedFiles, preservedFiles }) => {
        console.log(
          `Legacy uploads merged into shared storage: copied=${copiedFiles} preserved=${preservedFiles}`,
        );
      })
      .catch((error) => {
        console.error(error instanceof Error ? error.message : "Legacy uploads migration failed.");
        process.exitCode = 1;
      });
  }
}
