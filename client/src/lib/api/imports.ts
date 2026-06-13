import { apiRequest } from "../api-client";
import { createClientRandomId } from "../secure-id";
import { parseApiJson } from "./contract";
import {
  allImportsAnalysisResponseSchema,
  deleteImportResponseSchema,
  importDataPageResponseSchema,
  importBackgroundJobSchema,
  importMutationResultSchema,
  importRecordSchema,
  importsListResponseSchema,
  singleImportAnalysisResponseSchema,
} from "@shared/api-contracts";

const IMPORT_UPLOAD_TIMEOUT_MS = 5 * 60_000 + 30_000;

type ImportRequestOptions = {
  cursor?: string | undefined;
  limit?: number | undefined;
  pageSize?: number | undefined;
  search?: string | undefined;
  createdOn?: string | undefined;
  signal?: AbortSignal | undefined;
};

type ImportMutationRequestOptions = ImportRequestOptions & {
  headers?: Record<string, string>;
  idempotencyFingerprint?: string;
  idempotencyKey?: string;
  columnMapping?: ImportColumnMappingEntry[];
};

export type ImportColumnMappingEntry = {
  source: string;
  target: string | null;
};

export type ImportDataColumnFilter = {
  column: string;
  operator: "contains" | "equals" | "startsWith" | "endsWith" | "notEquals";
  value: string;
};

type ImportDataRequestOptions = ImportRequestOptions & {
  columnFilters?: ImportDataColumnFilter[] | undefined;
};

function hashImportFingerprintInput(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
}

function buildImportMutationHeaders(options?: ImportMutationRequestOptions) {
  const headers = { ...(options?.headers ?? {}) };
  const idempotencyKey = String(options?.idempotencyKey || "").trim();
  const idempotencyFingerprint = String(options?.idempotencyFingerprint || "").trim();

  if (idempotencyKey) {
    headers["x-idempotency-key"] = idempotencyKey;
  }
  if (idempotencyFingerprint) {
    headers["x-idempotency-fingerprint"] = idempotencyFingerprint;
  }

  return headers;
}

export function createImportMutationIdempotencyKey() {
  return createClientRandomId("import");
}

export function buildImportMutationFingerprint(
  name: string,
  file: Pick<File, "lastModified" | "name" | "size" | "type">,
) {
  const canonicalFingerprint = JSON.stringify({
    file: {
      lastModified: Number(file.lastModified || 0),
      name: String(file.name || ""),
      size: Number(file.size || 0),
      type: String(file.type || ""),
    },
    name: String(name || "").trim(),
    operation: "create",
  });

  return JSON.stringify({
    algorithm: "fnv1a64",
    hash: hashImportFingerprintInput(canonicalFingerprint),
    version: 1,
  });
}

export async function getImports(options?: ImportRequestOptions) {
  const params = new URLSearchParams();
  if (options?.cursor) params.set("cursor", options.cursor);
  const pageSize = options?.pageSize ?? options?.limit;
  if (typeof pageSize === "number" && Number.isFinite(pageSize)) {
    params.set("pageSize", String(pageSize));
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
  data: Array<Record<string, unknown>>,
  options?: ImportMutationRequestOptions,
) {
  const response = await apiRequest(
    "POST",
    "/api/imports",
    {
      name,
      filename,
      data,
      columnMapping: options?.columnMapping ?? [],
    },
    {
      ...options,
      headers: buildImportMutationHeaders(options),
    },
  );
  return parseApiJson(response, importMutationResultSchema, "/api/imports");
}

export async function createImportFromFile(
  name: string,
  file: File,
  options?: ImportMutationRequestOptions,
) {
  const formData = new FormData();
  formData.set("name", name);
  if (options?.columnMapping?.length) {
    formData.set("columnMapping", JSON.stringify(options.columnMapping));
  }
  formData.append("file", file, file.name);

  const response = await apiRequest(
    "POST",
    "/api/imports",
    formData,
    {
      ...options,
      headers: buildImportMutationHeaders(options),
      retry: false,
      timeoutMs: IMPORT_UPLOAD_TIMEOUT_MS,
    },
  );
  return parseApiJson(response, importMutationResultSchema, "/api/imports");
}

export async function getImportJob(jobId: string, options?: ImportRequestOptions) {
  const response = await apiRequest(
    "GET",
    `/api/import-jobs/${encodeURIComponent(jobId)}`,
    undefined,
    options,
  );
  return parseApiJson(response, importBackgroundJobSchema, `/api/import-jobs/${jobId}`);
}

export async function cancelImportJob(jobId: string, options?: ImportRequestOptions) {
  const response = await apiRequest(
    "POST",
    `/api/import-jobs/${encodeURIComponent(jobId)}/cancel`,
    undefined,
    options,
  );
  return parseApiJson(response, importBackgroundJobSchema, `/api/import-jobs/${jobId}/cancel`);
}

export async function resumeImportJob(jobId: string, options?: ImportRequestOptions) {
  const response = await apiRequest(
    "POST",
    `/api/import-jobs/${encodeURIComponent(jobId)}/resume`,
    undefined,
    options,
  );
  return parseApiJson(response, importBackgroundJobSchema, `/api/import-jobs/${jobId}/resume`);
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
  pageSize: number = 100,
  search?: string,
  options?: ImportDataRequestOptions,
) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

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
  return parseApiJson(
    response,
    singleImportAnalysisResponseSchema,
    `/api/imports/${id}/analyze`,
  );
}

export async function analyzeAll(options?: ImportRequestOptions) {
  const response = await apiRequest(
    "GET",
    "/api/analyze/all",
    undefined,
    options,
  );
  return parseApiJson(response, allImportsAnalysisResponseSchema, "/api/analyze/all");
}
