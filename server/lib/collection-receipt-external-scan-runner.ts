import path from "node:path";
import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { logger } from "./logger";
import { CollectionReceiptSecurityError } from "./collection-receipt-security";
import {
  EXTERNAL_SCAN_OUTPUT_LIMIT,
  type ExternalScanConfig,
  summarizeOutput,
} from "./collection-receipt-external-scan-shared";

export function createOperationalScanError(
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

type ExternalScanChildReadable = Pick<Readable, "setEncoding" | "on" | "removeListener" | "destroy"> & {
  destroyed?: boolean;
};

type ExternalScanChildProcess = {
  once(event: "error", listener: (error: Error) => void): unknown;
  once(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  removeListener(event: "error", listener: (error: Error) => void): unknown;
  removeListener(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  kill(): unknown;
  stdout?: ExternalScanChildReadable | null;
  stderr?: ExternalScanChildReadable | null;
};

type SpawnExternalScanProcess = (
  command: string,
  args: readonly string[],
  options: {
    stdio: ["ignore", "pipe", "pipe"];
    windowsHide: boolean;
  },
) => ExternalScanChildProcess;

const MIN_EXTERNAL_SCAN_TIMEOUT_MS = 1_000;
const MAX_EXTERNAL_SCAN_TIMEOUT_MS = 300_000;

function resolveValidatedExternalScanTimeoutMs(timeoutMs: number) {
  if (!Number.isFinite(timeoutMs)) {
    throw new Error("Receipt external malware scan timeout must be a finite number.");
  }

  const normalized = Math.trunc(timeoutMs);
  if (normalized < MIN_EXTERNAL_SCAN_TIMEOUT_MS) {
    throw new Error(
      `Receipt external malware scan timeout must be at least ${MIN_EXTERNAL_SCAN_TIMEOUT_MS}ms.`,
    );
  }

  return Math.min(normalized, MAX_EXTERNAL_SCAN_TIMEOUT_MS);
}

export async function runExternalReceiptScan({
  config,
  filePath,
  scannerCommand,
  args,
  spawnProcess = spawn as SpawnExternalScanProcess,
}: {
  config: ExternalScanConfig;
  filePath: string;
  scannerCommand: string;
  args: string[];
  spawnProcess?: SpawnExternalScanProcess;
}) {
  const fileName = path.basename(filePath);
  const timeoutMs = resolveValidatedExternalScanTimeoutMs(config.timeoutMs);

  await new Promise<void>((resolve, reject) => {
    const child = spawnProcess(scannerCommand, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let resolved = false;
    let stdout = "";
    let stderr = "";
    let timeoutTriggered = false;
    const handleStdoutData = (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-EXTERNAL_SCAN_OUTPUT_LIMIT);
    };
    const handleStderrData = (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-EXTERNAL_SCAN_OUTPUT_LIMIT);
    };

    const cleanupChildProcessResources = () => {
      child.removeListener("error", handleChildError);
      child.removeListener("close", handleChildClose);
      child.stdout?.removeListener("data", handleStdoutData);
      child.stderr?.removeListener("data", handleStderrData);

      for (const [streamName, stream] of [
        ["stdout", child.stdout],
        ["stderr", child.stderr],
      ] as const) {
        if (!stream) {
          continue;
        }

        try {
          if (!stream.destroyed) {
            stream.destroy();
          }
        } catch (error) {
          logger.warn("Failed to clean up collection receipt external scan stream", {
            fileName,
            stream: streamName,
            error: error instanceof Error ? { name: error.name } : undefined,
          });
        }
      }
    };

    const finish = (error?: Error | null) => {
      if (resolved) {
        return;
      }
      resolved = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      cleanupChildProcessResources();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const timeoutId = setTimeout(() => {
      timeoutTriggered = true;
      child.kill();
    }, timeoutMs);
    timeoutId.unref?.();

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", handleStdoutData);

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", handleStderrData);

    const handleChildError = (error: Error) => {
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
    };

    const handleChildClose = (code: number | null, signal: NodeJS.Signals | null) => {
      if (resolved) {
        return;
      }
      if (timeoutTriggered) {
        const operational = createOperationalScanError(
          config,
          filePath,
          "external-scan-timeout",
          `timed out after ${timeoutMs}ms`,
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
    };

    child.once("error", handleChildError);
    child.once("close", handleChildClose);
  });
}
