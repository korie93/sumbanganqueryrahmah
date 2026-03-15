import { apiRequest } from "../queryClient";

export async function getAnalyticsSummary() {
  const response = await apiRequest("GET", "/api/analytics/summary");
  return response.json();
}

export async function getLoginTrends(days: number = 7) {
  const response = await apiRequest("GET", `/api/analytics/login-trends?days=${days}`);
  return response.json();
}

export async function getTopActiveUsers(limit: number = 10) {
  const response = await apiRequest("GET", `/api/analytics/top-users?limit=${limit}`);
  return response.json();
}

export async function getPeakHours() {
  const response = await apiRequest("GET", "/api/analytics/peak-hours");
  return response.json();
}

export async function getRoleDistribution() {
  const response = await apiRequest("GET", "/api/analytics/role-distribution");
  return response.json();
}
