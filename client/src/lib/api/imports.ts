import { apiRequest } from "../queryClient";
import { parseApiJson } from "./contract";
import {
  deleteImportResponseSchema,
  importDataPageResponseSchema,
  importRecordSchema,
  importsListResponseSchema,
} from "@shared/api-contracts";

type ImportRequestOptions = {
  cursor?: string;
  limit?: number;
  search?: string;
  createdOn?: string;
  signal?: AbortSignal;
};

export type ImportDataColumnFilter = {
  column: string;
  operator: "contains" | "equals" | "startsWith" | "endsWith" | "notEquals";
  value: string;
};

type ImportDataRequestOptions = ImportRequestOptions & {
  columnFilters?: ImportDataColumnFilter[];
};

export async function getImports(options?: ImportRequestOptions) {
  const params = new URLSearchParams();
  if (options?.cursor) params.set("cursor", options.cursor);
  if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
    params.set("limit", String(options.limit));
  }
  if (options?.search?.trim()) params.set("search", options.search.trim());
  if (options?.createdOn?.trim()) params.set("createdOn", options.createdOn.trim());
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await apiRequest("GET", `/api/imports${suffix}`, undefined, options);
  return parseApiJson(response, importsListResponseSchema, "/api/imports");
}

export async function createImport(
  name: string,
  filename: string,
  data: any[],
  options?: ImportRequestOptions,
) {
  const response = await apiRequest(
    "POST",
    "/api/imports",
    { name, filename, data },
    options,
  );
  return parseApiJson(response, importRecordSchema, "/api/imports");
}

export async function deleteImport(id: string, options?: ImportRequestOptions) {
  const response = await apiRequest("DELETE", `/api/imports/${id}`, undefined, options);
  return parseApiJson(response, deleteImportResponseSchema, `/api/imports/${id}`);
}

export async function renameImport(id: string, name: string, options?: ImportRequestOptions) {
  const response = await apiRequest(
    "PATCH",
    `/api/imports/${id}/rename`,
    { name },
    options,
  );
  return parseApiJson(response, importRecordSchema, `/api/imports/${id}/rename`);
}

export async function getImportData(
  id: string,
  page: number = 1,
  limit: number = 100,
  search?: string,
  options?: ImportDataRequestOptions,
) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));

  if (search && search.trim() !== "") {
    params.set("search", search.trim());
  }
  if (options?.cursor?.trim()) {
    params.set("cursor", options.cursor.trim());
  }
  if (Array.isArray(options?.columnFilters) && options.columnFilters.length > 0) {
    params.set("columnFilters", JSON.stringify(options.columnFilters));
  }

  const response = await apiRequest(
    "GET",
    `/api/imports/${id}/data?${params.toString()}`,
    undefined,
    options,
  );

  return parseApiJson(response, importDataPageResponseSchema, `/api/imports/${id}/data`);
}

export async function analyzeImport(id: string, options?: ImportRequestOptions) {
  const response = await apiRequest(
    "GET",
    `/api/imports/${id}/analyze`,
    undefined,
    options,
  );
  return response.json();
}

export async function analyzeAll(options?: ImportRequestOptions) {
  const response = await apiRequest(
    "GET",
    "/api/analyze/all",
    undefined,
    options,
  );
  return response.json();
}
