import { formatIsoDateToDDMMYYYY, formatOperationalDateTime } from "@/lib/date-format";

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

const auditDetailLabelMap: Record<string, string> = {
  action: "Tindakan",
  amount: "Jumlah",
  batch: "Batch",
  customerName: "Nama pelanggan",
  date: "Tarikh",
  from: "Tarikh mula",
  leaveType: "Jenis cuti",
  nickname: "Nickname",
  nicknameCount: "Bilangan nickname",
  note: "Nota",
  page: "Halaman",
  pageSize: "Rekod setiap halaman",
  receiptCount: "Bilangan resit",
  recordCount: "Rekod dipaparkan",
  role: "Peranan",
  searchPresent: "Carian digunakan",
  status: "Status",
  targetUser: "Pengguna sasaran",
  to: "Tarikh akhir",
  totalRecords: "Jumlah rekod",
  username: "Username",
};

const priorityDetailKeys = [
  "role",
  "recordCount",
  "totalRecords",
  "page",
  "pageSize",
  "from",
  "to",
  "date",
  "nickname",
  "username",
  "nicknameCount",
  "searchPresent",
  "status",
  "leaveType",
  "note",
];

const numberFormatter = new Intl.NumberFormat("en-MY");

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

function normalizeRoleValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "superuser") return "Superuser";
  if (normalized === "admin") return "Admin";
  if (normalized === "user") return "User";
  return value;
}

function shouldFormatAsDate(key: string, value: string) {
  return (
    ["date", "from", "to", "paymentDate", "calendarDate"].includes(key) &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  );
}

function shouldFormatAsDateTime(key: string, value: string) {
  return (
    /(?:At|Timestamp|Time)$/i.test(key) &&
    /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2})/.test(value)
  );
}

function formatAuditDetailValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "Ya" : "Tidak";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? numberFormatter.format(value) : "-";
  }

  if (typeof value === "string") {
    if (key === "role") return normalizeRoleValue(value);
    if (shouldFormatAsDate(key, value)) return formatIsoDateToDDMMYYYY(value, value);
    if (shouldFormatAsDateTime(key, value)) {
      return formatOperationalDateTime(value, { fallback: value });
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.length > 0
      ? value.map((item) => formatAuditDetailValue(key, item)).join(", ")
      : "-";
  }

  return JSON.stringify(value);
}

function sortAuditDetailKeys(keys: string[]) {
  return [...keys].sort((left, right) => {
    const leftIndex = priorityDetailKeys.indexOf(left);
    const rightIndex = priorityDetailKeys.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    }
    return left.localeCompare(right);
  });
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

  const items = sortAuditDetailKeys(Object.keys(parsed))
    .map((key) => ({
      key,
      label: humanizeAuditDetailKey(key),
      value: formatAuditDetailValue(key, parsed[key]),
    }))
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
