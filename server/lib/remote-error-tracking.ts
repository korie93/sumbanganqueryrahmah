import type { ClientErrorTelemetryPayload } from "../../shared/client-error-telemetry";
import { runtimeConfig } from "../config/runtime";
import { logger, sanitizeForLog } from "./logger";

const REMOTE_ERROR_DELIVERY_FAILURE_LOG_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_REMOTE_ERROR_TRACKING_SERVICE = "sqr";

type RemoteErrorTrackingConfig = {
  enabled: boolean;
  endpoint: string | null;
  timeoutMs: number;
  environment: string;
  release: string | null;
  service: string;
};

type RemoteErrorTrackingClientContext = {
  requestId?: string | undefined;
};

type RemoteErrorTrackingServerContext = {
  code?: string | undefined;
  errorName?: string | undefined;
  eventType?: string | undefined;
  message: string;
  method?: string | undefined;
  path?: string | undefined;
  requestId?: string | undefined;
  routePath?: string | undefined;
  statusCode?: number | undefined;
};

type RemoteErrorTrackingEvent = {
  client?: {
    boundaryKey?: string | undefined;
    component?: string | undefined;
    errorName?: string | undefined;
    pagePath?: string | undefined;
    reasonType?: string | undefined;
    source?: string | undefined;
  };
  environment: string;
  eventType: string;
  release?: string | undefined;
  request?: {
    id?: string | undefined;
    method?: string | undefined;
    path?: string | undefined;
    routePath?: string | undefined;
    statusCode?: number | undefined;
  };
  service: string;
  severity: "error";
  source: "client" | "server";
  ts: string;
  error: {
    code?: string | undefined;
    message: string;
    name?: string | undefined;
  };
};

export type RemoteErrorTracker = {
  captureClientError: (
    payload: ClientErrorTelemetryPayload,
    context?: RemoteErrorTrackingClientContext,
  ) => Promise<void>;
  captureServerError: (context: RemoteErrorTrackingServerContext) => Promise<void>;
};

type CreateRemoteErrorTrackerOptions = {
  config: RemoteErrorTrackingConfig;
  fetchImpl?: typeof fetch | undefined;
  now?: (() => Date) | undefined;
  log?: typeof logger | undefined;
};

function trimOptionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength);
}

function sanitizeRemoteMessage(message: unknown): string {
  const normalized = trimOptionalString(String(message || ""), 300);
  const sanitized = sanitizeForLog(normalized || "Remote runtime error");
  return typeof sanitized === "string" && sanitized.trim()
    ? sanitized
    : "Remote runtime error";
}

function sanitizeRemoteEvent(event: RemoteErrorTrackingEvent): RemoteErrorTrackingEvent {
  return sanitizeForLog(event) as RemoteErrorTrackingEvent;
}

function buildRemoteClientErrorEvent(
  config: RemoteErrorTrackingConfig,
  payload: ClientErrorTelemetryPayload,
  context?: RemoteErrorTrackingClientContext,
): RemoteErrorTrackingEvent {
  return sanitizeRemoteEvent({
    client: {
      ...(trimOptionalString(payload.boundaryKey, 120) ? { boundaryKey: trimOptionalString(payload.boundaryKey, 120) } : {}),
      ...(trimOptionalString(payload.component, 120) ? { component: trimOptionalString(payload.component, 120) } : {}),
      ...(trimOptionalString(payload.errorName, 120) ? { errorName: trimOptionalString(payload.errorName, 120) } : {}),
      ...(trimOptionalString(payload.pagePath, 512) ? { pagePath: trimOptionalString(payload.pagePath, 512) } : {}),
      ...(trimOptionalString(payload.reasonType, 64) ? { reasonType: trimOptionalString(payload.reasonType, 64) } : {}),
      ...(trimOptionalString(payload.source, 64) ? { source: trimOptionalString(payload.source, 64) } : {}),
    },
    environment: config.environment,
    eventType: "client.runtime_error",
    ...(config.release ? { release: config.release } : {}),
    request: {
      ...(trimOptionalString(context?.requestId, 120) ? { id: trimOptionalString(context?.requestId, 120) } : {}),
    },
    service: config.service,
    severity: "error",
    source: "client",
    ts: trimOptionalString(payload.ts, 64) || new Date().toISOString(),
    error: {
      message: sanitizeRemoteMessage(payload.message),
      ...(trimOptionalString(payload.errorName, 120) ? { name: trimOptionalString(payload.errorName, 120) } : {}),
    },
  });
}

