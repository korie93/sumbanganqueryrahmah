import { apiRequest, createApiHeaders } from "../queryClient";
import { getAuthHeader } from "./shared";

type SearchRequestOptions = {
  signal?: AbortSignal;
};

export async function searchData(
  query: string,
  page: number = 1,
  limit: number = 50,
  options?: SearchRequestOptions,
) {
  const res = await fetch(
    `/api/search/global?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`,
    {
      credentials: "include",
      headers: createApiHeaders({
        ...getAuthHeader(),
      }),
      signal: options?.signal,
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
  limit: number = 50,
  options?: SearchRequestOptions,
) {
  const response = await apiRequest(
    "POST",
    "/api/search/advanced",
    { filters, logic, page, limit },
    options,
  );
  return response.json();
}

export async function getSearchColumns(options?: SearchRequestOptions) {
  const response = await apiRequest("GET", "/api/search/columns", undefined, options);
  return response.json();
}
