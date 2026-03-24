import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getCsrfHeader } from "./api/shared";

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

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    if (parsed?.banned) {
      localStorage.setItem("banned", "1");
    }

    if (parsed?.forcePasswordChange) {
      localStorage.setItem("forcePasswordChange", "1");
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("force-password-change", {
            detail: parsed,
          }),
        );
      }
    }

    if (parsed?.forceLogout) {
      localStorage.setItem("forceLogout", "true");
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("force-logout", {
            detail: parsed,
          }),
        );
      }
    }

    if (res.status === 503) {
      try {
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

    const errorMessage = parsed?.error?.message || parsed?.message || text;
    throw new Error(
      `${res.status}: ${JSON.stringify(parsed || { message: errorMessage })}`,
    );
  }
}

type ApiRequestOptions = {
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  options?: ApiRequestOptions,
): Promise<Response> {
  const isFormDataPayload =
    typeof FormData !== "undefined"
    && data instanceof FormData;
  const headers: Record<string, string> = {
    ...(String(method || "").toUpperCase() === "GET"
      || String(method || "").toUpperCase() === "HEAD"
      || String(method || "").toUpperCase() === "OPTIONS"
      ? {}
      : (getCsrfHeader() as Record<string, string>)),
    ...(options?.headers || {}),
  };
  if (data && !isFormDataPayload) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: data
      ? isFormDataPayload
        ? data as FormData
        : JSON.stringify(data)
      : undefined,
    credentials: "include",
    signal: options?.signal,
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
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
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
