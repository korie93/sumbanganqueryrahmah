import { z } from "zod";
import { apiRequest } from "../api-client";
import {
  advancedSearchResponseSchema,
  searchGlobalResponseSchema,
} from "@shared/api-contracts";
import { parseApiJson } from "./contract";

type SearchRequestOptions = {
  signal?: AbortSignal | undefined;
};

const searchColumnsResponseSchema = z.array(z.string().trim().min(1));

export async function searchData(
  query: string,
  page: number = 1,
  pageSize: number = 50,
  options?: SearchRequestOptions,
) {
  const response = await apiRequest(
    "GET",
    `/api/search/global?q=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}`,
    undefined,
    options,
  );
  return parseApiJson(response, searchGlobalResponseSchema, "/api/search/global");
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
  return parseApiJson(response, advancedSearchResponseSchema, "/api/search/advanced");
}

export async function getSearchColumns(options?: SearchRequestOptions) {
  const response = await apiRequest("GET", "/api/search/columns", undefined, options);
  return parseApiJson(response, searchColumnsResponseSchema, "/api/search/columns");
}
