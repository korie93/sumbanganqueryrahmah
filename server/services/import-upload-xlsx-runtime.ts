import * as xlsx from "xlsx";

type XlsxModule = typeof import("xlsx");

export type ImportUploadSpreadsheetRuntime = {
  implementation: "xlsx";
  migrationStrategy: string;
  decodeRange: XlsxModule["utils"]["decode_range"];
  encodeCell: XlsxModule["utils"]["encode_cell"];
  readWorkbook: XlsxModule["read"];
  sheetToJson: XlsxModule["utils"]["sheet_to_json"];
};

const importUploadSpreadsheetRuntime: ImportUploadSpreadsheetRuntime = {
  implementation: "xlsx",
  migrationStrategy:
    "Keep workbook reads and worksheet-to-JSON conversion behind this adapter so the import parser can switch to an ExcelJS-compatible implementation without rewriting upload validation.",
  decodeRange: xlsx.utils.decode_range,
  encodeCell: xlsx.utils.encode_cell,
  readWorkbook: xlsx.read,
  sheetToJson: xlsx.utils.sheet_to_json,
};

export function getImportUploadSpreadsheetRuntime(): ImportUploadSpreadsheetRuntime {
  return importUploadSpreadsheetRuntime;
}
