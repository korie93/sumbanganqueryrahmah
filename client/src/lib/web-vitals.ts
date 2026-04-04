import type { Metric } from "web-vitals";
import type { WebVitalTelemetryPayload } from "@shared/web-vitals";

const WEB_VITALS_ENDPOINT = "/telemetry/web-vitals";
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/forgot-password",
  "/activate-account",
  "/reset-password",
  "/maintenance",
]);

let webVitalsInitialized = false;

type NavigatorWithConnection = Navigator & {
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
  };
};

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

function isProductionBuild() {
  return Boolean(import.meta.env?.PROD);
}

function createTelemetryRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `rum-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function classifyWebVitalPageType(pathname: string) {
  return PUBLIC_PATHS.has(pathname) ? "public" : "authenticated";
}

export function buildWebVitalPayload(
  metric: Pick<Metric, "name" | "value" | "delta" | "rating" | "id" | "navigationType">,
  options: {
    pathname?: string;
    visibilityState?: string;
    effectiveConnectionType?: string;
    saveData?: boolean;
    capturedAt?: string;
  } = {},
): WebVitalTelemetryPayload {
  const pathname = options.pathname || "/";

  return {
    name: metric.name,
    value: Number(metric.value),
    delta: Number(metric.delta),
    rating: metric.rating,
    id: String(metric.id || ""),
    path: pathname,
    pageType: classifyWebVitalPageType(pathname),
    ...(metric.navigationType ? { navigationType: metric.navigationType } : {}),
    ...(options.visibilityState ? { visibilityState: options.visibilityState } : {}),
    ...(options.effectiveConnectionType
      ? { effectiveConnectionType: options.effectiveConnectionType }
      : {}),
    ...(typeof options.saveData === "boolean" ? { saveData: options.saveData } : {}),
    ts: options.capturedAt || new Date().toISOString(),
  };
}

function sendWebVitalPayload(payload: WebVitalTelemetryPayload) {
  const body = JSON.stringify(payload);

  try {
    if (typeof navigator.sendBeacon === "function") {
      const sent = navigator.sendBeacon(
        WEB_VITALS_ENDPOINT,
        new Blob([body], { type: "application/json" }),
      );
      if (sent) {
        return;
      }
    }
  } catch {
    // fall through to keepalive fetch
  }

  void fetch(WEB_VITALS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": createTelemetryRequestId(),
    },
    body,
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => undefined);
}

async function startWebVitalsCollection() {
  const { onCLS, onFCP, onINP, onLCP, onTTFB } = await import("web-vitals");
  const nav = navigator as NavigatorWithConnection;

  const reportMetric = (metric: Metric) => {
    sendWebVitalPayload(
      buildWebVitalPayload(metric, {
        pathname: window.location.pathname || "/",
        visibilityState: document.visibilityState,
        effectiveConnectionType: nav.connection?.effectiveType,
        saveData: nav.connection?.saveData,
      }),
    );
  };

  onCLS(reportMetric);
  onFCP(reportMetric);
  onINP(reportMetric);
  onLCP(reportMetric);
  onTTFB(reportMetric);
}

export function initializeWebVitalsReporting() {
  if (webVitalsInitialized || typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  if (!isProductionBuild() || navigator.webdriver) {
    return;
  }

  webVitalsInitialized = true;

  const start = () => {
    void startWebVitalsCollection().catch(() => undefined);
  };

  const idleWindow = window as WindowWithIdleCallback;
  if (typeof idleWindow.requestIdleCallback === "function") {
    idleWindow.requestIdleCallback(start, { timeout: 2_000 });
    return;
  }

  window.setTimeout(start, 1_200);
}
