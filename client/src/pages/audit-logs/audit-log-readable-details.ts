import { formatIsoDateToDDMMYYYY, formatOperationalDateTime } from "@/lib/date-format";
import {
  auditDetailGroupLabelMap,
  auditDetailLabelMap,
  priorityDetailKeys,
} from "@/pages/audit-logs/audit-log-readable-detail-labels";

export interface AuditReadableDetailItem {
  key: string;
  label: string;
  value: string;
}

export interface AuditReadableDetails {
  isJson: boolean;
  items: AuditReadableDetailItem[];
  text: string;
}

type JsonRecord = Record<string, unknown>;

const numberFormatter = new Intl.NumberFormat("en-MY");
const currencyFormatter = new Intl.NumberFormat("en-MY", {
  currency: "MYR",
  minimumFractionDigits: 2,
  style: "currency",
});

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseAuditDetailsJson(details: string): JsonRecord | null {
  const trimmed = details.trim();
  if (!trimmed || !trimmed.startsWith("{")) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isJsonRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function humanizeAuditDetailKey(key: string) {
  return auditDetailLabelMap[key] ?? key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^./, (first) => first.toUpperCase());
}

function getAuditDetailGroupLabel(groupKey: string) {
  return auditDetailGroupLabelMap[groupKey] ?? humanizeAuditDetailKey(groupKey);
}

function buildNestedAuditDetailLabel(path: string[]) {
  const key = path[path.length - 1] ?? "";
  const parentKey = path[path.length - 2] ?? "";
  if (path[0] === "changes" && key === "from") {
    return [...path.slice(0, -1).map(getAuditDetailGroupLabel).filter(Boolean), "Sebelum"].join(" - ");
  }
  if (path[0] === "changes" && key === "to") {
    return [...path.slice(0, -1).map(getAuditDetailGroupLabel).filter(Boolean), "Selepas"].join(" - ");
  }
  if ((parentKey === "before" || parentKey === "after") && key === "from") {
    return [...path.slice(0, -1).map(getAuditDetailGroupLabel).filter(Boolean), "Tarikh mula"].join(" - ");
  }
  const parentPath = path.slice(0, -1)
    .map(getAuditDetailGroupLabel)
    .filter(Boolean);
  const label = humanizeAuditDetailKey(key);
  return [...parentPath, label].join(" - ");
}

function normalizeRoleValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "superuser") return "Superuser";
  if (normalized === "admin") return "Admin";
  if (normalized === "user") return "User";
  return value;
}

function humanizeEnumValue(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shouldFormatAsDate(key: string, value: string) {
  return (
    ["date", "from", "to", "paymentDate", "calendarDate"].includes(key)
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
  );
}

function shouldFormatAsDateTime(key: string, value: string) {
  return (
    (
      /(?:At|Timestamp|Time)$/i.test(key)
      || ["timestamp", "expires_at", "enabled_at"].includes(key)
    )
    && /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2})/.test(value)
  );
}

function shouldHumanizeEnumKey(key: string) {
  return [
    "event",
    "event_type",
    "failure_reason",
    "reset_type",
    "delivery",
    "delivery_mode",
    "activeReceiptSource",
    "beforeSource",
    "afterSource",
  ].includes(key);
}

function shouldFormatAsCurrency(key: string) {
  return ["amount"].includes(key);
}

function formatDurationMs(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (value < 1000) return `${numberFormatter.format(Math.max(0, Math.round(value)))} ms`;
  return `${numberFormatter.format(Math.round(value / 100) / 10)}s`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return "-";
  if (value < 1024) return `${numberFormatter.format(Math.round(value))} B`;
  if (value < 1024 * 1024) return `${numberFormatter.format(Math.round(value / 102.4) / 10)} KB`;
  return `${numberFormatter.format(Math.round(value / (1024 * 102.4)) / 10)} MB`;
}

function shouldSkipTechnicalEmptyValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return true;
  }
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  return false;
}

function shouldFormatAsDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatAuditDetailValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "Ya" : "Tidak";
  }

  if (typeof value === "number") {
    if (key === "durationMs") return formatDurationMs(value);
    if (key === "payloadBytes") return formatBytes(value);
    if (shouldFormatAsCurrency(key)) return currencyFormatter.format(value);
    return Number.isFinite(value) ? numberFormatter.format(value) : "-";
  }

  if (typeof value === "string") {
    if (key === "role") return normalizeRoleValue(value);
    if (shouldHumanizeEnumKey(key)) return humanizeEnumValue(value);
    if (shouldFormatAsDate(key, value)) return formatIsoDateToDDMMYYYY(value, value);
    if (shouldFormatAsDateTime(key, value)) {
      return formatOperationalDateTime(value, { fallback: value });
    }
    if (shouldFormatAsDateOnly(value)) return formatIsoDateToDDMMYYYY(value, value);
    return value;
  }

  if (Array.isArray(value)) {
    return value.length > 0
      ? value.map((item) => formatAuditDetailValue(key, item)).join(", ")
      : "-";
  }

  return JSON.stringify(value);
}

function getPriorityIndex(keyPath: string) {
  const parts = keyPath.split(".");
  const leafKey = parts[parts.length - 1] ?? keyPath;
  const directIndex = priorityDetailKeys.indexOf(keyPath);
  if (directIndex !== -1) return directIndex;
  const leafIndex = priorityDetailKeys.indexOf(leafKey);
  return leafIndex;
}

function sortAuditDetailItems(items: AuditReadableDetailItem[]) {
  return [...items].sort((leftItem, rightItem) => {
    const left = leftItem.key;
    const right = rightItem.key;
    const leftIndex = getPriorityIndex(left);
    const rightIndex = getPriorityIndex(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    }
    return left.localeCompare(right);
  });
}

function collectReadableAuditDetailItems(
  record: JsonRecord,
  parentPath: string[] = [],
  depth = 0,
): AuditReadableDetailItem[] {
  const items: AuditReadableDetailItem[] = [];

  for (const key of Object.keys(record)) {
    const value = record[key];
    if (shouldSkipTechnicalEmptyValue(value)) {
      continue;
    }

    const path = [...parentPath, key];
    if (isJsonRecord(value) && depth < 3) {
      items.push(...collectReadableAuditDetailItems(value, path, depth + 1));
      continue;
    }

    items.push({
      key: path.join("."),
      label: buildNestedAuditDetailLabel(path),
      value: formatAuditDetailValue(key, value),
    });
  }

  return items;
}

function normalizeText(details: string) {
  return details.replace(/\s+/g, " ").trim();
}

export function buildReadableAuditDetails(details: string): AuditReadableDetails {
  const normalized = normalizeText(details);
  if (!normalized) {
    return { isJson: false, items: [], text: "" };
  }

  const parsed = parseAuditDetailsJson(details);
  if (!parsed) {
    return { isJson: false, items: [], text: normalized };
  }

  const items = sortAuditDetailItems(collectReadableAuditDetailItems(parsed))
    .filter((item) => item.value !== "-");

  return {
    isJson: true,
    items,
    text: items.map((item) => `${item.label}: ${item.value}`).join("; "),
  };
}

export function getReadableAuditDetailsPreview(details: string, maxLength = 180) {
  const readable = buildReadableAuditDetails(details);
  const text = readable.text || normalizeText(details);
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
