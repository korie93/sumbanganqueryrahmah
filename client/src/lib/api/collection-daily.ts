import { apiRequest } from "../api-client";
import type { CollectionAmountMyrNumber } from "@shared/collection-amount-types";
import type {
  CollectionDailyDayDetailsResponse,
  CollectionDailyOverviewResponse,
  CollectionDailyUser,
} from "./collection-types";

type CollectionDailyRequestOptions = {
  signal?: AbortSignal | undefined;
};

export async function getCollectionDailyUsers(options?: CollectionDailyRequestOptions) {
  const response = await apiRequest(
    "GET",
    "/api/collection/daily/users",
    undefined,
    options,
  );
  return response.json() as Promise<{ ok: boolean; users: CollectionDailyUser[] }>;
}

export async function setCollectionDailyTarget(payload: {
  username: string;
  year: number;
  month: number;
  monthlyTarget: CollectionAmountMyrNumber;
}) {
  const response = await apiRequest("PUT", "/api/collection/daily/target", payload);
  return response.json() as Promise<{
    ok: boolean;
    target: {
      id: string;
      username: string;
      year: number;
      month: number;
      monthlyTarget: CollectionAmountMyrNumber;
    };
  }>;
}

export async function setCollectionDailyCalendar(payload: {
  year: number;
  month: number;
  days: Array<{
    day: number;
    isWorkingDay: boolean;
    isHoliday: boolean;
    holidayName?: string | null;
  }>;
}) {
  const response = await apiRequest("PUT", "/api/collection/daily/calendar", payload);
  return response.json() as Promise<{ ok: boolean; calendar: Array<Record<string, unknown>> }>;
}

export async function getCollectionDailyOverview(filters: {
  year: number;
  month: number;
  username?: string | undefined;
  usernames?: string[] | undefined;
}, options?: CollectionDailyRequestOptions) {
  const params = new URLSearchParams();
  params.set("year", String(filters.year));
  params.set("month", String(filters.month));
  if (Array.isArray(filters.usernames) && filters.usernames.length > 0) {
    params.set(
      "usernames",
      filters.usernames.map((value) => String(value || "").trim()).filter(Boolean).join(","),
    );
  }
  if (filters.username) {
    params.set("username", filters.username);
  }
  const response = await apiRequest(
    "GET",
    `/api/collection/daily/overview?${params.toString()}`,
    undefined,
    options,
  );
  return response.json() as Promise<CollectionDailyOverviewResponse>;
}

export async function getCollectionDailyDayDetails(filters: {
  date: string;
  username?: string | undefined;
  usernames?: string[] | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}, options?: CollectionDailyRequestOptions) {
  const params = new URLSearchParams();
  params.set("date", filters.date);
  if (Array.isArray(filters.usernames) && filters.usernames.length > 0) {
    params.set(
      "usernames",
      filters.usernames.map((value) => String(value || "").trim()).filter(Boolean).join(","),
    );
  }
  if (filters.username) {
    params.set("username", filters.username);
  }
  if (typeof filters.page === "number" && Number.isFinite(filters.page)) {
    params.set("page", String(filters.page));
  }
  if (typeof filters.pageSize === "number" && Number.isFinite(filters.pageSize)) {
    params.set("pageSize", String(filters.pageSize));
  }
  const response = await apiRequest(
    "GET",
    `/api/collection/daily/day-details?${params.toString()}`,
    undefined,
    options,
  );
  return response.json() as Promise<CollectionDailyDayDetailsResponse>;
}
