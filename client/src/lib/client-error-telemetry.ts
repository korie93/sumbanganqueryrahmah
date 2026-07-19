import {
  normalizeClientErrorName,
  sanitizeClientErrorTelemetryPath,
  type ClientErrorTelemetryPayload,
  type ClientErrorTelemetrySource,
} from "@shared/client-error-telemetry";
import { createClientRandomId } from "@/lib/secure-id";
import { classifyWebVitalPageType } from "@/lib/web-vitals";

declare const __SQR_CLIENT_RELEASE_SHA__: string;

const CLIENT_ERROR_ENDPOINT = "/api/telemetry/client-errors";
const DEFAULT_DEDUPE_WINDOW_MS = 60_000;
const DEFAULT_MAX_RECENT_FINGERPRINTS = 100;
const MAX_TELEMETRY_BODY_BYTES = 3 * 1024;

type ClientErrorTelemetryEnvironment = {
  PROD?: boolean;
};

export type ClientErrorReport = {
  source: ClientErrorTelemetrySource;
  error: unknown;
  fingerprintContext?: string | null | undefined;
};

type CreateClientErrorReporterOptions = {
  dedupeWindowMs?: number;
  env?: ClientErrorTelemetryEnvironment;
  getOnline?: () => boolean | undefined;
  getPathname?: () => string;
  getVisibilityState?: () => string | undefined;
  isAutomatedBrowser?: () => boolean;
  maxRecentFingerprints?: number;
  now?: () => Date;
  releaseSha?: string;
  send?: (payload: ClientErrorTelemetryPayload) => void;
};

function resolveBuildReleaseSha() {
  return typeof __SQR_CLIENT_RELEASE_SHA__ === "string"
    ? __SQR_CLIENT_RELEASE_SHA__
    : "";
}

function normalizeReleaseSha(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{40}$/.test(normalized) ? normalized : undefined;
}

function normalizeVisibilityState(value: unknown): ClientErrorTelemetryPayload["visibilityState"] {
  return value === "hidden" || value === "visible" || value === "prerender"
    ? value
    : undefined;
}

function extractFingerprintStack(error: unknown) {
  if (!(error instanceof Error) || !error.stack) {
    return `non-error:${typeof error}`;
  }

  return error.stack
    .split("\n")
    .slice(1, 9)
    .map((line) => line.replace(/[?#][^\s)]*/g, ""))
    .join("\n")
    .slice(0, 2_048);
}

export function createClientErrorFingerprint(report: ClientErrorReport) {
  const errorName = normalizeClientErrorName(
    report.error instanceof Error ? report.error.name : "NonErrorRejection",
  );
  const material = [
    report.source,
    errorName,
    extractFingerprintStack(report.error),
    String(report.fingerprintContext || "").slice(0, 2_048),
  ].join("|");

  let primary = 0x811c9dc5;
  let secondary = 0x9e3779b9;
  for (let index = 0; index < material.length; index += 1) {
    const code = material.charCodeAt(index);
    primary = Math.imul(primary ^ code, 0x01000193);
    secondary = Math.imul(secondary ^ code, 0x85ebca6b);
  }

  return [primary, secondary]
    .map((value) => (value >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

function resolveErrorName(error: unknown) {
  if (error instanceof Error) {
    return normalizeClientErrorName(error.name);
  }
  return "NonErrorRejection";
}

function getPayloadByteLength(body: string) {
  if (typeof TextEncoder === "function") {
    return new TextEncoder().encode(body).byteLength;
  }
  return body.length;
}

export function sendClientErrorTelemetryPayload(payload: ClientErrorTelemetryPayload) {
  const body = JSON.stringify(payload);
  if (getPayloadByteLength(body) > MAX_TELEMETRY_BODY_BYTES) {
    return;
  }

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const sent = navigator.sendBeacon(
        CLIENT_ERROR_ENDPOINT,
        new Blob([body], { type: "application/json" }),
      );
      if (sent) {
        return;
      }
    }
  } catch {
    // Fall through to a same-origin keepalive request.
  }

  void fetch(CLIENT_ERROR_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": createClientRandomId("client-error"),
    },
    body,
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => undefined);
}

export function createClientErrorReporter(options: CreateClientErrorReporterOptions = {}) {
  const env = options.env ?? import.meta.env ?? {};
  const dedupeWindowMs = Math.max(1, Math.floor(options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS));
  const maxRecentFingerprints = Math.max(
    1,
    Math.floor(options.maxRecentFingerprints ?? DEFAULT_MAX_RECENT_FINGERPRINTS),
  );
  const now = options.now ?? (() => new Date());
  const send = options.send ?? sendClientErrorTelemetryPayload;
  const releaseSha = normalizeReleaseSha(options.releaseSha ?? resolveBuildReleaseSha());
  const recentFingerprints = new Map<string, number>();

  return (report: ClientErrorReport) => {
    const isAutomatedBrowser = options.isAutomatedBrowser
      ? options.isAutomatedBrowser()
      : typeof navigator !== "undefined" && navigator.webdriver;
    if (!env.PROD || isAutomatedBrowser) {
      return;
    }

    const capturedAt = now();
    const capturedAtMs = capturedAt.getTime();
    if (!Number.isFinite(capturedAtMs)) {
      return;
    }

    const fingerprint = createClientErrorFingerprint(report);
    for (const [key, lastReportedAt] of recentFingerprints) {
      if (capturedAtMs - lastReportedAt >= dedupeWindowMs) {
        recentFingerprints.delete(key);
      }
    }

    if (recentFingerprints.has(fingerprint)) {
      return;
    }

    while (recentFingerprints.size >= maxRecentFingerprints) {
      const oldestKey = recentFingerprints.keys().next().value;
      if (typeof oldestKey !== "string") {
        break;
      }
      recentFingerprints.delete(oldestKey);
    }
    recentFingerprints.set(fingerprint, capturedAtMs);

    const path = sanitizeClientErrorTelemetryPath(
      options.getPathname?.()
        ?? (typeof window !== "undefined" ? window.location.pathname : "/"),
    );
    const visibilityState = normalizeVisibilityState(
      options.getVisibilityState?.()
        ?? (typeof document !== "undefined" ? document.visibilityState : undefined),
    );
    const online = options.getOnline?.()
      ?? (typeof navigator !== "undefined" ? navigator.onLine : undefined);

    send({
      source: report.source,
      errorName: resolveErrorName(report.error),
      fingerprint,
      path,
      pageType: classifyWebVitalPageType(path),
      ...(releaseSha ? { releaseSha } : {}),
      ...(visibilityState ? { visibilityState } : {}),
      ...(typeof online === "boolean" ? { online } : {}),
      ts: capturedAt.toISOString(),
    });
  };
}

export const reportClientError = createClientErrorReporter();
