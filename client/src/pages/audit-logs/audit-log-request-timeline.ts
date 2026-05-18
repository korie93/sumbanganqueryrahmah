import { buildAuditLogSummary } from "@/pages/audit-logs/audit-log-classification";
import type { AuditLogRecord } from "@/pages/audit-logs/types";
import { getAuditActionInfo } from "@/pages/audit-logs/utils";

export interface AuditRequestTimelineEntry {
  id: string;
  actionLabel: string;
  actor: string;
  categoryLabel: string;
  riskLabel: string;
  targetUser: string;
  timestamp: string;
}

function getTimestampMs(timestamp: string) {
  const parsed = new Date(timestamp).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildAuditRequestTimeline(
  logs: AuditLogRecord[],
  requestId: string | null,
): AuditRequestTimelineEntry[] {
  const normalizedRequestId = requestId?.trim();
  if (!normalizedRequestId) {
    return [];
  }

  return logs
    .filter((log) => log.requestId === normalizedRequestId)
    .slice()
    .sort((left, right) => getTimestampMs(left.timestamp) - getTimestampMs(right.timestamp))
    .map((log) => {
      const summary = buildAuditLogSummary(log);
      return {
        id: log.id,
        actionLabel: getAuditActionInfo(log.action).label,
        actor: log.performedBy,
        categoryLabel: summary.category.label,
        riskLabel: summary.risk.label,
        targetUser: log.targetUser || "-",
        timestamp: log.timestamp,
      };
    });
}

