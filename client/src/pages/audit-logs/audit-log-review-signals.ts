import { getAuditRiskInfo } from "@/pages/audit-logs/audit-log-classification";
import type { AuditLogRecord } from "@/pages/audit-logs/types";

export type AuditReviewSignalLevel = "critical" | "attention" | "watch";

export interface AuditReviewSignal {
  code: string;
  label: string;
  description: string;
  level: AuditReviewSignalLevel;
}

const destructiveActions = [
  "CLEANUP_AUDIT",
  "DELETE",
  "PURGE",
  "RESTORE_BACKUP",
] as const;

const authConcernActions = [
  "BAN",
  "BLOCKED",
  "FAILED",
  "KICK",
  "LOCK",
  "REVOKE",
] as const;

const permissionActions = [
  "ACCOUNT",
  "PERMISSION",
  "ROLE",
  "USER",
] as const;

function normalizedAuditText(value: string | null | undefined) {
  return String(value || "").trim().toUpperCase();
}

function textIncludesAny(value: string, patterns: readonly string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

function pushUniqueSignal(signals: AuditReviewSignal[], signal: AuditReviewSignal) {
  if (!signals.some((item) => item.code === signal.code)) {
    signals.push(signal);
  }
}

export function getAuditReviewSignals(log: AuditLogRecord): AuditReviewSignal[] {
  const action = normalizedAuditText(log.action);
  const details = normalizedAuditText(log.details);
  const risk = getAuditRiskInfo(log.action);
  const signals: AuditReviewSignal[] = [];

  if (risk.level === "critical") {
    pushUniqueSignal(signals, {
      code: "critical-risk",
      label: "Needs immediate review",
      description: "This is a high-impact administrative or recovery action.",
      level: "critical",
    });
  } else if (risk.level === "high") {
    pushUniqueSignal(signals, {
      code: "high-risk",
      label: "Needs review",
      description: "This security-sensitive action should be checked during audit review.",
      level: "attention",
    });
  }

  if (textIncludesAny(action, authConcernActions)) {
    pushUniqueSignal(signals, {
      code: "auth-concern",
      label: "Security activity",
      description: "Authentication, session, or access-control activity was detected.",
      level: "attention",
    });
  }

  if (textIncludesAny(action, destructiveActions)) {
    pushUniqueSignal(signals, {
      code: "destructive-action",
      label: "Destructive action",
      description: "This action can remove, overwrite, or restore operational data.",
      level: "critical",
    });
  }

  if (textIncludesAny(action, permissionActions)) {
    pushUniqueSignal(signals, {
      code: "permission-change",
      label: "Access change",
      description: "Account, role, or permission-related activity was detected.",
      level: "attention",
    });
  }

  if (details.includes("ERROR") || details.includes("EXCEPTION") || details.includes("FAILED")) {
    pushUniqueSignal(signals, {
      code: "failure-detail",
      label: "Failure detail",
      description: "The audit details mention an error or failed operation.",
      level: "watch",
    });
  }

  return signals;
}
