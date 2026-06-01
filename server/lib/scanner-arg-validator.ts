import path from "node:path";
import { internalMetrics } from "../internal/metrics";
import { logger } from "./logger";

export class ScanArgError extends Error {
  readonly name = "ScanArgError";
}

const MAX_SCANNER_DYNAMIC_ARG_LENGTH = 4_096;
const SAFE_SCANNER_FILENAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const SCANNER_ARG_CONTROL_CHAR_PATTERN = /[\0\r\n]/;

function rejectScannerArg(reason: string): never {
  internalMetrics.increment("collectionReceiptExternalScanArgValidationFailuresTotal");
  logger.error("Collection receipt external scanner argument rejected", {
    event: "scanner_arg_rejected",
    operation: "collection-receipt-external-scan",
    reason,
  });
  throw new ScanArgError("Scanner target argument is not safe.");
}

export function validateScannerDynamicArgValue(value: string): string {
  const rawValue = String(value || "");
  if (!rawValue || rawValue.length > MAX_SCANNER_DYNAMIC_ARG_LENGTH) {
    rejectScannerArg("invalid_length");
  }

  if (SCANNER_ARG_CONTROL_CHAR_PATTERN.test(rawValue)) {
    rejectScannerArg("control_character");
  }

  const fileName = path.basename(rawValue);
  if (!fileName || fileName.startsWith("-")) {
    rejectScannerArg("filename_starts_with_dash");
  }

  if (!SAFE_SCANNER_FILENAME_PATTERN.test(fileName)) {
    rejectScannerArg("filename_unsafe_characters");
  }

  return rawValue;
}
