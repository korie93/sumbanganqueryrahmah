import { createHash } from "node:crypto";
import { resolveTimestampMs, serializeTimestamp } from "../lib/timestamp";
import { logger } from "../lib/logger";
import { maskClientIpAddress } from "../http/client-ip";
import type {
  ActivityFilters,
  ActivityInvestigationRelatedPageOptions,
  ActivityPageOptions,
  ActivityResponseAccess,
  ActivityRetentionCleanupSource,
  ActivityRetentionStatus,
  ActivityStorage,
} from "./activity-service-types";

type CloseActivitySocket = (
  activityId: string,
  payload?: Record<string, unknown>,
) => Promise<void>;

const DAY_MS = 24 * 60 * 60 * 1_000;

type ActivityListItem = Awaited<ReturnType<ActivityStorage["getAllActivities"]>>[number] & {
  id?: string | null | undefined;
  isActive?: boolean | null | undefined;
  logoutTime?: Date | string | null | undefined;
  loginTime?: Date | string | null | undefined;
  username?: string | null | undefined;
  ipAddress?: string | null | undefined;
  browser?: string | null | undefined;
  deviceType?: string | null | undefined;
  platform?: string | null | undefined;
  lastActivityTime?: Date | string | null | undefined;
  status?: string | undefined;
};

function resolveActivityTimestampMs(value: Date | string | null | undefined) {
  return resolveTimestampMs(value);
}

function hashActivityIdForLogoutFlush(activityId: string): string {
  return createHash("sha256")
    .update(activityId)
    .digest("base64url")
    .slice(0, 16);
}

type SerializedActivityListItem<T extends ActivityListItem> = Omit<
  T,
  "fingerprint" | "lastActivityTime" | "loginTime" | "logoutTime" | "userId"
> & {
  lastActivityTime: string | null;
  loginTime: string;
  logoutTime: string | null;
};

function serializeActivityForResponse<T extends ActivityListItem>(
  activity: T,
  access: ActivityResponseAccess = {},
): SerializedActivityListItem<T> {
  const {
    fingerprint: omittedFingerprint,
    userId: omittedUserId,
    ...publicActivity
  } = activity;
  void omittedFingerprint;
  void omittedUserId;

  return {
    ...publicActivity,
    ipAddress: access.includeExactIpAddress
      ? activity.ipAddress ?? null
      : maskClientIpAddress(activity.ipAddress),
    lastActivityTime: serializeTimestamp(activity.lastActivityTime),
    loginTime: serializeTimestamp(activity.loginTime) ?? "",
    logoutTime: serializeTimestamp(activity.logoutTime),
  } as SerializedActivityListItem<T>;
}

function serializeActivitiesForResponse<T extends ActivityListItem>(
  activities: T[],
  access: ActivityResponseAccess = {},
) {
  return activities.map((activity) => serializeActivityForResponse(activity, access));
}

function maskSessionFingerprint(fingerprint: string | null | undefined): string | null {
  const normalized = String(fingerprint || "").trim();
  if (!normalized) {
    return null;
  }
  return `••••${normalized.slice(-6)}`;
}

type InvestigationRiskSignal = {
  code:
    | "active_ban"
    | "concurrent_session"
    | "forced_logout"
    | "idle_timeout"
    | "new_device"
    | "new_ip"
    | "no_elevated_risk"
    | "shared_device"
    | "shared_ip";
  description: string;
  label: string;
  severity: "attention" | "critical" | "info";
};

