import { apiRequest } from "../queryClient";

export async function getImports() {
  const response = await apiRequest("GET", "/api/imports");
  return response.json();
}

export async function createImport(name: string, filename: string, data: any[]) {
  const response = await apiRequest("POST", "/api/imports", { name, filename, data });
  return response.json();
}

export async function deleteImport(id: string) {
  const response = await apiRequest("DELETE", `/api/imports/${id}`);
  return response.json();
}

export async function renameImport(id: string, name: string) {
  const response = await apiRequest("PATCH", `/api/imports/${id}/rename`, { name });
  return response.json();
}

export async function getImportData(
  id: string,
  page: number = 1,
  limit: number = 100,
  search?: string,
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
  );

  return response.json();
}

export async function analyzeImport(id: string) {
  const response = await apiRequest("GET", `/api/imports/${id}/analyze`);
  return response.json();
}

export async function analyzeAll() {
  const response = await apiRequest("GET", "/api/analyze/all");
  return response.json();
}
