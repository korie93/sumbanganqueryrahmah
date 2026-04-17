import type { ClientErrorTelemetryPayload } from "@shared/client-error-telemetry";
import { createClientRandomId } from "@/lib/secure-id";

export type ClientLoggerEnvironment = {
  DEV?: boolean;
  VITE_CLIENT_DEBUG?: string | undefined;
  VITE_CLIENT_ERROR_TELEMETRY?: string | undefined;
};

const CLIENT_ERROR_TELEMETRY_ENDPOINT = "/telemetry/client-errors";

export function shouldLogClientDiagnostics(env: ClientLoggerEnvironment = import.meta.env): boolean {
  return Boolean(env?.DEV || env?.VITE_CLIENT_DEBUG === "1");
}

function shouldSendClientErrorTelemetry(env: ClientLoggerEnvironment = import.meta.env): boolean {
  return env?.VITE_CLIENT_ERROR_TELEMETRY === "1";
}

function createClientTelemetryRequestId() {
  return createClientRandomId("cerr");
}

function truncateString(value: string, maxLength: number) {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function sanitizeClientErrorMessage(message: string) {
  return truncateString(String(message || "").trim() || "Client runtime error", 300);
}

function buildClientErrorTelemetryPayload(
  message: string,
  error?: unknown,
  details?: unknown,
): ClientErrorTelemetryPayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  const normalizedDetails = details && typeof details === "object"
    ? details as Record<string, unknown>
    : null;
  const errorLike = error && typeof error === "object"
    ? error as { name?: unknown }
    : null;
  const errorName = typeof errorLike?.name === "string"
    ? truncateString(errorLike.name.trim(), 120)
    : undefined;
  const source = typeof normalizedDetails?.source === "string"
    ? normalizedDetails.source
    : "client.log";

  return {
    message: sanitizeClientErrorMessage(message),
    source:
      source === "error-boundary"
      || source === "window.error"
      || source === "window.unhandledrejection"
        ? source
        : "client.log",
    pagePath: window.location.pathname || "/",
    ...(errorName ? { errorName } : {}),
    ...(typeof normalizedDetails?.component === "string"
      ? { component: truncateString(normalizedDetails.component, 120) }
      : {}),
    ...(typeof normalizedDetails?.boundaryKey === "string"
      ? { boundaryKey: truncateString(normalizedDetails.boundaryKey, 120) }
      : {}),
    ...(typeof normalizedDetails?.reasonType === "string"
      ? { reasonType: truncateString(normalizedDetails.reasonType, 64) }
      : {}),
    ts: new Date().toISOString(),
  };
}

function sendClientErrorTelemetry(payload: ClientErrorTelemetryPayload) {
  void fetch(CLIENT_ERROR_TELEMETRY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": createClientTelemetryRequestId(),
    },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export function logClientError(
  message: string,
  error?: unknown,
  details?: unknown,
  env: ClientLoggerEnvironment = import.meta.env,
): void {
  if (shouldSendClientErrorTelemetry(env)) {
    const payload = buildClientErrorTelemetryPayload(message, error, details);
    if (payload) {
      sendClientErrorTelemetry(payload);
    }
  }

  if (!shouldLogClientDiagnostics(env)) {
    return;
  }

  if (details !== undefined) {
    console.error(message, error, details);
    return;
  }

  if (error !== undefined) {
    console.error(message, error);
    return;
  }

  console.error(message);
}

export function logClientWarning(
  message: string,
  error?: unknown,
  details?: unknown,
  env: ClientLoggerEnvironment = import.meta.env,
): void {
  if (!shouldLogClientDiagnostics(env)) {
    return;
  }

  if (details !== undefined) {
    console.warn(message, error, details);
    return;
  }

  if (error !== undefined) {
    console.warn(message, error);
    return;
  }

  console.warn(message);
}
