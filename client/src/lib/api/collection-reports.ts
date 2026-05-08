import { apiRequest } from "../api-client";
import { parseApiJson } from "./contract";
import type {
  CollectionMonthlyComparisonResponse,
  CollectionMonthlyTargetResponse,
  CollectionMonthlySummary,
  CollectionNicknameSummaryResponse,
  CollectionReportFreshness,
} from "./collection-types";
import {
  collectionMonthlyComparisonResponseSchema,
  collectionMonthlyTargetResponseSchema,
} from "@shared/api-contracts";

export async function getCollectionMonthlySummary(filters: { year: number; nickname?: string | undefined; nicknames?: string[] | undefined }) {
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
  signal?: AbortSignal | undefined;
};

export async function getCollectionMonthlyComparison(
  filters: {
    nickname?: string | undefined;
    startMonth: string;
    endMonth: string;
  },
  options?: CollectionReportRequestOptions,
) {
  const params = new URLSearchParams();
  if (filters.nickname && filters.nickname.trim()) {
    params.set("nickname", filters.nickname.trim());
  }
  params.set("startMonth", String(filters.startMonth || "").trim());
  params.set("endMonth", String(filters.endMonth || "").trim());

  const response = await apiRequest(
    "GET",
    `/api/collection/monthly-comparison?${params.toString()}`,
    undefined,
    options,
  );
  return parseApiJson(
    response,
    collectionMonthlyComparisonResponseSchema,
    "/api/collection/monthly-comparison",
  ) as Promise<CollectionMonthlyComparisonResponse>;
}

export async function getCollectionMonthlyTarget(
  filters: {
    nickname?: string | undefined;
    month: string;
  },
  options?: CollectionReportRequestOptions,
) {
  const params = new URLSearchParams();
  const nickname = String(filters.nickname || "").trim();
  if (nickname) {
    params.set("nickname", nickname);
  }
  params.set("month", String(filters.month || "").trim());

  const response = await apiRequest(
    "GET",
    `/api/collection/monthly-target?${params.toString()}`,
    undefined,
    options,
  );
  return parseApiJson(
    response,
    collectionMonthlyTargetResponseSchema,
    "/api/collection/monthly-target",
  ) as Promise<CollectionMonthlyTargetResponse>;
}

export async function getCollectionNicknameSummary(filters: {
  from?: string | undefined;
  to?: string | undefined;
  nicknames: string[];
  summaryOnly?: boolean | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
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
