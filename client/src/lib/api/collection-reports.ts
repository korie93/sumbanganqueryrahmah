import { apiRequest } from "../queryClient";
import type {
  CollectionMonthlySummary,
  CollectionRecord,
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
  return response.json() as Promise<{ ok: boolean; year: number; summary: CollectionMonthlySummary[] }>;
}

export async function getCollectionNicknameSummary(filters: {
  from?: string;
  to?: string;
  nicknames: string[];
  summaryOnly?: boolean;
}) {
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
  const response = await apiRequest("GET", `/api/collection/nickname-summary?${params.toString()}`);
  return response.json() as Promise<{
    ok: boolean;
    nicknames: string[];
    totalRecords: number;
    totalAmount: number;
    nicknameTotals: Array<{
      nickname: string;
      totalRecords: number;
      totalAmount: number;
    }>;
    records: CollectionRecord[];
  }>;
}
