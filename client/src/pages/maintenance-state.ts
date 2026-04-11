export type MaintenancePayload = {
  maintenance: boolean;
  message: string;
  type: "soft" | "hard";
  startTime?: string | null;
  endTime?: string | null;
};

export const MAINTENANCE_STATUS_POLL_INTERVAL_MS = 15_000;
export const MAINTENANCE_COUNTDOWN_TICK_INTERVAL_MS = 1_000;

function normalizeMaintenanceMode(value: unknown): "soft" | "hard" {
  return value === "soft" ? "soft" : "hard";
}

function normalizeOptionalTime(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export function mergeMaintenancePayload(
  previous: MaintenancePayload,
  incoming: Partial<MaintenancePayload> | null | undefined,
): MaintenancePayload {
  if (!incoming || typeof incoming !== "object") {
    return previous;
  }

  return {
    maintenance:
      typeof incoming.maintenance === "boolean"
        ? incoming.maintenance
        : previous.maintenance,
    message:
      typeof incoming.message === "string" && incoming.message.trim().length > 0
        ? incoming.message
        : previous.message,
    type: normalizeMaintenanceMode(incoming.type ?? previous.type),
    startTime:
      incoming.startTime === undefined
        ? previous.startTime ?? null
        : normalizeOptionalTime(incoming.startTime),
    endTime:
      incoming.endTime === undefined
        ? previous.endTime ?? null
        : normalizeOptionalTime(incoming.endTime),
  };
}

export function parseStoredMaintenanceState(
  rawValue: string | null | undefined,
  fallback: MaintenancePayload,
): MaintenancePayload {
  if (!rawValue) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<MaintenancePayload>;
    return mergeMaintenancePayload(fallback, parsed);
  } catch {
    return fallback;
  }
}
