import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { readBooleanEnvFlag } from "../config/runtime-environment";
import { logger } from "./logger";
import { CollectionReceiptSecurityError } from "./collection-receipt-security";

const DEFAULT_COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS = 15_000;
const DEFAULT_COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES = "1";
const EXTERNAL_SCAN_OUTPUT_LIMIT = 2_000;
const BARE_COMMAND_PATTERN = /^[a-zA-Z0-9._-]+$/;
const UNSAFE_ENV_VALUE_PATTERN = /[\0\r\n]/;

function readOptionalString(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function readInt(name: string, fallback: number, minimum = 1) {
  const parsed = Number(readOptionalString(name) ?? fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(minimum, Math.floor(parsed));
}

function parseExitCodeSet(rawValue: string, fallbackRawValue: string): Set<number> {
  const source = String(rawValue || fallbackRawValue)
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.trunc(entry));
  return new Set(source.length ? source : [0]);
}

function parseScannerArgsJson(): string[] {
  const raw = readOptionalString("COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON");
  if (!raw) {
    return ["{file}"];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
      throw new Error("must be a JSON array of strings");
    }
    for (const entry of parsed) {
      if (UNSAFE_ENV_VALUE_PATTERN.test(entry)) {
        throw new Error("must not contain control characters");
      }
    }
    return parsed as string[];
  } catch (error) {
    throw new Error(
      `COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON ${error instanceof Error ? error.message : "is invalid"}.`,
    );
  }
}

function validateExternalScanCommand(command: string): string {
  const normalized = command.trim();
  if (!normalized || UNSAFE_ENV_VALUE_PATTERN.test(normalized)) {
    throw new Error("COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND is invalid.");
  }

  if (path.isAbsolute(normalized)) {
    if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) {
      throw new Error("COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND must point to an existing scanner executable.");
    }
    return normalized;
  }

  if (!BARE_COMMAND_PATTERN.test(normalized) || normalized !== path.basename(normalized)) {
    throw new Error(
      "COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND must be a bare executable name or an absolute scanner path.",
    );
  }

  return normalized;
}

function summarizeOutput(output: string): string | null {
  const normalized = String(output || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, EXTERNAL_SCAN_OUTPUT_LIMIT);
}

type ExternalScanConfig = {
  enabled: boolean;
  command: string | null;
  args: string[];
  timeoutMs: number;
  failClosed: boolean;
  cleanExitCodes: Set<number>;
  rejectExitCodes: Set<number>;
};

function readExternalScanConfig(): ExternalScanConfig {
  return {
    enabled: readBooleanEnvFlag("COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED", false),
    command: readOptionalString("COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND"),
    args: parseScannerArgsJson(),
    timeoutMs: readInt(
      "COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS",
      DEFAULT_COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS,
      1_000,
    ),
    failClosed: readBooleanEnvFlag("COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED", true),
    cleanExitCodes: parseExitCodeSet(
      readOptionalString("COLLECTION_RECEIPT_EXTERNAL_SCAN_CLEAN_EXIT_CODES") || "0",
      "0",
    ),
    rejectExitCodes: parseExitCodeSet(
      readOptionalString("COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES")
        || DEFAULT_COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES,
      DEFAULT_COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES,
    ),
  };
}

function buildScanArgs(config: ExternalScanConfig, filePath: string): string[] {
  return config.args.map((entry) =>
    entry
      .replace(/\{file\}/g, filePath)
      .replace(/\{filename\}/g, path.basename(filePath)));
}

function createOperationalScanError(
  config: ExternalScanConfig,
  filePath: string,
  reasonCode: string,
  detail?: string | null,
) {
  const suffix = detail ? ` (${detail})` : "";
  const fileName = path.basename(filePath);
  const message = `Receipt external malware scan failed for ${fileName}${suffix}.`;

  if (config.failClosed) {
    return new CollectionReceiptSecurityError(message, reasonCode);
  }

  logger.warn("Collection receipt external malware scan skipped after operational failure", {
    fileName,
    reasonCode,
    detail: detail || null,
  });
  return null;
}

export async function scanCollectionReceiptWithExternalScanner(filePath: string): Promise<void> {
  const config = readExternalScanConfig();
  if (!config.enabled) {
    return;
  }

  if (!config.command) {
    const error = createOperationalScanError(config, filePath, "external-scan-command-missing");
    if (error) {
      throw error;
    }
    return;
  }

  let scannerCommand: string;
  try {
    scannerCommand = validateExternalScanCommand(config.command);
  } catch (error) {
    const operational = createOperationalScanError(
      config,
      filePath,
      "external-scan-command-invalid",
      error instanceof Error ? error.message : "invalid scanner command",
    );
    if (operational) {
      throw operational;
    }
    return;
  }

  const args = buildScanArgs(config, filePath);
  const fileName = path.basename(filePath);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(scannerCommand, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let resolved = false;
    let stdout = "";
    let stderr = "";
    let timeoutTriggered = false;

    const finish = (error?: Error | null) => {
      if (resolved) {
        return;
      }
      resolved = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const timeoutId = setTimeout(() => {
      timeoutTriggered = true;
      child.kill();
    }, config.timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-EXTERNAL_SCAN_OUTPUT_LIMIT);
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-EXTERNAL_SCAN_OUTPUT_LIMIT);
    });

    child.once("error", (error) => {
      if (resolved) {
        return;
      }
      const operational = createOperationalScanError(
        config,
        filePath,
        "external-scan-spawn-failed",
        error.message,
      );
      finish(operational);
    });

    child.once("close", (code, signal) => {
      if (resolved) {
        return;
      }
      if (timeoutTriggered) {
        const operational = createOperationalScanError(
          config,
          filePath,
          "external-scan-timeout",
          `timed out after ${config.timeoutMs}ms`,
        );
        finish(operational);
        return;
      }

      if (code !== null && config.cleanExitCodes.has(code)) {
        logger.debug("Collection receipt external malware scan passed", {
          fileName,
          command: config.command,
          exitCode: code,
        });
        finish();
        return;
      }

      const outputSummary = summarizeOutput(stderr || stdout);
      if (code !== null && config.rejectExitCodes.has(code)) {
        finish(new CollectionReceiptSecurityError(
          `Receipt external malware scan rejected ${fileName}${outputSummary ? ` (${outputSummary})` : ""}.`,
          "external-scan-rejected",
        ));
        return;
      }

      const operational = createOperationalScanError(
        config,
        filePath,
        "external-scan-unexpected-exit",
        `exit=${code ?? "null"} signal=${signal ?? "none"}${outputSummary ? ` ${outputSummary}` : ""}`,
      );
      finish(operational);
    });
  });
}
