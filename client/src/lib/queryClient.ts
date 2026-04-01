import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { createApiHeaders, throwIfResNotOk } from "./api-client";

const isLowSpecClient = (() => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const perfOverride = localStorage.getItem("perf_mode");
  if (perfOverride === "low") return true;
  if (perfOverride === "high") return false;

  const cores = navigator.hardwareConcurrency || 4;
  const ramGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  return cores <= 4 || ramGb <= 4 || saveData;
})();

const QUERY_STALE_TIME = isLowSpecClient ? 10_000 : 30_000;
const QUERY_GC_TIME = isLowSpecClient ? 45_000 : 2 * 60_000;

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: createApiHeaders(),
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
      staleTime: QUERY_STALE_TIME,
      gcTime: QUERY_GC_TIME,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
