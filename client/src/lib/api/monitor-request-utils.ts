import { createApiHeaders } from "../api-client";
import { getAuthHeader, getCsrfHeader } from "./shared";
import type { MonitorApiResult, MonitorRequestOptions } from "./monitor-types";

export async function parseMonitorErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return response.statusText || "Request failed";
    try {
      const parsed = JSON.parse(text);
      return String(parsed?.message || parsed?.error || text);
    } catch {
      return text;
    }
  } catch {
    return response.statusText || "Request failed";
  }
}

export async function fetchMonitorEndpoint<T>(
  endpoint: string,
  options?: MonitorRequestOptions,
): Promise<MonitorApiResult<T>> {
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: createApiHeaders({
        ...getAuthHeader(),
      }),
      credentials: "include",
      signal: options?.signal ?? null,
    });

    if (response.status === 401) {
      return {
        state: "unauthorized",
        status: 401,
        data: null,
        message: await parseMonitorErrorMessage(response),
      };
    }

    if (response.status === 403) {
      return {
        state: "forbidden",
        status: 403,
        data: null,
        message: await parseMonitorErrorMessage(response),
      };
    }

    if (!response.ok) {
      return {
        state: "network_error",
        status: response.status,
        data: null,
        message: await parseMonitorErrorMessage(response),
      };
    }

    const data = (await response.json()) as T;
    return {
      state: "ok",
      status: 200,
      data,
      message: null,
    };
  } catch (error: unknown) {
    return {
      state: "network_error",
      status: 0,
      data: null,
      message: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function postMonitorEndpoint<T>(
  endpoint: string,
  body: unknown,
  options?: MonitorRequestOptions,
): Promise<MonitorApiResult<T>> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: createApiHeaders({
        "Content-Type": "application/json",
        ...getAuthHeader(),
        ...(getCsrfHeader() as Record<string, string>),
      }),
      credentials: "include",
      body: JSON.stringify(body ?? {}),
      signal: options?.signal ?? null,
    });

    if (response.status === 401) {
      return {
        state: "unauthorized",
        status: 401,
        data: null,
        message: await parseMonitorErrorMessage(response),
      };
    }

    if (response.status === 403) {
      return {
        state: "forbidden",
        status: 403,
        data: null,
        message: await parseMonitorErrorMessage(response),
      };
    }

    if (!response.ok) {
      return {
        state: "network_error",
        status: response.status,
        data: null,
        message: await parseMonitorErrorMessage(response),
      };
    }

    const data = (await response.json()) as T;
    return {
      state: "ok",
      status: 200,
      data,
      message: null,
    };
  } catch (error: unknown) {
    return {
      state: "network_error",
      status: 0,
      data: null,
      message: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function deleteMonitorEndpoint<T>(
  endpoint: string,
  body: unknown,
  options?: MonitorRequestOptions,
): Promise<MonitorApiResult<T>> {
  try {
    const response = await fetch(endpoint, {
      method: "DELETE",
      headers: createApiHeaders({
        "Content-Type": "application/json",
        ...getAuthHeader(),
        ...(getCsrfHeader() as Record<string, string>),
      }),
      credentials: "include",
      body: JSON.stringify(body ?? {}),
      signal: options?.signal ?? null,
    });

    if (response.status === 401) {
      return {
        state: "unauthorized",
        status: 401,
        data: null,
        message: await parseMonitorErrorMessage(response),
      };
    }

    if (response.status === 403) {
      return {
        state: "forbidden",
        status: 403,
        data: null,
        message: await parseMonitorErrorMessage(response),
      };
    }

    if (!response.ok) {
      return {
        state: "network_error",
        status: response.status,
        data: null,
        message: await parseMonitorErrorMessage(response),
      };
    }

    const data = (await response.json()) as T;
    return {
      state: "ok",
      status: 200,
      data,
      message: null,
    };
  } catch (error: unknown) {
    return {
      state: "network_error",
      status: 0,
      data: null,
      message: error instanceof Error ? error.message : "Network error",
    };
  }
}
