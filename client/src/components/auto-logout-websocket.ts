import { createClientRandomUnitInterval } from "@/lib/secure-id";

export const WS_RECONNECT_BASE_DELAY_MS = 1_000;
export const WS_RECONNECT_MAX_DELAY_MS = 30_000;

type AutoLogoutReasonMessage = {
  type: "logout" | "banned" | "kicked";
  reason?: string;
};

type AutoLogoutMaintenanceMessage = {
  type: "maintenance_update";
  maintenance: boolean;
  message: string;
  mode: "hard" | "soft";
  startTime: string | null;
  endTime: string | null;
};

type AutoLogoutSettingsUpdatedMessage = {
  type: "settings_updated";
  key?: string;
  updatedBy?: string;
};

export type AutoLogoutWebSocketMessage =
  | AutoLogoutReasonMessage
  | AutoLogoutMaintenanceMessage
  | AutoLogoutSettingsUpdatedMessage;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseAutoLogoutWebSocketMessage(rawData: unknown): AutoLogoutWebSocketMessage | null {
  if (typeof rawData !== "string") {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    return null;
  }

  if (!isObjectRecord(parsed) || typeof parsed.type !== "string") {
    return null;
  }

  if (parsed.type === "logout" || parsed.type === "banned" || parsed.type === "kicked") {
    return {
      type: parsed.type,
      ...(typeof parsed.reason === "string" ? { reason: parsed.reason } : {}),
    };
  }

  if (parsed.type === "maintenance_update") {
    return {
      type: "maintenance_update",
      maintenance: parsed.maintenance === true,
      message: typeof parsed.message === "string" ? parsed.message : "",
      mode: parsed.mode === "hard" ? "hard" : "soft",
      startTime: typeof parsed.startTime === "string" ? parsed.startTime : null,
      endTime: typeof parsed.endTime === "string" ? parsed.endTime : null,
    };
  }

  if (parsed.type === "settings_updated") {
    return {
      type: "settings_updated",
      ...(typeof parsed.key === "string" ? { key: parsed.key } : {}),
      ...(typeof parsed.updatedBy === "string" ? { updatedBy: parsed.updatedBy } : {}),
    };
  }

  return null;
}

export function resolveAutoLogoutReconnectDelayMs(
  attempt: number,
  randomValue = createClientRandomUnitInterval(),
): number {
  const safeAttempt = Math.max(0, Math.trunc(attempt));
  const safeRandom = Math.min(1, Math.max(0, randomValue));
  const exponentialDelay = Math.min(
    WS_RECONNECT_BASE_DELAY_MS * (2 ** safeAttempt),
    WS_RECONNECT_MAX_DELAY_MS,
  );
  const jitteredDelay = exponentialDelay * (0.8 + (safeRandom * 0.4));
  return Math.round(Math.min(WS_RECONNECT_MAX_DELAY_MS, jitteredDelay));
}
