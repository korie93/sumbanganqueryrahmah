import type { DataRowWithId } from "@/pages/viewer/types";

export function buildViewerWorksheetData(
  headers: string[],
  rows: DataRowWithId[],
  potentialIcColumns: string[],
) {
  return rows.map((row) => {
    const rowData: Record<string, string | number> = {};

    headers.forEach((header) => {
      const value = row[header];
      const stringValue = String(value || "");
      const isIcColumn = potentialIcColumns.includes(header);
      const looksLikeIc = /^\d{6,14}$/.test(stringValue.replace(/[-\s]/g, ""));

      if (isIcColumn || (looksLikeIc && stringValue.length >= 6)) {
        rowData[header] = stringValue;
      } else {
        rowData[header] = typeof value === "number" ? value : value == null ? "" : String(value);
      }
    });

    return rowData;
  });
}

export function buildViewerWorksheetColumns(headers: string[], rows: DataRowWithId[]) {
  return headers.map((header) => {
    const maxLength = Math.max(
      header.length,
      ...rows.slice(0, 100).map((row) => String(row[header] || "").length),
    );

    return { wch: Math.min(maxLength + 2, 50) };
  });
}
