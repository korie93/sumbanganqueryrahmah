import {
  getBrowserLocalStorage,
  safeGetStorageItem,
  safeRemoveStorageItem,
  safeSetStorageItem,
  type BrowserStorageLike,
} from "@/lib/browser-storage";
import { DEFAULT_AUDIT_LOG_FILTERS } from "@/pages/audit-logs/audit-log-page-state-utils";
import type { AuditLogFilters } from "@/pages/audit-logs/types";

const AUDIT_LOG_SAVED_VIEWS_STORAGE_KEY = "sqr.auditLogs.savedViews.v1";
const MAX_CUSTOM_AUDIT_LOG_SAVED_VIEWS = 8;

export interface AuditLogSavedView {
  id: string;
  label: string;
  description: string;
  filters: AuditLogFilters;
  source: "built-in" | "custom";
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeAuditLogFiltersCandidate(value: unknown): AuditLogFilters | null {
  if (!isUnknownRecord(value)) {
    return null;
  }

  return {
    actionFilter: readStringField(value.actionFilter) || DEFAULT_AUDIT_LOG_FILTERS.actionFilter,
    categoryFilter: readStringField(value.categoryFilter) || DEFAULT_AUDIT_LOG_FILTERS.categoryFilter,
    dateFrom: readStringField(value.dateFrom),
    datePreset: readStringField(value.datePreset) || DEFAULT_AUDIT_LOG_FILTERS.datePreset,
    dateTo: readStringField(value.dateTo),
    performedByFilter: readStringField(value.performedByFilter),
    riskFilter: readStringField(value.riskFilter) || DEFAULT_AUDIT_LOG_FILTERS.riskFilter,
    searchText: readStringField(value.searchText),
    targetUserFilter: readStringField(value.targetUserFilter),
  };
}

function normalizeStoredView(value: unknown): AuditLogSavedView | null {
  if (!isUnknownRecord(value)) {
    return null;
  }
  const filters = normalizeAuditLogFiltersCandidate(value.filters);
  const label = readStringField(value.label).trim();
  const id = readStringField(value.id).trim();
  if (!filters || !label || !id) {
    return null;
  }

  return {
    id,
    label: label.slice(0, 48),
    description: readStringField(value.description).trim().slice(0, 96) || "Custom audit filter view.",
    filters,
    source: "custom",
  };
}

function getStorage(storage?: BrowserStorageLike | null) {
  return storage === undefined ? getBrowserLocalStorage() : storage;
}

export function getBuiltInAuditLogSavedViews(): AuditLogSavedView[] {
  return [
    {
      id: "builtin-critical-today",
      label: "Critical Today",
      description: "Critical audit entries recorded today.",
      filters: { ...DEFAULT_AUDIT_LOG_FILTERS, datePreset: "today", riskFilter: "critical" },
      source: "built-in",
    },
    {
      id: "builtin-failed-security",
      label: "Failed Security",
      description: "Failed or blocked security-related entries.",
      filters: {
        ...DEFAULT_AUDIT_LOG_FILTERS,
        categoryFilter: "Security",
        riskFilter: "high",
        searchText: "FAILED",
      },
      source: "built-in",
    },
    {
      id: "builtin-backup",
      label: "Backup Activity",
      description: "Backup, restore, and recovery events.",
      filters: { ...DEFAULT_AUDIT_LOG_FILTERS, categoryFilter: "Backup" },
      source: "built-in",
    },
    {
      id: "builtin-collection",
      label: "Collection Changes",
      description: "Collection record and collection setting activity.",
      filters: { ...DEFAULT_AUDIT_LOG_FILTERS, categoryFilter: "Collection" },
      source: "built-in",
    },
  ];
}

export function readCustomAuditLogSavedViews(storage?: BrowserStorageLike | null): AuditLogSavedView[] {
  const raw = safeGetStorageItem(getStorage(storage), AUDIT_LOG_SAVED_VIEWS_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item: unknown) => normalizeStoredView(item))
      .filter((item): item is AuditLogSavedView => Boolean(item))
      .slice(0, MAX_CUSTOM_AUDIT_LOG_SAVED_VIEWS);
  } catch {
    safeRemoveStorageItem(getStorage(storage), AUDIT_LOG_SAVED_VIEWS_STORAGE_KEY);
    return [];
  }
}

export function writeCustomAuditLogSavedViews(
  views: AuditLogSavedView[],
  storage?: BrowserStorageLike | null,
) {
  const customViews = views
    .filter((view) => view.source === "custom")
    .slice(0, MAX_CUSTOM_AUDIT_LOG_SAVED_VIEWS);
  return safeSetStorageItem(
    getStorage(storage),
    AUDIT_LOG_SAVED_VIEWS_STORAGE_KEY,
    JSON.stringify(customViews),
    {
      onQuotaExceeded: () => safeRemoveStorageItem(getStorage(storage), AUDIT_LOG_SAVED_VIEWS_STORAGE_KEY),
    },
  );
}

export function buildAuditLogSavedView(
  filters: AuditLogFilters,
  label: string,
  idSuffix = Date.now().toString(36),
): AuditLogSavedView {
  const normalizedLabel = label.trim().slice(0, 48) || "Custom View";
  return {
    id: `custom-${idSuffix}`,
    label: normalizedLabel,
    description: "Saved audit filter view.",
    filters,
    source: "custom",
  };
}