function buildRemoteServerErrorEvent(
  config: RemoteErrorTrackingConfig,
  context: RemoteErrorTrackingServerContext,
  now: () => Date,
): RemoteErrorTrackingEvent {
  return sanitizeRemoteEvent({
    environment: config.environment,
    eventType: trimOptionalString(context.eventType, 120) || "server.request_error",
    ...(config.release ? { release: config.release } : {}),
    request: {
      ...(trimOptionalString(context.requestId, 120) ? { id: trimOptionalString(context.requestId, 120) } : {}),
      ...(trimOptionalString(context.method, 16) ? { method: trimOptionalString(context.method, 16) } : {}),
      ...(trimOptionalString(context.path, 512) ? { path: trimOptionalString(context.path, 512) } : {}),
      ...(trimOptionalString(context.routePath, 256) ? { routePath: trimOptionalString(context.routePath, 256) } : {}),
      ...(typeof context.statusCode === "number" && Number.isFinite(context.statusCode)
        ? { statusCode: Math.trunc(context.statusCode) }
        : {}),
    },
    service: config.service,
    severity: "error",
    source: "server",
    ts: now().toISOString(),
    error: {
      ...(trimOptionalString(context.code, 120) ? { code: trimOptionalString(context.code, 120) } : {}),
      message: sanitizeRemoteMessage(context.message),
      ...(trimOptionalString(context.errorName, 120) ? { name: trimOptionalString(context.errorName, 120) } : {}),
    },
  });
}

export function createRemoteErrorTracker(options: CreateRemoteErrorTrackerOptions): RemoteErrorTracker {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const log = options.log ?? logger;
  const now = options.now ?? (() => new Date());
  let lastDeliveryFailureLogAtMs = 0;

  async function postEvent(event: RemoteErrorTrackingEvent) {
    if (!options.config.enabled || !options.config.endpoint || typeof fetchImpl !== "function") {
      return;
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), options.config.timeoutMs);

    try {
      const response = await fetchImpl(options.config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
        signal: controller.signal,
      });

      if (response.ok) {
        return;
      }

      const nowMs = now().getTime();
      if (nowMs - lastDeliveryFailureLogAtMs >= REMOTE_ERROR_DELIVERY_FAILURE_LOG_COOLDOWN_MS) {
        lastDeliveryFailureLogAtMs = nowMs;
        log.warn("Remote error tracking delivery failed", {
          statusCode: response.status,
        });
      }
    } catch (error) {
      const nowMs = now().getTime();
      if (nowMs - lastDeliveryFailureLogAtMs >= REMOTE_ERROR_DELIVERY_FAILURE_LOG_COOLDOWN_MS) {
        lastDeliveryFailureLogAtMs = nowMs;
        log.warn("Remote error tracking delivery failed", {
          errorMessage: error instanceof Error ? error.message : "unknown",
          errorName: error instanceof Error ? error.name : undefined,
        });
      }
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  return {
    async captureClientError(payload, context) {
      await postEvent(buildRemoteClientErrorEvent(options.config, payload, context));
    },
    async captureServerError(context) {
      await postEvent(buildRemoteServerErrorEvent(options.config, context, now));
    },
  };
}

export const remoteErrorTracker = createRemoteErrorTracker({
  config: {
    enabled: runtimeConfig.observability.remoteErrorTracking.enabled,
    endpoint: runtimeConfig.observability.remoteErrorTracking.endpoint,
    timeoutMs: runtimeConfig.observability.remoteErrorTracking.timeoutMs,
    environment: runtimeConfig.app.nodeEnv,
    release: trimOptionalString(process.env.npm_package_version, 64) ?? null,
    service: DEFAULT_REMOTE_ERROR_TRACKING_SERVICE,
  },
});
