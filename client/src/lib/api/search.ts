import { apiRequest, createApiHeaders } from "../api-client";
import { getAuthHeader } from "./shared";

type SearchRequestOptions = {
  signal?: AbortSignal | undefined;
};

export async function searchData(
  query: string,
  page: number = 1,
  pageSize: number = 50,
  options?: SearchRequestOptions,
) {
  const res = await fetch(
    `/api/search/global?q=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}`,
    {
      credentials: "include",
      headers: createApiHeaders({
        ...getAuthHeader(),
      }),
      signal: options?.signal ?? null,
    },
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Search failed");
  }

  return res.json();
}

export interface SearchFilter {
  field: string;
  operator: string;
  value: string;
}

export async function advancedSearchData(
  filters: SearchFilter[],
  logic: "AND" | "OR",
  page: number = 1,
  pageSize: number = 50,
  options?: SearchRequestOptions,
) {
  const response = await apiRequest(
    "POST",
    "/api/search/advanced",
    { filters, logic, page, pageSize },
    options,
  );
  return response.json();
}

export async function getSearchColumns(options?: SearchRequestOptions) {
  const response = await apiRequest("GET", "/api/search/columns", undefined, options);
  return response.json();
}
