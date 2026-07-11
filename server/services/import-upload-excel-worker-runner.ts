import { Worker } from "node:worker_threads";
import { internalMetrics } from "../internal/metrics";
import { logger } from "../lib/logger";
import type { ParsedImportUploadResult } from "./import-upload-types";
import type { ParseExcelOptions } from "./import-upload-excel-utils";

const EXCEL_PARSER_WORKER_TIMEOUT_MS = 120_000;
const EXCEL_PARSER_WORKER_MAX_OLD_GENERATION_MB = 384;
const EXCEL_PARSER_WORKER_MAX_YOUNG_GENERATION_MB = 64;
const EXCEL_PARSER_WORKER_STACK_MB = 8;

type ExcelParserWorkerResponse = {
  archiveRejected: boolean;
  result: ParsedImportUploadResult;
};

function createExcelParserFailureResult(message: string): ParsedImportUploadResult {
  return {
    headers: [],
    rows: [],
    error: message,
  };
}

function isExcelParserWorkerResponse(value: unknown): value is ExcelParserWorkerResponse {
  if (
    !value
    || typeof value !== "object"
    || !("archiveRejected" in value)
    || typeof (value as { archiveRejected?: unknown }).archiveRejected !== "boolean"
    || !("result" in value)
  ) {
    return false;
  }
  const result = (value as { result?: unknown }).result;
  return Boolean(
    result
    && typeof result === "object"
    && "headers" in result
    && Array.isArray((result as { headers?: unknown }).headers)
    && "rows" in result
    && Array.isArray((result as { rows?: unknown }).rows)
    && (
      !("error" in result)
      || (result as { error?: unknown }).error === undefined
      || typeof (result as { error?: unknown }).error === "string"
    ),
  );
}

function resolveExcelParserWorkerUrl(): URL {
  const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
  return new URL(`./import-upload-excel-worker.${extension}`, import.meta.url);
}

export function parseExcelFileInWorker(
  filePath: string,
  options?: ParseExcelOptions,
): Promise<ParsedImportUploadResult> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(resolveExcelParserWorkerUrl(), {
        resourceLimits: {
          maxOldGenerationSizeMb: EXCEL_PARSER_WORKER_MAX_OLD_GENERATION_MB,
          maxYoungGenerationSizeMb: EXCEL_PARSER_WORKER_MAX_YOUNG_GENERATION_MB,
          stackSizeMb: EXCEL_PARSER_WORKER_STACK_MB,
        },
        workerData: {
          filePath,
          options: options ?? {},
        },
      });
    } catch {
      internalMetrics.increment("spreadsheetParserWorkerFailuresTotal");
      logger.error("Spreadsheet parser worker failed to start", {
        event: "spreadsheet_parser_worker_start_failed",
      });
      resolve(createExcelParserFailureResult(
        "Spreadsheet processing is temporarily unavailable. Please try again.",
      ));
      return;
    }
    let settled = false;
    let timeout: NodeJS.Timeout | null = null;

    const finish = async (result: ParsedImportUploadResult) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      worker.removeAllListeners();
      try {
        await worker.terminate();
      } catch {
        // The worker may already have exited after posting its result.
      }
      resolve(result);
    };

    worker.once("message", (message: unknown) => {
      if (isExcelParserWorkerResponse(message) && message.archiveRejected) {
        internalMetrics.increment("spreadsheetArchivePreflightRejectionsTotal");
        logger.warn("Spreadsheet archive failed bounded preflight", {
          event: "spreadsheet_archive_preflight_rejected",
        });
      }
      void finish(
        isExcelParserWorkerResponse(message)
          ? message.result
          : createExcelParserFailureResult(
              "Spreadsheet processing returned an invalid result and was stopped safely.",
            ),
      );
    });
    worker.once("error", () => {
      internalMetrics.increment("spreadsheetParserWorkerFailuresTotal");
      logger.warn("Spreadsheet parser worker failed", {
        event: "spreadsheet_parser_worker_failed",
      });
      void finish(createExcelParserFailureResult(
        "Spreadsheet processing stopped because the file exceeded safe resource limits or could not be parsed.",
      ));
    });
    worker.once("exit", (code) => {
      if (!settled) {
        internalMetrics.increment("spreadsheetParserWorkerFailuresTotal");
        logger.warn("Spreadsheet parser worker exited without a result", {
          event: "spreadsheet_parser_worker_exit_failed",
          exitCode: code,
        });
        void finish(createExcelParserFailureResult(
          code === 0
            ? "Spreadsheet processing ended without a valid result. Please verify the workbook and try again."
            : "Spreadsheet processing stopped because the file exceeded safe resource limits or could not be parsed.",
        ));
      }
    });

    timeout = setTimeout(() => {
      internalMetrics.increment("spreadsheetParserWorkerTimeoutsTotal");
      logger.warn("Spreadsheet parser worker exceeded its time limit", {
        event: "spreadsheet_parser_worker_timeout",
      });
      void finish(createExcelParserFailureResult(
        "Spreadsheet processing exceeded the safe time limit. Split the workbook into smaller files and try again.",
      ));
    }, EXCEL_PARSER_WORKER_TIMEOUT_MS);
    timeout.unref();
  });
}
