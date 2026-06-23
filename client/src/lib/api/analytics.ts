import { apiRequest } from "../api-client";
import { parseApiJson } from "./contract";
import type { RecentLoginActivityPageQuery } from "@/pages/dashboard/types";
import {
  analyticsRoleDistributionSchema,
  analyticsTopUsersSchema,
} from "@shared/api-contracts";

type AnalyticsRequestOptions = {
  signal?: AbortSignal | undefined;
};

export async function getAnalyticsSummary(options?: AnalyticsRequestOptions) {
  const response = await apiRequest("GET", "/api/analytics/summary", undefined, options);
  return response.json();
}

export async function getLoginTrends(days: number = 7, options?: AnalyticsRequestOptions) {
  const response = await apiRequest(
    "GET",
    `/api/analytics/login-trends?days=${days}`,
    undefined,
    options,
  );
  return response.json();
}

export async function getTopActiveUsers(pageSize: number = 10, options?: AnalyticsRequestOptions) {
  const response = await apiRequest(
    "GET",
    `/api/analytics/top-users?pageSize=${pageSize}`,
    undefined,
    options,
  );
  return parseApiJson(
    response,
    analyticsTopUsersSchema,
    "/api/analytics/top-users",
  );
}

export async function getRecentLoginActivity(pageSize: number = 8, options?: AnalyticsRequestOptions) {
  const response = await apiRequest(
    "GET",
    `/api/analytics/recent-login-activity?pageSize=${pageSize}`,
    undefined,
    options,
  );
  return response.json();
}

export async function getRecentLoginActivityPage(
  query: RecentLoginActivityPageQuery,
  options?: AnalyticsRequestOptions,
) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    status: query.status,
  });
  if (query.search) params.set("search", query.search);
  if (query.role) params.set("role", query.role);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  params.set("sortBy", query.sortBy ?? "eventTime");
  params.set("sortOrder", query.sortOrder ?? "desc");
  const response = await apiRequest(
    "GET",
    `/api/analytics/recent-login-activity-page?${params.toString()}`,
    undefined,
    options,
  );
  return response.json();
}

export async function getPeakHours(options?: AnalyticsRequestOptions) {
  const response = await apiRequest("GET", "/api/analytics/peak-hours", undefined, options);
  return response.json();
}

export async function getRoleDistribution(options?: AnalyticsRequestOptions) {
  const response = await apiRequest("GET", "/api/analytics/role-distribution", undefined, options);
  return parseApiJson(
    response,
    analyticsRoleDistributionSchema,
    "/api/analytics/role-distribution",
  );
}
