import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { ApiRequestError, createApiHeaders, throwIfResNotOk } from "./api-client";
import { detectLowSpecMode } from "./low-spec-mode";

const isLowSpecClient = typeof window !== "undefined" ? detectLowSpecMode() : false;

const LIVE_QUERY_STALE_TIME = isLowSpecClient ? 10_000 : 15_000;
const DEFAULT_QUERY_STALE_TIME = isLowSpecClient ? 20_000 : 60_000;
const ANALYTICS_QUERY_STALE_TIME = isLowSpecClient ? 20_000 : 30_000;
const STATIC_QUERY_STALE_TIME = isLowSpecClient ? 45_000 : 90_000;
const QUERY_GC_TIME = isLowSpecClient ? 45_000 : 2 * 60_000;
const SAFE_QUERY_MAX_RETRIES = 1;

const LIVE_QUERY_PREFIXES = [
  "/api/activity",
  "/api/health",
  "/internal/alerts",
  "/internal/system-health",
  "/internal/web-vitals",
  "/api/debug/websocket-clients",
];

const ANALYTICS_QUERY_PREFIXES = [
  "/api/analytics",
  "/api/collection/summary",
  "/api/collection/nickname-summary",
  "/api/collection/daily",
  "/api/audit-logs",
];

const STATIC_QUERY_PREFIXES = [
  "/api/accounts",
  "/api/admin/users",
  "/api/users/banned",
  "/api/settings",
  "/api/settings/tab-visibility",
  "/api/app-config",
  "/api/search/columns",
  "/api/columns",
];

function readQueryPath(queryKey: readonly unknown[]): string {
  return typeof queryKey[0] === "string"
    ? queryKey[0]
    : "";
}

export function resolveDefaultQueryStaleTime(queryKey: readonly unknown[]): number {
  const path = readQueryPath(queryKey);
  if (LIVE_QUERY_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return LIVE_QUERY_STALE_TIME;
  }
  if (ANALYTICS_QUERY_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return ANALYTICS_QUERY_STALE_TIME;
  }
  if (STATIC_QUERY_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return STATIC_QUERY_STALE_TIME;
  }
  return DEFAULT_QUERY_STALE_TIME;
}

export function shouldRetrySafeQueryFailure(failureCount: number, error: unknown) {
  // React Query query functions in this app are GET-only, so a single retry is acceptable
  // for transient transport/server failures but should stay conservative for auth and 4xx paths.
  if (failureCount >= SAFE_QUERY_MAX_RETRIES) {
    return false;
  }

  if (error instanceof ApiRequestError) {
    return error.status === 408
      || error.status === 425
      || error.status === 429
      || error.status >= 500;
  }

  if (error instanceof DOMException) {
    return error.name !== "AbortError";
  }

  return error instanceof TypeError;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: createApiHeaders(),
      signal,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      staleTime: (query) => resolveDefaultQueryStaleTime(query.queryKey),
      gcTime: QUERY_GC_TIME,
      retry: shouldRetrySafeQueryFailure,
    },
    mutations: {
      retry: false,
    },
  },
});