function resolveInvestigationRisk(params: {
  activeBan: boolean;
  activeConcurrentSessionCount: number;
  hasFingerprint: boolean;
  hasIpAddress: boolean;
  isActive: boolean;
  priorMatchingFingerprintCount: number;
  priorMatchingIpCount: number;
  priorSessionCount: number;
  sharedFingerprintAccountCount: number;
  sharedIpAccountCount: number;
  status: string;
}): {
  level: "attention" | "critical" | "normal";
  reasons: string[];
  signals: InvestigationRiskSignal[];
} {
  const signals: InvestigationRiskSignal[] = [];

  if (params.activeBan || params.status === "BANNED") {
    signals.push({
      code: "active_ban",
      description: "This session is linked to an active ban.",
      label: "Active ban",
      severity: "critical",
    });
  }
  if (params.status === "KICKED") {
    signals.push({
      code: "forced_logout",
      description: "An administrator forcibly ended this session.",
      label: "Forced logout",
      severity: "attention",
    });
  }
  if (params.status === "IDLE") {
    signals.push({
      code: "idle_timeout",
      description: "The session exceeded the configured idle threshold.",
      label: "Idle timeout",
      severity: "attention",
    });
  }

  if (
    params.hasIpAddress
    && params.priorSessionCount > 0
    && params.priorMatchingIpCount === 0
  ) {
    signals.push({
      code: "new_ip",
      description: "This account has no earlier recorded session from the same IP address.",
      label: "New IP address",
      severity: "attention",
    });
  }

  if (
    params.hasFingerprint
    && params.priorSessionCount > 0
    && params.priorMatchingFingerprintCount === 0
  ) {
    signals.push({
      code: "new_device",
      description: "This account has no earlier recorded session with the same device fingerprint.",
      label: "New device",
      severity: "attention",
    });
  }

  if (params.isActive && params.activeConcurrentSessionCount > 0) {
    signals.push({
      code: "concurrent_session",
      description: `${params.activeConcurrentSessionCount} other active session${params.activeConcurrentSessionCount === 1 ? "" : "s"} exist for this account.`,
      label: "Concurrent sessions",
      severity: "attention",
    });
  }

  if (params.sharedFingerprintAccountCount > 0) {
    signals.push({
      code: "shared_device",
      description: `The same device fingerprint appears on ${params.sharedFingerprintAccountCount} other account${params.sharedFingerprintAccountCount === 1 ? "" : "s"}.`,
      label: "Shared device",
      severity: "attention",
    });
  }

  if (params.sharedIpAccountCount > 0) {
    signals.push({
      code: "shared_ip",
      description: `The same IP address appears on ${params.sharedIpAccountCount} other account${params.sharedIpAccountCount === 1 ? "" : "s"}; shared networks can be legitimate.`,
      label: "Shared IP",
      severity: "info",
    });
  }

  if (signals.length === 0) {
    signals.push({
      code: "no_elevated_risk",
      description: "No elevated correlation or enforced security signal is recorded for this session.",
      label: "No elevated signal",
      severity: "info",
    });
  }

  const level = signals.some((signal) => signal.severity === "critical")
    ? "critical"
    : signals.some((signal) => signal.severity === "attention")
      ? "attention"
      : "normal";

  return {
    level,
    reasons: signals.map((signal) => signal.description),
    signals,
  };
}

function buildRelatedSessionMatches(
  activity: ActivityListItem,
  relatedActivity: ActivityListItem,
) {
  const matches: Array<"device_fingerprint" | "ip_address" | "same_account"> = [];
  if (activity.userId && relatedActivity.userId === activity.userId) {
    matches.push("same_account");
  }
  if (activity.ipAddress && relatedActivity.ipAddress === activity.ipAddress) {
    matches.push("ip_address");
  }
  if (activity.fingerprint && relatedActivity.fingerprint === activity.fingerprint) {
    matches.push("device_fingerprint");
  }
  return matches;
}

function getAuditEventLabel(action: string): string {
  switch (action) {
    case "BAN_USER":
      return "Session banned";
    case "KICK_USER":
      return "Forced logout";
    case "LOGIN_SUCCESS":
      return "Login accepted";
    case "LOGOUT":
      return "User logout";
    default:
      return action.replace(/_/g, " ").toLowerCase();
  }
}

