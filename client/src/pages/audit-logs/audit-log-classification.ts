import type { AuditLogRecord } from "@/pages/audit-logs/types";
import { getAuditCategoryInfo, getAuditRiskInfo } from "@shared/audit-log-classification";

export {
  getAuditCategoryInfo,
  getAuditRiskInfo,
  type AuditCategory,
  type AuditCategoryInfo,
  type AuditRiskInfo,
  type AuditRiskLevel,
} from "@shared/audit-log-classification";

export interface AuditChangeSummary {
  field: string;
  before: string;
  after: string;
}

type JsonRecord = Record<string, unknown>;

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
