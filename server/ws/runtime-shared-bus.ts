import crypto from "node:crypto";
import { logger as defaultLogger } from "../lib/logger";
import { safeJsonParse } from "../lib/safe-json";

export const RUNTIME_WS_SHARED_BUS_CHANNEL = "sqr:runtime-ws:v1";
export const MAX_RUNTIME_WS_SHARED_BUS_EVENT_BYTES = 96 * 1024;

export type RuntimeWsSharedBusBroadcastEvent = {
  id: string;
  originId: string;
  payload: Record<string, unknown>;
  type: "broadcast";
};

export type RuntimeWsSharedBusCloseActivityEvent = {
  activityId: string;
  id: string;
  originId: string;
  reason?: string;
  type: "closeActivity";
};

export type RuntimeWsSharedBusEvent =
  | RuntimeWsSharedBusBroadcastEvent
  | RuntimeWsSharedBusCloseActivityEvent;

export type RuntimeWsSharedBusPublishEvent =
  | Omit<RuntimeWsSharedBusBroadcastEvent, "id" | "originId">
  | Omit<RuntimeWsSharedBusCloseActivityEvent, "id" | "originId">;

export type RuntimeWsSharedBus = {
  readonly instanceId: string;
  close: () => Promise<void> | void;
  publish: (event: RuntimeWsSharedBusPublishEvent) => void;
  subscribe: (handler: (event: RuntimeWsSharedBusEvent) => void) => () => void;
};

type LoggerLike = Pick<typeof defaultLogger, "warn">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createRuntimeWsBusEvent(
  instanceId: string,
  event: RuntimeWsSharedBusPublishEvent,
): RuntimeWsSharedBusEvent {
  const base = {
    id: crypto.randomUUID(),
    originId: instanceId,
  };

  if (event.type === "broadcast") {
    return {
      ...base,
      payload: event.payload,
      type: "broadcast",
    };
  }

  return {
    ...base,
    activityId: event.activityId,
    ...(event.reason ? { reason: event.reason } : {}),
    type: "closeActivity",
  };
}

export function serializeRuntimeWsSharedBusEvent(
  instanceId: string,
  event: RuntimeWsSharedBusPublishEvent,
  logger: LoggerLike = defaultLogger,
): string | null {
  try {
    const message = JSON.stringify(createRuntimeWsBusEvent(instanceId, event));
    if (Buffer.byteLength(message, "utf8") > MAX_RUNTIME_WS_SHARED_BUS_EVENT_BYTES) {
      logger.warn("WebSocket shared bus event skipped because it is too large", {
        maxBytes: MAX_RUNTIME_WS_SHARED_BUS_EVENT_BYTES,
        type: event.type,
      });
      return null;
    }

    return message;
  } catch {
    logger.warn("WebSocket shared bus event skipped because it could not be serialized", {
      type: event.type,
    });
    return null;
  }
}

export function parseRuntimeWsSharedBusEvent(
  rawMessage: string,
): RuntimeWsSharedBusEvent | null {
  if (Buffer.byteLength(rawMessage, "utf8") > MAX_RUNTIME_WS_SHARED_BUS_EVENT_BYTES) {
    return null;
  }

  let parsed: unknown;
  try {
    const parseResult = safeJsonParse<unknown>(
      rawMessage,
      "runtime_ws_shared_bus_event",
      {
        maxDepth: 8,
        maxObjectKeys: 128,
        maxRawBytes: MAX_RUNTIME_WS_SHARED_BUS_EVENT_BYTES,
        maxStringLength: 32 * 1024,
        maxTotalBytes: MAX_RUNTIME_WS_SHARED_BUS_EVENT_BYTES,
      },
    );
    if (!parseResult.success) {
      return null;
    }
    parsed = parseResult.data;
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const id = typeof parsed.id === "string" ? parsed.id.trim() : "";
  const originId = typeof parsed.originId === "string" ? parsed.originId.trim() : "";
  const type = typeof parsed.type === "string" ? parsed.type : "";
  if (!id || !originId) {
    return null;
  }

  if (type === "broadcast" && isRecord(parsed.payload)) {
    return {
      id,
      originId,
      payload: parsed.payload,
      type: "broadcast",
    };
  }

  if (type === "closeActivity") {
    const activityId = typeof parsed.activityId === "string" ? parsed.activityId.trim() : "";
    if (!activityId) {
      return null;
    }

    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";
    return {
      activityId,
      id,
      originId,
      ...(reason ? { reason } : {}),
      type: "closeActivity",
    };
  }

  return null;
}
