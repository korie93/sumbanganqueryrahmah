import { getCsrfHeader } from "./api/shared";
import {
  broadcastForcedLogout,
  setBannedSessionFlag,
  setStoredForcePasswordChange,
} from "./auth-session";
import { createClientRandomId } from "./secure-id";

export function createApiRequestId() {
  return createClientRandomId("api");
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

type ApiErrorPayload = Record<string, unknown> & {
  error?: { message?: unknown };
  message?: unknown;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonObject(text: string): ApiErrorPayload | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readApiMessage(payload: ApiErrorPayload | null): string {
  const nestedMessage = payload?.error?.message;
  if (typeof nestedMessage === "string" && nestedMessage.trim()) {
    return nestedMessage;
  }

  const message = payload?.message;
  return typeof message === "string" ? message : "";
}

export async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const requestId = String(res.headers.get("x-request-id") || "").trim();
    const parsed = parseJsonObject(text);

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
      broadcastForcedLogout(readApiMessage(parsed));
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

    const errorMessage = readApiMessage(parsed) || normalizePlainTextErrorMessage(res, text);
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
  signal?: AbortSignal | undefined;
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

  const requestInit: RequestInit = {
    method,
    headers,
    credentials: "include",
  };
  if (data) {
    requestInit.body = isFormDataPayload ? data as FormData : JSON.stringify(data);
  }
  if (options?.signal) {
    requestInit.signal = options.signal;
  }

  const res = await fetch(url, requestInit);

  await throwIfResNotOk(res);
  return res;
}
