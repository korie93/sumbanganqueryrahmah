import fs from "node:fs";
import path from "node:path";
import { isPathInsideDirectory } from "../config/upload-paths";
import { internalMetrics, type InternalMetricsRecorder } from "../internal/metrics";
import { COLLECTION_RECEIPT_DIR } from "./collection-receipt-files";
import { logger } from "./logger";

export class PathTraversalError extends Error {
  readonly name = "PathTraversalError";
}

export class PathAccessError extends Error {
  readonly name = "PathAccessError";
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.code = code;
  }
}

type PathSecurityLogger = Pick<typeof logger, "error">;

export type PathBoundsOptions = {
  allowedDirectories: readonly string[];
  context: string;
  log?: PathSecurityLogger;
  metrics?: Pick<InternalMetricsRecorder, "increment">;
};

function resolveAllowedDirectoryRealPaths(allowedDirectories: readonly string[]): string[] {
  return allowedDirectories.map((directory) => {
    const resolvedDirectory = path.resolve(directory);
    try {
      return fs.realpathSync(resolvedDirectory);
    } catch {
      return resolvedDirectory;
    }
  });
}

export function assertPathWithinBounds(
  absolutePath: string,
  options: PathBoundsOptions,
): string {
  const candidatePath = String(absolutePath || "").trim();
  if (!candidatePath) {
    throw new PathAccessError("File path is empty.");
  }

  let realPath: string;
  try {
    realPath = fs.realpathSync(path.resolve(candidatePath));
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String((error as NodeJS.ErrnoException).code || "")
      : null;
    throw new PathAccessError("File path is not accessible.", code || null);
  }

  const allowedRealDirectories = resolveAllowedDirectoryRealPaths(options.allowedDirectories);
  const isAllowed = allowedRealDirectories.some((allowedDirectory) => (
    isPathInsideDirectory({
      parentDir: allowedDirectory,
      candidatePath: realPath,
    })
  ));

  if (!isAllowed) {
    const metrics = options.metrics ?? internalMetrics;
    const log = options.log ?? logger;
    metrics.increment("collectionReceiptPathTraversalBlockedTotal");
    log.error("File path outside allowed bounds blocked", {
      event: "path_traversal_attempt_blocked",
      operation: options.context,
      reason: "outside_allowed_directory",
    });
    throw new PathTraversalError("Access denied: path outside allowed directories.");
  }

  return realPath;
}

export function assertCollectionReceiptPathWithinBounds(
  absolutePath: string,
  context = "collection-receipt-file-serve",
): string {
  return assertPathWithinBounds(absolutePath, {
    allowedDirectories: [COLLECTION_RECEIPT_DIR],
    context,
  });
}
