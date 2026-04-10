import { CHAOS_OPTIONS } from "@/components/monitor/monitorData";
import type { ChaosType } from "@/lib/api";
import { isMobileViewportWidth } from "@/lib/responsive";

export type MonitorQueueAction = "drain" | "retry-failures" | "auto-heal" | "rebuild";

export type MonitorRoleCapabilities = {
  canInjectChaos: boolean;
  canDeleteAlertHistory: boolean;
  canManageRollups: boolean;
};

export type MonitorInitialPageState = {
  isCompactViewport: boolean;
  metricsOpen: boolean;
  alertsOpen: boolean;
  deferSecondaryMobileSections: boolean;
};

export type ParsedMonitorChaosRequest =
  | {
      ok: true;
      magnitude?: number | undefined;
      durationMs?: number | undefined;
    }
  | {
      ok: false;
      reason: "invalid-magnitude" | "invalid-duration";
    };

export function resolveInitialMonitorPageState(width?: number): MonitorInitialPageState {
  const isCompactViewport = isMobileViewportWidth(width);

  return {
    isCompactViewport,
    metricsOpen: !isCompactViewport,
    alertsOpen: !isCompactViewport,
    deferSecondaryMobileSections: isCompactViewport,
  };
}

export function resolveMonitorRoleCapabilities(role: string | null | undefined): MonitorRoleCapabilities {
  return {
    canInjectChaos: role === "admin" || role === "superuser",
    canDeleteAlertHistory: role === "superuser",
    canManageRollups: role === "superuser",
  };
}

export function resolveMonitorChaosProfile(type: ChaosType) {
  return CHAOS_OPTIONS.find((option) => option.type === type) ?? CHAOS_OPTIONS[0];
}

export function isValidMonitorAlertRetentionWindow(olderThanDays: number) {
  return Number.isFinite(olderThanDays) && olderThanDays >= 1;
}

export function parseMonitorChaosRequestInput(
  chaosMagnitude: string,
  chaosDurationMs: string,
): ParsedMonitorChaosRequest {
  const magnitude = chaosMagnitude.trim() === "" ? undefined : Number(chaosMagnitude);
  const durationMs = chaosDurationMs.trim() === "" ? undefined : Number(chaosDurationMs);

  if (magnitude !== undefined && !Number.isFinite(magnitude)) {
    return {
      ok: false,
      reason: "invalid-magnitude",
    };
  }

  if (durationMs !== undefined && (!Number.isFinite(durationMs) || durationMs <= 0)) {
    return {
      ok: false,
      reason: "invalid-duration",
    };
  }

  return {
    ok: true,
    magnitude,
    durationMs,
  };
}
