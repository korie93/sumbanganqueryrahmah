import path from "node:path";
import { spawn } from "node:child_process";
import { internalMetrics } from "../internal/metrics";
import { logger } from "./logger";
import { CollectionReceiptSecurityError } from "./collection-receipt-security";
import {
  EXTERNAL_SCAN_OUTPUT_LIMIT,
  type ExternalScanConfig,
  summarizeOutput,
} from "./collection-receipt-external-scan-shared";

type ExternalScanProcessStream = {
  setEncoding(encoding: BufferEncoding): ExternalScanProcessStream;
  on(event: "data", listener: (chunk: string) => void): ExternalScanProcessStream;
  removeAllListeners(): ExternalScanProcessStream;
};

type ExternalScanChildProcess = {
  readonly stdout?: ExternalScanProcessStream | null;
  readonly stderr?: ExternalScanProcessStream | null;
  readonly killed: boolean;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: "error", listener: (error: Error) => void): ExternalScanChildProcess;
  once(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): ExternalScanChildProcess;
  removeAllListeners(): ExternalScanChildProcess;
};

export type ExternalScanSpawn = (
  command: string,
  args: string[],
  options: {
    stdio: ["ignore", "pipe", "pipe"];
    timeout: number;
    killSignal: NodeJS.Signals;
    windowsHide: true;
  },
) => ExternalScanChildProcess;

export const EXTERNAL_SCAN_FORCE_KILL_GRACE_MS = 2_000;

export function createOperationalScanError(
  config: ExternalScanConfig,
  filePath: string,
  reasonCode: string,
  detail?: string | null,
) {
  const suffix = detail ? ` (${detail})` : "";
  const fileName = path.basename(filePath);
  const message = `Receipt external malware scan failed for ${fileName}${suffix}.`;
  const failMode = config.failClosed ? "fail-closed" : "fail-open";

  internalMetrics.increment("collectionReceiptExternalScanFailuresTotal");
  logger.warn("Collection receipt external malware scan operational failure", {
    fileName,
    reasonCode,
    detail: detail || null,
    failMode,
  });

  if (config.failClosed) {
    return new CollectionReceiptSecurityError(message, reasonCode);
  }

  internalMetrics.increment("collectionReceiptExternalScanFailOpenBypassTotal");
  logger.warn("Collection receipt external malware scan skipped after operational failure", {
    fileName,
    reasonCode,
    detail: detail || null,
  });
  return null;
}

export async function runExternalReceiptScan({
  config,
  filePath,
  scannerCommand,
  args,
  spawnScanner = (command, scannerArgs, options) => spawn(command, scannerArgs, options),
  forceKillGraceMs = EXTERNAL_SCAN_FORCE_KILL_GRACE_MS,
}: {
  config: ExternalScanConfig;
  filePath: string;
  scannerCommand: string;
  args: string[];
  spawnScanner?: ExternalScanSpawn;
  forceKillGraceMs?: number;
}) {
  const fileName = path.basename(filePath);

  await new Promise<void>((resolve, reject) => {
    const child = spawnScanner(scannerCommand, args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: config.timeoutMs,
      killSignal: "SIGTERM",
      windowsHide: true,
    });

    let settled = false;
    let stdout = "";
    let stderr = "";
    let timeoutTriggered = false;
    let timeoutId: NodeJS.Timeout | null = null;
    let forceKillTimeoutId: NodeJS.Timeout | null = null;

    const clearForceKillTimer = () => {
      if (forceKillTimeoutId) {
        clearTimeout(forceKillTimeoutId);
        forceKillTimeoutId = null;
      }
    };

    const scheduleForceKill = () => {
      if (forceKillTimeoutId || forceKillGraceMs < 0) {
        return;
      }

      forceKillTimeoutId = setTimeout(() => {
        forceKillTimeoutId = null;
        try {
          logger.error("AUDIT2-FIX [M4]: Scanner process timed out; force killing", {
            fileName,
            reasonCode: "external-scan-timeout-force-kill",
            timeoutMs: config.timeoutMs,
            graceMs: forceKillGraceMs,
          });
          child.kill("SIGKILL");
        } catch {
          logger.debug("Scanner process force kill failed after timeout", {
            fileName,
            reasonCode: "external-scan-timeout-force-kill-failed",
          });
        }
      }, forceKillGraceMs);
      forceKillTimeoutId.unref?.();
    };

    const cleanup = (options: { terminate?: boolean } = {}) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (options.terminate) {
        if (!child.killed) {
          try {
            // AUDIT2-FIX [M4]: timeout first asks the scanner to terminate gracefully.
            child.kill("SIGTERM");
          } catch {
            // The scanner may already have exited between the timeout and cleanup.
          }
        }
        scheduleForceKill();
      } else {
        clearForceKillTimer();
      }

      child.stdout?.removeAllListeners();
      child.stderr?.removeAllListeners();
      child.removeAllListeners();

      if (options.terminate) {
        child.once("close", () => {
          clearForceKillTimer();
        });
      }
    };

    const finish = (error?: Error | null, options: { terminate?: boolean } = {}) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup(options);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    timeoutId = setTimeout(() => {
      timeoutTriggered = true;
      const operational = createOperationalScanError(
        config,
        filePath,
        "external-scan-timeout",
        `timed out after ${config.timeoutMs}ms`,
      );
      finish(operational, { terminate: true });
    }, config.timeoutMs);
    timeoutId.unref?.();

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-EXTERNAL_SCAN_OUTPUT_LIMIT);
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-EXTERNAL_SCAN_OUTPUT_LIMIT);
    });

    child.once("error", (error) => {
      const operational = createOperationalScanError(
        config,
        filePath,
        "external-scan-spawn-failed",
        error.message,
      );
      finish(operational);
    });

    child.once("close", (code, signal) => {
      if (timeoutTriggered) {
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
