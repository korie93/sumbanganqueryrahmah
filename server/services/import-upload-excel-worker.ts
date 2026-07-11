import { promises as fs } from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import {
  createUploadFileAccessError,
  isFileAccessError,
} from "./import-upload-file-utils";
import {
  isSpreadsheetArchivePreflightError,
} from "./import-upload-archive-preflight";
import {
  parseExcelBuffer,
  type ParseExcelOptions,
} from "./import-upload-excel-utils";
import type { ParsedImportUploadResult } from "./import-upload-types";

type ExcelParserWorkerData = {
  filePath: string;
  options: ParseExcelOptions;
};

function createWorkerParseFailure(): ParsedImportUploadResult {
  return {
    headers: [],
    rows: [],
    error: "The spreadsheet could not be parsed safely. Verify the workbook and try again.",
  };
}

async function run(): Promise<void> {
  if (!parentPort) {
    return;
  }

  let result: ParsedImportUploadResult;
  try {
    const data = workerData as ExcelParserWorkerData;
    const buffer = await fs.readFile(data.filePath);
    result = parseExcelBuffer(buffer, data.options);
  } catch (error) {
    result = isFileAccessError(error)
      ? createUploadFileAccessError()
      : createWorkerParseFailure();
  }

  parentPort.postMessage({
    archiveRejected: isSpreadsheetArchivePreflightError(result.error),
    result,
  });
  parentPort.close();
}

void run();
