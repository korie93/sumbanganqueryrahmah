import { apiRequest } from "../queryClient";

type AnalyticsRequestOptions = {
  signal?: AbortSignal;
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

export async function getTopActiveUsers(limit: number = 10, options?: AnalyticsRequestOptions) {
  const response = await apiRequest(
    "GET",
    `/api/analytics/top-users?limit=${limit}`,
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
  return response.json();
}
