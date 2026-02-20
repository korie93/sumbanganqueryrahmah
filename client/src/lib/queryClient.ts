import { QueryClient, QueryFunction } from "@tanstack/react-query";

const isLowSpecClient = (() => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const cores = navigator.hardwareConcurrency || 4;
  const ramGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  return cores <= 4 || ramGb <= 4 || saveData;
})();

const QUERY_STALE_TIME = isLowSpecClient ? 15_000 : 60_000;
const QUERY_GC_TIME = isLowSpecClient ? 60_000 : 5 * 60_000;

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    if (res.status === 503) {
      try {
        const parsed = JSON.parse(text);
        if (parsed?.maintenance) {
          localStorage.setItem("maintenanceState", JSON.stringify(parsed));
          if (typeof window !== "undefined") {
            window.location.href = "/maintenance";
          }
        }
      } catch {
        // ignore JSON parse failure, keep default error path
      }
    }
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
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
