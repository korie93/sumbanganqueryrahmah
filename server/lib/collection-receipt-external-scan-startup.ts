import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { readExternalScanConfig } from "./collection-receipt-external-scan-config";
import { validateExternalScanCommand } from "./collection-receipt-external-scan-paths";
import { buildScanArgs, summarizeOutput } from "./collection-receipt-external-scan-shared";
import { runExternalReceiptScan } from "./collection-receipt-external-scan-runner";
import { logger as defaultLogger } from "./logger";
import { createProcessTimeoutChain, type ProcessTimeoutChain } from "./process-timeout-manager";

type StartupLogger = Pick<typeof defaultLogger, "info" | "warn">;

export type ReceiptExternalScanStartupVerification = {
  ready: boolean;
  message: string;
  scannerCommand?: string;
  version?: string | null;
};

const STARTUP_VERSION_TIMEOUT_MS = 5_000;
const STARTUP_VERSION_FORCE_KILL_GRACE_MS = 2_000;

function buildStartupScanError(message: string, reason = "COLLECTION_RECEIPT_EXTERNAL_SCAN_UNAVAILABLE") {
  const error = new Error(message);
  Object.assign(error, { startupReason: reason });
  return error;
}

async function readScannerVersion(scannerCommand: string): Promise<string | null> {
  return await new Promise((resolve, reject) => {
    const child = spawn(scannerCommand, ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let resolved = false;
    let timedOut = false;
    let timeoutChain: ProcessTimeoutChain | null = null;

    const finish = (error?: Error | null, value?: string | null) => {
      if (resolved) {
        return;
      }
      resolved = true;
      timeoutChain?.cancel();
      if (error) {
        reject(error);
      } else {
        resolve(value ?? null);
      }
    };

    timeoutChain = createProcessTimeoutChain({
      hardTimeoutMs: STARTUP_VERSION_FORCE_KILL_GRACE_MS,
      onSoftTimeout: () => {
        timedOut = true;
      },
      process: child,
      softTimeoutMs: STARTUP_VERSION_TIMEOUT_MS,
    });

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout = `${stdout}${chunk}`;
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`;
    });

    child.once("error", finish);
    child.once("close", (code) => {
      if (timedOut) {
        finish(new Error(`scanner version check timed out after ${STARTUP_VERSION_TIMEOUT_MS}ms`));
        return;
      }
      if (code !== 0) {
        const output = summarizeOutput(stderr || stdout);
        finish(new Error(`scanner version check exited with ${code}${output ? ` (${output})` : ""}`));
        return;
      }
      finish(null, summarizeOutput(stdout || stderr));
    });
  });
}

export async function verifyCollectionReceiptExternalScanStartup(params: {
  isProductionLike: boolean;
  logger?: StartupLogger;
}): Promise<ReceiptExternalScanStartupVerification> {
  const logger = params.logger ?? defaultLogger;
  let config;
  try {
    config = readExternalScanConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (params.isProductionLike) {
      throw buildStartupScanError(`Receipt external malware scanner configuration is invalid: ${message}`);
    }
    logger.warn("Receipt external malware scanner configuration is invalid", { error });
    return { ready: false, message };
  }

  if (!config.enabled) {
    const message = "Receipt external malware scanning is disabled.";
    if (params.isProductionLike) {
      throw buildStartupScanError(message);
    }
    logger.warn("Receipt external malware scanning is disabled; uploads will skip external scanner checks");
    return { ready: false, message };
  }

  if (!config.command) {
    const message = "COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND is required when receipt external scanning is enabled.";
    if (params.isProductionLike) {
      throw buildStartupScanError(message);
    }
    logger.warn("Receipt external malware scanner command is missing");
    return { ready: false, message };
  }

  let scannerCommand: string;
  try {
    scannerCommand = await validateExternalScanCommand(config.command, {
      allowDevelopmentScannerShim: !params.isProductionLike,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (params.isProductionLike) {
      throw buildStartupScanError(`Receipt external malware scanner command is unavailable: ${message}`);
    }
    logger.warn("Receipt external malware scanner command is unavailable", { error });
    return { ready: false, message };
  }

  let version: string | null = null;
  try {
    version = await readScannerVersion(scannerCommand);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (params.isProductionLike) {
      throw buildStartupScanError(`Receipt external malware scanner version check failed: ${message}`);
    }
    logger.warn("Receipt external malware scanner version check failed", { error, scannerCommand });
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sqr-receipt-scan-startup-"));
  const tempFile = path.join(tempDir, "clean-startup-check.txt");
  try {
    await writeFile(tempFile, "sqr receipt scanner startup check\n", "utf8");
    await runExternalReceiptScan({
      config,
      filePath: tempFile,
      scannerCommand,
      args: buildScanArgs(config, tempFile),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (params.isProductionLike) {
      throw buildStartupScanError(`Receipt external malware scanner startup check failed: ${message}`);
    }
    logger.warn("Receipt external malware scanner startup check failed", { error, scannerCommand });
    return { ready: false, message, scannerCommand, version };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  logger.info("Receipt external malware scanner startup check passed", {
    scannerCommand,
    version,
  });
  return {
    ready: true,
    message: "Receipt external malware scanner startup check passed.",
    scannerCommand,
    version,
  };
}