function buildInvestigationTimeline(
  investigation: NonNullable<Awaited<ReturnType<ActivityStorage["getActivityInvestigation"]>>>,
) {
  const { activity, activeBan, auditEvents } = investigation;
  const events: Array<{
    id: string;
    kind: "activity" | "ban" | "login" | "logout" | "moderation";
    label: string;
    timestamp: string;
    actor: string | null;
  }> = [];
  const loginTime = serializeTimestamp(activity.loginTime);
  if (loginTime) {
    events.push({
      id: `${activity.id}:login`,
      kind: "login",
      label: "Session started",
      timestamp: loginTime,
      actor: activity.username,
    });
  }

  const lastActivityTime = serializeTimestamp(activity.lastActivityTime);
  if (lastActivityTime && lastActivityTime !== loginTime) {
    events.push({
      id: `${activity.id}:last-activity`,
      kind: "activity",
      label: "Last recorded activity",
      timestamp: lastActivityTime,
      actor: activity.username,
    });
  }

  const logoutTime = serializeTimestamp(activity.logoutTime);
  if (logoutTime) {
    events.push({
      id: `${activity.id}:logout`,
      kind: activity.logoutReason === "KICKED" || activity.logoutReason === "BANNED"
        ? "moderation"
        : "logout",
      label: activity.logoutReason === "KICKED"
        ? "Session forcibly ended"
        : activity.logoutReason === "BANNED"
          ? "Session ended by ban"
          : activity.logoutReason === "IDLE_TIMEOUT"
            ? "Session expired after inactivity"
            : "Session ended",
      timestamp: logoutTime,
      actor: null,
    });
  }

  if (activeBan) {
    events.push({
      id: `${activity.id}:ban`,
      kind: "ban",
      label: "Active session ban recorded",
      timestamp: activeBan.bannedAt.toISOString(),
      actor: null,
    });
  }

  for (const auditEvent of auditEvents) {
    events.push({
      id: `audit:${auditEvent.id}`,
      kind: "moderation",
      label: getAuditEventLabel(auditEvent.action),
      timestamp: auditEvent.timestamp.toISOString(),
      actor: auditEvent.performedBy,
    });
  }

  return events.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

function matchesActivityBaseFilters(
  activity: ActivityListItem,
  filters: ActivityFilters | undefined,
) {
  if (!filters) {
    return true;
  }

  if (filters.username && activity.username !== filters.username) {
    return false;
  }

  if (filters.ipAddress && activity.ipAddress !== filters.ipAddress) {
    return false;
  }

  if (filters.browser && activity.browser !== filters.browser) {
    return false;
  }

  const loginTimeMs = resolveActivityTimestampMs(activity.loginTime);

  if (filters.dateFrom && (!Number.isFinite(loginTimeMs) || loginTimeMs < filters.dateFrom.getTime())) {
    return false;
  }

  if (filters.dateTo) {
    const endOfDay = new Date(filters.dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    if (!Number.isFinite(loginTimeMs) || loginTimeMs > endOfDay.getTime()) {
      return false;
    }
  }

  return true;
}

function sortActivitiesByLoginTimeDesc<T extends ActivityListItem>(activities: T[]) {
  return [...activities].sort((left, right) => {
    const leftMs = resolveActivityTimestampMs(left.loginTime);
    const rightMs = resolveActivityTimestampMs(right.loginTime);
    if (!Number.isFinite(leftMs) && !Number.isFinite(rightMs)) {
      return 0;
    }
    if (!Number.isFinite(leftMs)) {
      return 1;
    }
    if (!Number.isFinite(rightMs)) {
      return -1;
    }
    return rightMs - leftMs;
  });
}

function buildActivityBatchAuditDetails(params: {
  requestedCount: number;
  deletedCount: number;
  notFoundCount: number;
  protectedCount: number;
  durationMs: number;
}) {
  return JSON.stringify({
    requestedCount: params.requestedCount,
    deletedCount: params.deletedCount,
    notFoundCount: params.notFoundCount,
    protectedCount: params.protectedCount,
    durationMs: params.durationMs,
  });
}

function buildActivityBatchFailureAuditDetails(params: {
  requestedCount: number;
  durationMs: number;
  errorType: string;
}) {
  return JSON.stringify({
    requestedCount: params.requestedCount,
    durationMs: params.durationMs,
    errorType: params.errorType,
  });
}

function buildActivityRetentionCleanupAuditDetails(params: {
  autoCleanupEnabled: boolean;
  deletedCount: number;
  durationMs: number;
  limit: number;
  lockAcquired: boolean;
  protectedActiveBanCount: number;
  securityCutoffIso: string;
  securityDeletedCount: number;
  securityRetentionDays: number;
  source: ActivityRetentionCleanupSource;
  standardCutoffIso: string;
  standardDeletedCount: number;
  standardRetentionDays: number;
}) {
  return JSON.stringify({
    autoCleanupEnabled: params.autoCleanupEnabled,
    deletedCount: params.deletedCount,
    durationMs: params.durationMs,
    limit: params.limit,
    lockAcquired: params.lockAcquired,
    protectedActiveBanCount: params.protectedActiveBanCount,
    securityCutoffIso: params.securityCutoffIso,
    securityDeletedCount: params.securityDeletedCount,
    securityRetentionDays: params.securityRetentionDays,
    source: params.source,
    standardCutoffIso: params.standardCutoffIso,
    standardDeletedCount: params.standardDeletedCount,
    standardRetentionDays: params.standardRetentionDays,
  });
}

function buildActivityRetentionCleanupFailureAuditDetails(params: {
  durationMs: number;
  errorType: string;
  limit: number;
  securityCutoffIso: string;
  securityRetentionDays: number;
  source: ActivityRetentionCleanupSource;
  standardCutoffIso: string;
  standardRetentionDays: number;
}) {
  return JSON.stringify({
    durationMs: params.durationMs,
    errorType: params.errorType,
    limit: params.limit,
    securityCutoffIso: params.securityCutoffIso,
    securityRetentionDays: params.securityRetentionDays,
    source: params.source,
    standardCutoffIso: params.standardCutoffIso,
    standardRetentionDays: params.standardRetentionDays,
  });
}

async function createBatchFailureAuditLog(params: {
  storage: ActivityStorage;
  performedBy: string;
  requestedCount: number;
  startedAt: number;
  error: unknown;
}) {
  try {
    await params.storage.createAuditLog({
      action: "BULK_DELETE_ACTIVITY_LOGS_FAILED",
      performedBy: params.performedBy,
      targetResource: "activity_logs",
      details: buildActivityBatchFailureAuditDetails({
        requestedCount: params.requestedCount,
        durationMs: Date.now() - params.startedAt,
        errorType: params.error instanceof Error ? params.error.name : "UnknownError",
      }),
    });
  } catch (auditError) {
    logger.error("Activity batch operation failure audit failed", {
      event: "activity_batch_failure_audit_failed",
      action: "BULK_DELETE_ACTIVITY_LOGS_FAILED",
      errorType: auditError instanceof Error ? auditError.name : "UnknownError",
    });
  }
}

async function createRetentionCleanupFailureAuditLog(params: {
  error: unknown;
  limit: number;
  performedBy: string;
  securityCutoff: Date;
  securityRetentionDays: number;
  source: ActivityRetentionCleanupSource;
  startedAt: number;
  standardCutoff: Date;
  standardRetentionDays: number;
  storage: ActivityStorage;
}) {
  try {
    await params.storage.createAuditLog({
      action: "DELETE_OLD_ACTIVITY_LOGS_FAILED",
      performedBy: params.performedBy,
      targetResource: "activity_logs",
      details: buildActivityRetentionCleanupFailureAuditDetails({
        durationMs: Date.now() - params.startedAt,
        errorType: params.error instanceof Error ? params.error.name : "UnknownError",
        limit: params.limit,
        securityCutoffIso: params.securityCutoff.toISOString(),
        securityRetentionDays: params.securityRetentionDays,
        source: params.source,
        standardCutoffIso: params.standardCutoff.toISOString(),
        standardRetentionDays: params.standardRetentionDays,
      }),
    });
  } catch (auditError) {
    logger.error("Activity retention cleanup failure audit failed", {
      event: "activity_retention_cleanup_failure_audit_failed",
      action: "DELETE_OLD_ACTIVITY_LOGS_FAILED",
      errorType: auditError instanceof Error ? auditError.name : "UnknownError",
    });
  }
}

async function flushActivitySessionBeforeLogout(
  storage: ActivityStorage,
  activityId: string,
): Promise<void> {
  try {
    await storage.updateActivity(activityId, {
      lastActivityTime: new Date(),
    });
  } catch (error) {
    logger.warn("Activity session flush failed before logout; continuing logout", {
      event: "activity_logout_flush_failed",
      activityIdHash: hashActivityIdForLogoutFlush(activityId),
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

function reconcileRequestingActivityPresence<T extends ActivityListItem>(
  activities: T[],
  requestingActivity: T | undefined,
  filters?: ActivityFilters,
) {
  const requestingActivityId = String(requestingActivity?.id || "").trim();
  if (!requestingActivityId) {
    return activities;
  }

  if (!requestingActivity) {
    return activities;
  }

  if (requestingActivity?.isActive === false || requestingActivity?.logoutTime) {
    return activities.filter((activity) => String(activity.id || "").trim() !== requestingActivityId);
  }

  const onlineAllowed = !filters?.status?.length || filters.status.includes("ONLINE");
  const baseFiltersMatched = matchesActivityBaseFilters(requestingActivity, filters);
  const nextActivities = activities.filter((activity) => String(activity.id || "").trim() !== requestingActivityId);

  if (!onlineAllowed || !baseFiltersMatched) {
    return nextActivities;
  }

  const now = new Date();
  const nextRequestingActivity = {
    ...requestingActivity,
    lastActivityTime: now,
    status: "ONLINE",
  } as T;

  return sortActivitiesByLoginTimeDesc([...nextActivities, nextRequestingActivity]);
}

export function createActivitySessionOperations(
  storage: ActivityStorage,
  closeSocket: CloseActivitySocket,
) {
  return {
    async logout(activityId: string, username: string) {
      const activity = await storage.getActivityById(activityId);
      if (!activity || activity.isActive === false) {
        return;
      }

      await flushActivitySessionBeforeLogout(storage, activityId);

      await storage.updateActivity(activityId, {
        isActive: false,
        logoutTime: new Date(),
        logoutReason: "USER_LOGOUT",
      });

      // A manual logout already has an in-flight HTTP response that will
      // transition the current tab; closing the socket is enough here and avoids
      // racing a same-tab websocket logout event against cookie clearing.
      await closeSocket(activityId);

      await storage.createAuditLog({
        action: "LOGOUT",
        performedBy: username,
        targetResource: `activity:${activityId}`,
        details: JSON.stringify({ activityId, outcome: "logout" }),
      });
    },

    async getAllActivities(
      currentActivityId?: string,
      access: ActivityResponseAccess = {},
    ) {
      const activities = await storage.getAllActivities();
      if (!currentActivityId) {
        return serializeActivitiesForResponse(activities as ActivityListItem[], access);
      }

      const requestingActivity = await storage.getActivityById(currentActivityId) as ActivityListItem | undefined;
      return serializeActivitiesForResponse(
        reconcileRequestingActivityPresence(
          activities as ActivityListItem[],
          requestingActivity,
        ),
        access,
      );
    },

    async getFilteredActivities(
      filters: ActivityFilters,
      currentActivityId?: string,
      access: ActivityResponseAccess = {},
    ) {
      const activities = await storage.getFilteredActivities(filters);
      if (!currentActivityId) {
        return serializeActivitiesForResponse(activities as ActivityListItem[], access);
      }

      const requestingActivity = await storage.getActivityById(currentActivityId) as ActivityListItem | undefined;
      return serializeActivitiesForResponse(
        reconcileRequestingActivityPresence(
          activities as ActivityListItem[],
          requestingActivity,
          filters,
        ),
        access,
      );
    },

    async getActivityInvestigation(
      activityId: string,
      relatedPage: ActivityInvestigationRelatedPageOptions = {
        page: 1,
        pageSize: 5,
      },
    ) {
      const investigation = await storage.getActivityInvestigation(activityId, relatedPage);
      if (!investigation) {
        return undefined;
      }

      const {
        activity,
        activeBan,
        auditEvents,
        history,
        relatedSessions,
      } = investigation;
      const risk = resolveInvestigationRisk({
        activeBan: Boolean(activeBan),
        activeConcurrentSessionCount: history.activeConcurrentSessionCount,
        hasFingerprint: Boolean(String(activity.fingerprint || "").trim()),
        hasIpAddress: Boolean(String(activity.ipAddress || "").trim()),
        isActive: activity.isActive !== false,
        priorMatchingFingerprintCount: history.priorMatchingFingerprintCount,
        priorMatchingIpCount: history.priorMatchingIpCount,
        priorSessionCount: history.priorSessionCount,
        sharedFingerprintAccountCount: history.sharedFingerprintAccountCount,
        sharedIpAccountCount: history.sharedIpAccountCount,
        status: activity.status,
      });
      const loginTimeMs = resolveActivityTimestampMs(activity.loginTime);
      const endTimeMs = resolveActivityTimestampMs(
        activity.isActive !== false
          ? new Date()
          : activity.logoutTime ?? activity.lastActivityTime,
      );

      return {
        session: {
          id: activity.id,
          username: activity.username,
          role: activity.role,
          status: activity.status,
          isActive: activity.isActive !== false,
          loginTime: serializeTimestamp(activity.loginTime),
          logoutTime: serializeTimestamp(activity.logoutTime),
          lastActivityTime: serializeTimestamp(activity.lastActivityTime),
          logoutReason: activity.logoutReason ?? null,
          durationMs:
            Number.isFinite(loginTimeMs) && Number.isFinite(endTimeMs)
              ? Math.max(0, endTimeMs - loginTimeMs)
              : null,
          device: {
            browser: activity.browser ?? null,
            deviceType: activity.deviceType ?? null,
            ipAddress: activity.ipAddress ?? null,
            pcName: activity.pcName ?? null,
            platform: activity.platform ?? null,
            fingerprintHint: maskSessionFingerprint(activity.fingerprint),
          },
        },
        security: {
          activeBan: activeBan
            ? {
                banId: activeBan.banId,
                bannedAt: activeBan.bannedAt.toISOString(),
              }
            : null,
          riskLevel: risk.level,
          reasons: risk.reasons,
          signals: risk.signals,
        },
        relatedSessions: relatedSessions.map((relatedActivity) => ({
          id: relatedActivity.id,
          username: relatedActivity.username,
          role: relatedActivity.role,
          status: relatedActivity.status,
          isActive: relatedActivity.isActive !== false,
          loginTime: serializeTimestamp(relatedActivity.loginTime),
          logoutTime: serializeTimestamp(relatedActivity.logoutTime),
          device: {
            browser: relatedActivity.browser ?? null,
            deviceType: relatedActivity.deviceType ?? null,
            fingerprintHint: maskSessionFingerprint(relatedActivity.fingerprint),
            ipAddress: relatedActivity.ipAddress ?? null,
            platform: relatedActivity.platform ?? null,
          },
          matches: buildRelatedSessionMatches(activity, relatedActivity),
        })),
        relatedSessionsPagination: {
          mode: "offset" as const,
          page: investigation.relatedSessionsPagination.page,
          pageSize: investigation.relatedSessionsPagination.pageSize,
          limit: investigation.relatedSessionsPagination.pageSize,
          offset:
            (investigation.relatedSessionsPagination.page - 1)
            * investigation.relatedSessionsPagination.pageSize,
          total: investigation.relatedSessionsPagination.total,
          totalPages: investigation.relatedSessionsPagination.totalPages,
          hasNextPage:
            investigation.relatedSessionsPagination.page
            < investigation.relatedSessionsPagination.totalPages,
          hasPreviousPage: investigation.relatedSessionsPagination.page > 1,
        },
        timeline: buildInvestigationTimeline(investigation),
        auditEvents: auditEvents.map((event) => ({
          id: event.id,
          action: event.action,
          performedBy: event.performedBy,
          requestId: event.requestId,
          timestamp: event.timestamp.toISOString(),
        })),
      };
    },

    async listActivityPage(
      options: ActivityPageOptions,
      filters: ActivityFilters,
      currentActivityId?: string,
      access: ActivityResponseAccess = {},
    ) {
      const result = await storage.listActivityPage({
        ...options,
        currentActivityId,
        filters,
      });
      const now = new Date();
      const activities = result.activities.map((activity) => {
        if (
          currentActivityId
          && activity.id === currentActivityId
          && activity.isActive !== false
          && !activity.logoutTime
        ) {
          return {
            ...activity,
            lastActivityTime: now,
            status: "ONLINE",
          };
        }
        return activity;
      });

      return {
        ...result,
        activities: serializeActivitiesForResponse(
          activities as ActivityListItem[],
          access,
        ),
      };
    },

    async deleteActivityLog(activityId: string, performedBy: string) {
      const activity = await storage.getActivityById(activityId);
      const deleted = await storage.deleteActivity(activityId);
      if (!deleted) {
        return { status: "protected" as const };
      }
      await closeSocket(activityId);
      await storage.createAuditLog({
        action: "DELETE_ACTIVITY_LOG",
        performedBy,
        targetUser: activity?.username ?? null,
        targetResource: `activity:${activityId}`,
        details: "Activity log deleted by an administrator",
      });
      return { status: "deleted" as const };
    },

    async bulkDeleteActivityLogs(activityIds: string[], performedBy: string) {
      const startedAt = Date.now();
      let deletedCount = 0;
      const notFoundIds: string[] = [];
      const protectedIds: string[] = [];

      try {
        for (const activityId of activityIds) {
          const activity = await storage.getActivityById(activityId);
          if (!activity) {
            notFoundIds.push(activityId);
            continue;
          }

          const deleted = await storage.deleteActivity(activityId);
          if (!deleted) {
            protectedIds.push(activityId);
            continue;
          }
          await closeSocket(activityId);
          deletedCount += 1;
        }
      } catch (error) {
        // AUDIT2-FIX [M2]: failed state-changing batch operations leave an audit trail.
        await createBatchFailureAuditLog({
          storage,
          performedBy,
          requestedCount: activityIds.length,
          startedAt,
          error,
        });
        throw error;
      }

      // AUDIT2-FIX [M2]: successful state-changing batch operations leave an audit trail.
      await storage.createAuditLog({
        action: "BULK_DELETE_ACTIVITY_LOGS",
        performedBy,
        targetResource: "activity_logs",
        details: buildActivityBatchAuditDetails({
          requestedCount: activityIds.length,
          deletedCount,
          notFoundCount: notFoundIds.length,
          protectedCount: protectedIds.length,
          durationMs: Date.now() - startedAt,
        }),
      });

      return {
        deletedCount,
        notFoundIds,
        protectedIds,
      };
    },

    async getActivityRetentionStatus(now: Date = new Date()): Promise<ActivityRetentionStatus> {
      const policy = await storage.getActivityRetentionPolicy();
      const standardCutoff = new Date(now.getTime() - policy.standardRetentionDays * DAY_MS);
      const securityCutoff = new Date(now.getTime() - policy.securityRetentionDays * DAY_MS);
      const preview = await storage.getActivityRetentionPreview({
        securityCutoff,
        standardCutoff,
      });

      return {
        policy,
        preview,
        securityCutoff: securityCutoff.toISOString(),
        standardCutoff: standardCutoff.toISOString(),
      };
    },

    async cleanupEndedActivityLogs(params: {
      limit?: number | undefined;
      now?: Date | undefined;
      olderThanDays?: number | undefined;
      performedBy: string;
      securityOlderThanDays?: number | undefined;
      source: ActivityRetentionCleanupSource;
    }) {
      const startedAt = Date.now();
      const policy = await storage.getActivityRetentionPolicy();
      const now = params.now ?? new Date();
      const standardRetentionDays = params.olderThanDays ?? policy.standardRetentionDays;
      const securityRetentionDays = Math.max(
        standardRetentionDays,
        params.securityOlderThanDays ?? policy.securityRetentionDays,
      );
      const limit = params.limit ?? policy.batchSize;
      const standardCutoff = new Date(now.getTime() - standardRetentionDays * DAY_MS);
      const securityCutoff = new Date(now.getTime() - securityRetentionDays * DAY_MS);

      if (params.source === "automatic" && !policy.autoCleanupEnabled) {
        return {
          cutoff: standardCutoff.toISOString(),
          deletedCount: 0,
          limit,
          lockAcquired: false,
          protectedActiveBanCount: 0,
          reason: "disabled" as const,
          securityCutoff: securityCutoff.toISOString(),
          securityDeletedCount: 0,
          securityRetentionDays,
          skipped: true,
          standardDeletedCount: 0,
          standardRetentionDays,
        };
      }

      try {
        const preview = await storage.getActivityRetentionPreview({
          securityCutoff,
          standardCutoff,
        });
        const cleanup = await storage.cleanupActivityRetention({
          limit,
          securityCutoff,
          standardCutoff,
        });

        await Promise.all(cleanup.deletedIds.map((activityId) => closeSocket(activityId)));

        await storage.createAuditLog({
          action: "DELETE_OLD_ACTIVITY_LOGS",
          performedBy: params.performedBy,
          targetResource: "activity_logs",
          details: buildActivityRetentionCleanupAuditDetails({
            autoCleanupEnabled: policy.autoCleanupEnabled,
            deletedCount: cleanup.deletedIds.length,
            durationMs: Date.now() - startedAt,
            limit,
            lockAcquired: cleanup.lockAcquired,
            protectedActiveBanCount: preview.protectedActiveBanCount,
            securityCutoffIso: securityCutoff.toISOString(),
            securityDeletedCount: cleanup.securityDeletedCount,
            securityRetentionDays,
            source: params.source,
            standardCutoffIso: standardCutoff.toISOString(),
            standardDeletedCount: cleanup.standardDeletedCount,
            standardRetentionDays,
          }),
        });

        return {
          cutoff: standardCutoff.toISOString(),
          deletedCount: cleanup.deletedIds.length,
          limit,
          lockAcquired: cleanup.lockAcquired,
          protectedActiveBanCount: preview.protectedActiveBanCount,
          reason: cleanup.lockAcquired ? null : "lock_unavailable" as const,
          securityCutoff: securityCutoff.toISOString(),
          securityDeletedCount: cleanup.securityDeletedCount,
          securityRetentionDays,
          skipped: !cleanup.lockAcquired,
          standardDeletedCount: cleanup.standardDeletedCount,
          standardRetentionDays,
        };
      } catch (error) {
        await createRetentionCleanupFailureAuditLog({
          error,
          limit,
          performedBy: params.performedBy,
          securityCutoff,
          securityRetentionDays,
          source: params.source,
          startedAt,
          standardCutoff,
          standardRetentionDays,
          storage,
        });
        throw error;
      }
    },

    async heartbeat(activityId: string) {
      const now = new Date();
      await storage.updateActivity(activityId, {
        lastActivityTime: now,
        isActive: true,
      });

      return {
        ok: true,
        status: "ONLINE" as const,
        lastActivityTime: now.toISOString(),
      };
    },

    async getActiveActivities() {
      return storage.getActiveActivities();
    },
  };
}
