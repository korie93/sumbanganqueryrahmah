import path from "node:path";
import fs from "node:fs/promises";
import { isProductionLikeEnvironment } from "../config/runtime-environment";
import { readString } from "../config/runtime-config-read-utils";
import {
  BARE_COMMAND_PATTERN,
  UNSAFE_ENV_VALUE_PATTERN,
} from "./collection-receipt-external-scan-shared";
import { logger } from "./logger";
import {
  assertCollectionReceiptPathWithinBounds,
  PathTraversalError,
} from "./path-security";

export type ExternalScanCommandValidationOptions = {
  readonly allowDevelopmentScannerShim?: boolean;
};

const APPROVED_SCANNER_BASENAMES = new Set([
  "clamdscan",
  "clamdscan.exe",
  "clamscan",
  "clamscan.exe",
]);

const DEVELOPMENT_SCANNER_SHIM_BASENAMES = new Set(["node", "node.exe"]);

const APPROVED_SCANNER_DIRECTORIES = new Set(
  process.platform === "win32"
    ? [
      "C:\\Program Files\\ClamAV",
      "C:\\Program Files\\ClamAV\\bin",
      "C:\\Program Files (x86)\\ClamAV",
      "C:\\Program Files (x86)\\ClamAV\\bin",
    ].map(normalizePathForComparison)
    : [
      "/usr/bin",
      "/usr/local/bin",
      "/opt/clamav/bin",
      "/opt/scanner/bin",
    ].map(normalizePathForComparison),
);

function normalizePathForComparison(value: string): string {
  const normalized = path.resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isApprovedScannerDirectory(resolvedPath: string): boolean {
  return APPROVED_SCANNER_DIRECTORIES.has(normalizePathForComparison(path.dirname(resolvedPath)));
}

async function isCurrentNodeExecutable(resolvedPath: string): Promise<boolean> {
  if (!DEVELOPMENT_SCANNER_SHIM_BASENAMES.has(path.basename(resolvedPath).toLowerCase())) {
    return false;
  }

  try {
    const currentNodePath = await fs.realpath(process.execPath);
    return normalizePathForComparison(resolvedPath) === normalizePathForComparison(currentNodePath);
  } catch (error) {
    logger.debug("Failed to resolve current Node executable realpath during scanner validation", {
      operation: "external_scan_current_node_realpath",
      error: error instanceof Error ? error.message : "Unknown realpath failure",
    });
    return normalizePathForComparison(resolvedPath) === normalizePathForComparison(process.execPath);
  }
}

function shouldAllowDevelopmentScannerShim(options?: ExternalScanCommandValidationOptions): boolean {
  return options?.allowDevelopmentScannerShim ?? !isProductionLikeEnvironment();
}

function isPotentiallyApprovedBareCommand(
  command: string,
  options?: ExternalScanCommandValidationOptions,
): boolean {
  const basename = command.toLowerCase();
  return APPROVED_SCANNER_BASENAMES.has(basename)
    || (shouldAllowDevelopmentScannerShim(options) && DEVELOPMENT_SCANNER_SHIM_BASENAMES.has(basename));
}

async function assertApprovedScannerExecutable(
  resolvedPath: string,
  options?: ExternalScanCommandValidationOptions,
): Promise<void> {
  const basename = path.basename(resolvedPath).toLowerCase();
  if (APPROVED_SCANNER_BASENAMES.has(basename)) {
    if (isApprovedScannerDirectory(resolvedPath)) {
      return;
    }
    throw new Error("COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND must resolve inside an approved scanner directory.");
  }

  if (shouldAllowDevelopmentScannerShim(options) && await isCurrentNodeExecutable(resolvedPath)) {
    return;
  }

  throw new Error("COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND must resolve to an approved scanner executable.");
}

async function resolveExistingFile(
  candidatePath: string,
  options: { readonly requireExecutable?: boolean } = {},
): Promise<string | null> {
  try {
    const resolvedPath = await fs.realpath(candidatePath);
    const stats = await fs.stat(resolvedPath);
    if (!stats.isFile()) {
      return null;
    }
    if (options.requireExecutable && process.platform !== "win32" && (stats.mode & 0o111) === 0) {
      return null;
    }
    return resolvedPath;
  } catch (error) {
    logger.debug("External scanner path candidate did not resolve to an accessible file", {
      operation: "external_scan_resolve_existing_file",
      requireExecutable: options.requireExecutable === true,
      error: error instanceof Error ? error.message : "Unknown file resolution failure",
    });
    return null;
  }
}

async function resolveScannerCommandOnPath(command: string): Promise<string | null> {
  const pathEntries = readString("PATH", "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (pathEntries.length === 0) {
    return null;
  }

  if (process.platform !== "win32") {
    for (const pathEntry of pathEntries) {
      const resolved = await resolveExistingFile(path.join(pathEntry, command), {
        requireExecutable: true,
      });
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }

  const hasExtension = path.extname(command).length > 0;
  const pathExtensions = hasExtension
    ? [""]
    : readString("PATHEXT", ".COM;.EXE;.BAT;.CMD")
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean);

  for (const pathEntry of pathEntries) {
    const directMatch = await resolveExistingFile(path.join(pathEntry, command), {
      requireExecutable: true,
    });
    if (directMatch) {
      return directMatch;
    }

    if (hasExtension) {
      continue;
    }

    for (const extension of pathExtensions) {
      const resolved = await resolveExistingFile(path.join(pathEntry, `${command}${extension}`), {
        requireExecutable: true,
      });
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}

export async function validateExternalScanCommand(
  command: string,
  options?: ExternalScanCommandValidationOptions,
): Promise<string> {
  const normalized = command.trim();
  if (!normalized || UNSAFE_ENV_VALUE_PATTERN.test(normalized)) {
    throw new Error("COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND is invalid.");
  }

  if (path.isAbsolute(normalized)) {
    const resolved = await resolveExistingFile(normalized, {
      requireExecutable: true,
    });
    if (!resolved) {
      throw new Error("COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND must point to an existing scanner executable.");
    }
    await assertApprovedScannerExecutable(resolved, options);
    return resolved;
  }

  if (!BARE_COMMAND_PATTERN.test(normalized) || normalized !== path.basename(normalized)) {
    throw new Error(
      "COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND must be a bare executable name or an absolute scanner path.",
    );
  }

  if (!isPotentiallyApprovedBareCommand(normalized, options)) {
    throw new Error("COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND must name an approved scanner executable.");
  }

  const resolved = await resolveScannerCommandOnPath(normalized);
  if (!resolved) {
    throw new Error("COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND must resolve to an executable on PATH.");
  }
  await assertApprovedScannerExecutable(resolved, options);

  return resolved;
}

export async function validateExternalScanFilePath(filePath: string): Promise<string> {
  const normalized = String(filePath || "").trim();
  if (!normalized || UNSAFE_ENV_VALUE_PATTERN.test(normalized)) {
    throw new Error("receipt file path is invalid.");
  }

  const resolved = await resolveExistingFile(path.resolve(normalized));
  if (!resolved) {
    throw new Error("receipt file path must point to an existing file.");
  }

  try {
    return assertCollectionReceiptPathWithinBounds(
      resolved,
      "collection-receipt-external-scan-target",
    );
  } catch (error) {
    if (error instanceof PathTraversalError) {
      throw new Error("receipt file path must stay inside the managed receipt directory.");
    }
    throw error;
  }
}
