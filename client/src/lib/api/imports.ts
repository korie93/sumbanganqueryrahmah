import { apiRequest } from "../queryClient";

type ImportRequestOptions = {
  cursor?: string;
  limit?: number;
  search?: string;
  createdOn?: string;
  signal?: AbortSignal;
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
  return response.json();
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
  return response.json();
}

export async function deleteImport(id: string, options?: ImportRequestOptions) {
  const response = await apiRequest("DELETE", `/api/imports/${id}`, undefined, options);
  return response.json();
}

export async function renameImport(id: string, name: string, options?: ImportRequestOptions) {
  const response = await apiRequest(
    "PATCH",
    `/api/imports/${id}/rename`,
    { name },
    options,
  );
  return response.json();
}

export async function getImportData(
  id: string,
  page: number = 1,
  limit: number = 100,
  search?: string,
  options?: ImportRequestOptions,
) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (search && search.trim() !== "") {
    params.set("search", search.trim());
  }

  const response = await apiRequest(
    "GET",
    `/api/imports/${id}/data?${params.toString()}`,
    undefined,
    options,
  );

  return response.json();
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
