import { apiRequest } from "../api-client";
import { parseApiJson } from "./contract";
import {
  analyticsLoginTrendsResponseSchema,
  analyticsPeakHoursResponseSchema,
  analyticsRoleDistributionResponseSchema,
  analyticsSummaryResponseSchema,
  analyticsTopUsersResponseSchema,
} from "@shared/api-contracts";

type AnalyticsRequestOptions = {
  signal?: AbortSignal | undefined;
};

export async function getAnalyticsSummary(options?: AnalyticsRequestOptions) {
  const response = await apiRequest("GET", "/api/analytics/summary", undefined, options);
  return parseApiJson(response, analyticsSummaryResponseSchema, "/api/analytics/summary");
}

export async function getLoginTrends(days: number = 7, options?: AnalyticsRequestOptions) {
  const response = await apiRequest(
    "GET",
    `/api/analytics/login-trends?days=${days}`,
    undefined,
    options,
  );
  return parseApiJson(
    response,
    analyticsLoginTrendsResponseSchema,
    "/api/analytics/login-trends",
  );
}

export async function getTopActiveUsers(pageSize: number = 10, options?: AnalyticsRequestOptions) {
  const response = await apiRequest(
    "GET",
    `/api/analytics/top-users?pageSize=${pageSize}`,
    undefined,
    options,
  );
  return parseApiJson(response, analyticsTopUsersResponseSchema, "/api/analytics/top-users");
}

export async function getPeakHours(options?: AnalyticsRequestOptions) {
  const response = await apiRequest("GET", "/api/analytics/peak-hours", undefined, options);
  return parseApiJson(response, analyticsPeakHoursResponseSchema, "/api/analytics/peak-hours");
}

export async function getRoleDistribution(options?: AnalyticsRequestOptions) {
  const response = await apiRequest("GET", "/api/analytics/role-distribution", undefined, options);
  return parseApiJson(
    response,
    analyticsRoleDistributionResponseSchema,
    "/api/analytics/role-distribution",
  );
}
