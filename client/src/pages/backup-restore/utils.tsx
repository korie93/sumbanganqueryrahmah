import { formatOperationalDateTime } from "@/lib/date-format";
import type { BackupFilters, BackupOption, BackupRecord } from "@/pages/backup-restore/types";

type BackupRecordLike = Record<string, unknown>;

export const backupDatePresets: BackupOption[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "Last 7 Days" },
  { value: "month", label: "Last 30 Days" },
  { value: "quarter", label: "Last 3 Months" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom Date" },
];

export const backupSortOptions: BackupOption[] = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
];

function isRecord(value: unknown): value is BackupRecordLike {
  return typeof value === "object" && value !== null;
}

export function normalizeBackup(raw: unknown): BackupRecord {
  const record = isRecord(raw) ? raw : {};
  let metadata = record.metadata ?? null;

  if (typeof metadata === "string") {
    if (metadata.length > 200_000) {
      metadata = null;
    } else {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = null;
      }
    }
  }

  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    createdAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    createdBy: String(record.createdBy ?? record.created_by ?? "system"),
        metadata: isRecord(metadata)
      ? {
          importsCount: Number(metadata.importsCount ?? metadata.imports_count ?? 0),
          dataRowsCount: Number(metadata.dataRowsCount ?? metadata.data_rows_count ?? 0),
          usersCount: Number(metadata.usersCount ?? metadata.users_count ?? 0),
          auditLogsCount: Number(metadata.auditLogsCount ?? metadata.audit_logs_count ?? 0),
          collectionRecordsCount: Number(
            metadata.collectionRecordsCount ?? metadata.collection_records_count ?? 0,
          ),
          collectionRecordReceiptsCount: Number(
            metadata.collectionRecordReceiptsCount
            ?? metadata.collection_record_receipts_count
            ?? 0,
          ),
          createdAt: String(metadata.createdAt ?? metadata.created_at ?? ""),
        }
      : null,
  };
}

export function getBackupDateRange(preset: string, dateFrom: string, dateTo: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "today":
      return { from: today, to: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) };
    case "yesterday": {
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      return { from: yesterday, to: new Date(today.getTime() - 1) };
    }
    case "week": {
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { from: weekAgo, to: now };
    }
    case "month": {
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { from: monthAgo, to: now };
    }
    case "quarter": {
      const quarterAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { from: quarterAgo, to: now };
    }
    case "year": {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return { from: startOfYear, to: now };
    }
    case "custom":
      return {
        from: dateFrom ? new Date(dateFrom) : null,
        to: dateTo ? new Date(`${dateTo}T23:59:59`) : null,
      };
    default:
      return { from: null, to: null };
  }
}

export function filterAndSortBackups(backups: BackupRecord[], filters: BackupFilters) {
  const filtered = backups.filter((backup) => {
    if (filters.searchName && !backup.name.toLowerCase().includes(filters.searchName.toLowerCase())) {
      return false;
    }

    if (
      filters.createdByFilter &&
      !backup.createdBy.toLowerCase().includes(filters.createdByFilter.toLowerCase())
    ) {
      return false;
    }

    if (filters.datePreset !== "all") {
      const { from, to } = getBackupDateRange(filters.datePreset, filters.dateFrom, filters.dateTo);
      const backupDate = new Date(backup.createdAt);
      if (from && backupDate < from) return false;
      if (to && backupDate > to) return false;
    }

    return true;
  });

  filtered.sort((left, right) => {
    switch (filters.sortBy) {
      case "newest":
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      case "oldest":
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      case "name-asc":
        return left.name.localeCompare(right.name);
      case "name-desc":
        return right.name.localeCompare(left.name);
      default:
        return 0;
    }
  });

  return filtered;
}

export function formatBackupTime(dateStr: string) {
  return formatOperationalDateTime(dateStr, { fallback: dateStr });
}
