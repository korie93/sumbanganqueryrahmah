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
const nullableTextSchema = z.string().nullable();
const collectionHistoryItemSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(["collection", "pool"]),
  isHistorical: z.boolean(),
  paymentDate: z.string(),
  createdAt: z.string(),
  amount: z.string(),
  classificationSource: z.enum(["automatic", "manual_verified_abort"]),
  automaticClassification: z.enum(["cp", "abort_cp"]).nullable(),
  effectiveStatus: z.enum([
    "cp",
    "abort_cp",
    "requires_revalidation",
    "superseded_by_automatic",
    "revoked",
    "unclassified",
    "historical",
  ]),
  settlementDate: nullableTextSchema,
  staffNickname: nullableTextSchema,
  createdByLogin: nullableTextSchema,
  sourceImportName: nullableTextSchema,
  sourceFilename: nullableTextSchema,
  purgedAt: nullableTextSchema,
  purgedBy: nullableTextSchema,
  reason: nullableTextSchema.optional(),
  note: nullableTextSchema.optional(),
  reference: nullableTextSchema.optional(),
});

const collectionHistoryResponseSchema = z.object({
  // The endpoint is page-bounded; reject an oversized response rather than
  // retaining an attacker-controlled history array in browser memory.
  items: z.array(collectionHistoryItemSchema).max(50),
  summary: z.object({
    recordCount: z.number().int().nonnegative(),
    activeRecordCount: z.number().int().nonnegative(),
    historicalRecordCount: z.number().int().nonnegative(),
    poolContributionCount: z.number().int().nonnegative(),
    collectionAmount: z.string(),
    poolAmount: z.string(),
    totalCoveredAmount: z.string(),
    effectiveStatus: z.enum([
      "cp",
      "abort_cp",
      "requires_revalidation",
      "unclassified",
      "historical",
    ]),
  }),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(50),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().positive(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export type SearchCollectionHistoryResponse = z.infer<typeof collectionHistoryResponseSchema>;

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

export async function getSearchCollectionHistory(
  historyKey: string,
  page: number = 1,
  pageSize: number = 10,
  options?: SearchRequestOptions,
) {
  const response = await apiRequest(
    "GET",
    `/api/search/collection-history?key=${encodeURIComponent(historyKey)}&page=${page}&pageSize=${pageSize}`,
    undefined,
    options,
  );
  return parseApiJson(
    response,
    collectionHistoryResponseSchema,
    "/api/search/collection-history",
  );
}
