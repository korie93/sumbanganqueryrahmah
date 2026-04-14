import path from "node:path";
import fs from "node:fs/promises";
import {
  BARE_COMMAND_PATTERN,
  readOptionalString,
  UNSAFE_ENV_VALUE_PATTERN,
} from "./collection-receipt-external-scan-shared";

async function resolveExistingFile(candidatePath: string): Promise<string | null> {
  try {
    if (!(await fs.stat(candidatePath)).isFile()) {
      return null;
    }
    return await fs.realpath(candidatePath);
  } catch {
    return null;
  }
}

async function resolveScannerCommandOnPath(command: string): Promise<string | null> {
  const pathEntries = String(readOptionalString("PATH") || "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (pathEntries.length === 0) {
    return null;
  }

  if (process.platform !== "win32") {
    for (const pathEntry of pathEntries) {
      const resolved = await resolveExistingFile(path.join(pathEntry, command));
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }

  const hasExtension = path.extname(command).length > 0;
  const pathExtensions = hasExtension
    ? [""]
    : String(readOptionalString("PATHEXT") || ".COM;.EXE;.BAT;.CMD")
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean);

  for (const pathEntry of pathEntries) {
    const directMatch = await resolveExistingFile(path.join(pathEntry, command));
    if (directMatch) {
      return directMatch;
    }

    if (hasExtension) {
      continue;
    }

    for (const extension of pathExtensions) {
      const resolved = await resolveExistingFile(path.join(pathEntry, `${command}${extension}`));
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}

export async function validateExternalScanCommand(command: string): Promise<string> {
  const normalized = command.trim();
  if (!normalized || UNSAFE_ENV_VALUE_PATTERN.test(normalized)) {
    throw new Error("COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND is invalid.");
  }

  if (path.isAbsolute(normalized)) {
    const resolved = await resolveExistingFile(normalized);
    if (!resolved) {
      throw new Error("COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND must point to an existing scanner executable.");
    }
    return resolved;
  }

  if (!BARE_COMMAND_PATTERN.test(normalized) || normalized !== path.basename(normalized)) {
    throw new Error(
      "COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND must be a bare executable name or an absolute scanner path.",
    );
  }

  const resolved = await resolveScannerCommandOnPath(normalized);
  if (!resolved) {
    throw new Error("COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND must resolve to an executable on PATH.");
  }

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

  return resolved;
}
