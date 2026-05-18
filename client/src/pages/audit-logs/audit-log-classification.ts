import type { AuditLogRecord } from "@/pages/audit-logs/types";

export type AuditRiskLevel = "low" | "medium" | "high" | "critical";

export type AuditCategory =
  | "Audit"
  | "Backup"
  | "Collection"
  | "Import/Export"
  | "Security"
  | "Settings"
  | "System"
  | "User Management";

export interface AuditRiskInfo {
  level: AuditRiskLevel;
  label: "Low" | "Medium" | "High" | "Critical";
  description: string;
}

export interface AuditCategoryInfo {
  label: AuditCategory;
  description: string;
}

export interface AuditChangeSummary {
  field: string;
  before: string;
  after: string;
}

type JsonRecord = Record<string, unknown>;

const CRITICAL_ACTION_PATTERNS = [
  "CRITICAL",
  "RESTORE_BACKUP",
  "DELETE_BACKUP",
  "CLEANUP_AUDIT",
  "ROLE",
  "PERMISSION",
];

const HIGH_ACTION_PATTERNS = [
  "BAN",
  "KICK",
  "BLOCKED",
  "FAILED",
  "DELETE",
  "PASSWORD",
  "LOCK",
  "REVOKE",
  "RESET",
];

const MEDIUM_ACTION_PATTERNS = [
  "CREATE_BACKUP",
  "IMPORT",
  "EXPORT",
  "UPDATE",
  "SETTING",
  "COLLECTION",
  "NICKNAME",
];

function normalizedAction(action: string) {
  return action.trim().toUpperCase();
}

function actionIncludes(action: string, patterns: readonly string[]) {
  return patterns.some((pattern) => action.includes(pattern));
}

export function getAuditRiskInfo(action: string): AuditRiskInfo {
  const normalized = normalizedAction(action);

  if (actionIncludes(normalized, CRITICAL_ACTION_PATTERNS)) {
    return {
      level: "critical",
      label: "Critical",
      description: "High-impact administrative or recovery action. Review carefully.",
    };
  }

  if (actionIncludes(normalized, HIGH_ACTION_PATTERNS)) {
    return {
      level: "high",
      label: "High",
      description: "Security-sensitive or destructive action that may need follow-up.",
    };
  }

  if (actionIncludes(normalized, MEDIUM_ACTION_PATTERNS)) {
    return {
      level: "medium",
      label: "Medium",
      description: "Operational change that is useful for routine audit review.",
    };
  }

  return {
    level: "low",
    label: "Low",
    description: "Routine activity with low operational risk.",
  };
}

export function getAuditCategoryInfo(action: string): AuditCategoryInfo {
  const normalized = normalizedAction(action);

  if (normalized.includes("BACKUP") || normalized.includes("RESTORE")) {
    return { label: "Backup", description: "Backup, restore, or data recovery activity." };
  }
  if (normalized.includes("COLLECTION") || normalized.includes("RECORD")) {
    return { label: "Collection", description: "Collection record or collection setting activity." };
  }
  if (normalized.includes("IMPORT") || normalized.includes("EXPORT") || normalized.includes("DOWNLOAD")) {
    return { label: "Import/Export", description: "Data movement, import, export, or download activity." };
  }
  if (
    normalized.includes("LOGIN")
    || normalized.includes("LOGOUT")
    || normalized.includes("PASSWORD")
    || normalized.includes("BAN")
    || normalized.includes("KICK")
    || normalized.includes("SESSION")
  ) {
    return { label: "Security", description: "Authentication, session, or security-control activity." };
  }
  if (normalized.includes("SETTING") || normalized.includes("MAINTENANCE")) {
    return { label: "Settings", description: "System configuration or maintenance setting activity." };
  }
  if (normalized.includes("USER") || normalized.includes("ROLE") || normalized.includes("ACCOUNT")) {
    return { label: "User Management", description: "Account, role, or user administration activity." };
  }
  if (normalized.includes("AUDIT")) {
    return { label: "Audit", description: "Audit log review, retention, or cleanup activity." };
  }

  return { label: "System", description: "General system activity." };
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseDetailsJson(details: string): JsonRecord | null {
  const trimmed = details.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isJsonRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function formatChangeValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function formatChangeFieldName(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^./, (first) => first.toUpperCase());
}

function collectObjectDiffs(before: JsonRecord, after: JsonRecord) {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  return keys
    .filter((key) => formatChangeValue(before[key]) !== formatChangeValue(after[key]))
    .map((key) => ({
      field: formatChangeFieldName(key),
      before: formatChangeValue(before[key]),
      after: formatChangeValue(after[key]),
    }));
}

export function getAuditChangeSummary(details: string): AuditChangeSummary[] {
  const parsed = parseDetailsJson(details);
  if (!parsed) return [];

  if (isJsonRecord(parsed.before) && isJsonRecord(parsed.after)) {
    return collectObjectDiffs(parsed.before, parsed.after);
  }

  const summaries: AuditChangeSummary[] = [];
  for (const key of Object.keys(parsed)) {
    if (!key.startsWith("old") || key.length <= 3) continue;
    const suffix = key.slice(3);
    const newKey = `new${suffix}`;
    if (!(newKey in parsed)) continue;
    summaries.push({
      field: formatChangeFieldName(suffix),
      before: formatChangeValue(parsed[key]),
      after: formatChangeValue(parsed[newKey]),
    });
  }

  return summaries;
}

export function buildAuditLogSummary(log: AuditLogRecord) {
  return {
    category: getAuditCategoryInfo(log.action),
    risk: getAuditRiskInfo(log.action),
    changes: getAuditChangeSummary(log.details ?? ""),
  };
}
