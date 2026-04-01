import { getCsrfHeader } from "./api/shared";
import {
  broadcastForcedLogout,
  setBannedSessionFlag,
  setStoredForcePasswordChange,
} from "./auth-session";

export function createApiRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `api-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createApiHeaders(headers?: HeadersInit): Record<string, string> {
  const normalizedHeaders = new Headers(headers || undefined);
  const existingRequestId = String(normalizedHeaders.get("x-request-id") || "").trim();
  if (!existingRequestId) {
    normalizedHeaders.set("x-request-id", createApiRequestId());
  }

  return Object.fromEntries(normalizedHeaders.entries());
}

function looksLikeHtmlDocument(value: string) {
  return /<!doctype html|<html[\s>]|<body[\s>]|<head[\s>]/i.test(value);
}

function normalizePlainTextErrorMessage(res: Response, text: string) {
  const normalizedText = String(text || "").replace(/\s+/g, " ").trim();

  if (res.status === 413) {
    return "The selected file is too large to import. Try a smaller file or increase the server upload limit.";
  }

  if (looksLikeHtmlDocument(normalizedText)) {
    return `The server returned an unexpected ${res.status} error page.`;
  }

  if (!normalizedText) {
    return res.statusText || "Request failed";
  }

  return normalizedText.length > 240
    ? `${normalizedText.slice(0, 237)}...`
    : normalizedText;
}

export async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const requestId = String(res.headers.get("x-request-id") || "").trim();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    if (parsed?.banned) {
      setBannedSessionFlag(true);
    }

    if (parsed?.forcePasswordChange) {
      setStoredForcePasswordChange(true);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("force-password-change", {
            detail: parsed,
          }),
        );
      }
    }

    if (parsed?.forceLogout) {
      broadcastForcedLogout(parsed?.message || parsed?.error?.message || "");
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

    const errorMessage = parsed?.error?.message || parsed?.message || normalizePlainTextErrorMessage(res, text);
    const normalizedPayload = parsed || { message: errorMessage };
    if (requestId && !normalizedPayload.requestId) {
      normalizedPayload.requestId = requestId;
    }
    throw new Error(
      `${res.status}: ${JSON.stringify(normalizedPayload)}`,
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
  const headers = createApiHeaders({
    ...(String(method || "").toUpperCase() === "GET"
      || String(method || "").toUpperCase() === "HEAD"
      || String(method || "").toUpperCase() === "OPTIONS"
      ? {}
      : (getCsrfHeader() as Record<string, string>)),
    ...(options?.headers || {}),
  });
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
