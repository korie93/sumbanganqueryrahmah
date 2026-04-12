import { readBooleanEnvFlag } from "../config/runtime-environment";
import {
  DEFAULT_COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES,
  DEFAULT_COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS,
  EXTERNAL_SCAN_FILE_PLACEHOLDER,
  type ExternalScanConfig,
  parseExitCodeSet,
  parseScannerArgsJson,
  readInt,
  readOptionalString,
  validateScannerArgs,
} from "./collection-receipt-external-scan-shared";

export function readExternalScanConfig(): ExternalScanConfig {
  return {
    enabled: readBooleanEnvFlag("COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED", false),
    command: readOptionalString("COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND"),
    args: validateScannerArgs(parseScannerArgsJson()),
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

export function createFallbackExternalScanConfig(): ExternalScanConfig {
  return {
    enabled: true,
    command: null,
    args: [EXTERNAL_SCAN_FILE_PLACEHOLDER],
    timeoutMs: DEFAULT_COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS,
    failClosed: readBooleanEnvFlag("COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED", true),
    cleanExitCodes: new Set([0]),
    rejectExitCodes: new Set([1]),
  };
}
