import type { CategoryStatSample } from "./ai-category-types";
import { parseJsonData } from "./ai-category-json-utils";

export function extractName(data: Record<string, unknown>): string {
  return String(
    data["Nama"] ||
      data["Customer Name"] ||
      data["name"] ||
      data["MAKLUMAT PEMOHON"] ||
      "-",
  );
}

export function extractIc(data: Record<string, unknown>): string {
  return String(
    data["No. MyKad"] ||
      data["ID No"] ||
      data["No Pengenalan"] ||
      data["IC"] ||
      "-",
  );
}

export function mapCategorySampleRow(row: {
  jsonData?: unknown;
  importName?: string | null;
  importFilename?: string | null;
}): CategoryStatSample {
  const data = parseJsonData(row.jsonData);
  const source = row.importName || row.importFilename || null;
  return {
    name: extractName(data),
    ic: extractIc(data),
    source,
  };
}
