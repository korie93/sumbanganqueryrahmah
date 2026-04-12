import path from "node:path";
import { spawn } from "node:child_process";
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

export async function runExternalReceiptScan({
  config,
  filePath,
  scannerCommand,
  args,
}: {
  config: ExternalScanConfig;
  filePath: string;
  scannerCommand: string;
  args: string[];
}) {
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
