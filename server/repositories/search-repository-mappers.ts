import type {
  AdvancedSearchDataRow,
  SearchDataRow,
  SearchGlobalDataRow,
  SearchQueryRow,
} from "./search-repository-types";
import { normalizeSearchJsonPayload } from "./search-repository-shared";

export function mapSearchGlobalDataRow(row: SearchQueryRow): SearchGlobalDataRow {
  return {
    id: String(row.id || ""),
    importId: String(row.import_id || ""),
    importName: typeof row.import_name === "string" ? row.import_name : null,
    importFilename: typeof row.import_filename === "string" ? row.import_filename : null,
    jsonDataJsonb: normalizeSearchJsonPayload(row.json_data_jsonb),
  };
}

export function mapSearchDataRow(row: SearchQueryRow): SearchDataRow {
  return {
    id: String(row.id || ""),
    importId: String(row.importId || ""),
    jsonDataJsonb: normalizeSearchJsonPayload(row.jsonDataJsonb),
  };
}

export function mapAdvancedSearchDataRow(row: SearchQueryRow): AdvancedSearchDataRow {
  return {
    id: String(row.id || ""),
    importId: String(row.importId || ""),
    jsonDataJsonb: normalizeSearchJsonPayload(row.jsonDataJsonb),
    importName: typeof row.importName === "string" ? row.importName : null,
    importFilename: typeof row.importFilename === "string" ? row.importFilename : null,
  } as AdvancedSearchDataRow;
}
