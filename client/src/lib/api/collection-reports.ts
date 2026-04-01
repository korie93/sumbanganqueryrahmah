import { apiRequest } from "../queryClient";
import type {
  CollectionMonthlySummary,
  CollectionNicknameSummaryResponse,
  CollectionReportFreshness,
} from "./collection-types";

export async function getCollectionMonthlySummary(filters: { year: number; nickname?: string; nicknames?: string[] }) {
  const params = new URLSearchParams();
  params.set("year", String(filters.year));
  const nicknameList = Array.isArray(filters.nicknames)
    ? filters.nicknames.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (nicknameList.length > 0) {
    params.set("nicknames", nicknameList.join(","));
  }
  if (filters.nickname && filters.nickname.trim()) {
    params.set("nickname", filters.nickname.trim());
  }
  const response = await apiRequest("GET", `/api/collection/summary?${params.toString()}`);
  return response.json() as Promise<{
    ok: boolean;
    year: number;
    summary: CollectionMonthlySummary[];
    freshness?: CollectionReportFreshness;
  }>;
}

type CollectionReportRequestOptions = {
  signal?: AbortSignal;
};

export async function getCollectionNicknameSummary(filters: {
  from?: string;
  to?: string;
  nicknames: string[];
  summaryOnly?: boolean;
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
}, options?: CollectionReportRequestOptions) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set(
    "nicknames",
    filters.nicknames.map((value) => String(value || "").trim()).filter(Boolean).join(","),
  );
  if (filters.summaryOnly) {
    params.set("summaryOnly", "1");
  }
  if (typeof filters.page === "number" && Number.isFinite(filters.page)) {
    params.set("page", String(filters.page));
  }
  const pageSize = filters.pageSize ?? filters.limit;
  if (typeof pageSize === "number" && Number.isFinite(pageSize)) {
    params.set("pageSize", String(pageSize));
  }
  if (typeof filters.offset === "number" && Number.isFinite(filters.offset)) {
    params.set("offset", String(filters.offset));
  }
  const response = await apiRequest(
    "GET",
    `/api/collection/nickname-summary?${params.toString()}`,
    undefined,
    options,
  );
  return response.json() as Promise<CollectionNicknameSummaryResponse>;
}
