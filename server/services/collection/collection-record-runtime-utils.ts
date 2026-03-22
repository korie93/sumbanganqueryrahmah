import { badRequest } from "../../http/errors";
import { normalizeCollectionText } from "../../routes/collection.validation";

export const COLLECTION_RECORD_VERSION_CONFLICT_MESSAGE =
  "Collection record has changed since you opened it. Refresh and try again.";

export function parseRecordVersionTimestamp(value: unknown): Date | null {
  const normalized = normalizeCollectionText(value);
  if (!normalized) return null;

  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) {
    throw badRequest("expectedUpdatedAt must be a valid ISO date-time.");
  }

  return parsed;
}

export function resolveRecordVersionTimestamp(record: { updatedAt?: Date; createdAt: Date }): Date | null {
  const updatedAt = record.updatedAt instanceof Date
    ? record.updatedAt
    : record.updatedAt
      ? new Date(record.updatedAt)
      : null;
  if (updatedAt && Number.isFinite(updatedAt.getTime())) {
    return updatedAt;
  }
  const createdAt = record.createdAt instanceof Date ? record.createdAt : new Date(record.createdAt);
  return Number.isFinite(createdAt.getTime()) ? createdAt : null;
}

const COLLECTION_PURGE_RETENTION_MONTHS = 6;

export function getCollectionPurgeRetentionMonths() {
  return COLLECTION_PURGE_RETENTION_MONTHS;
}

export function buildCollectionPurgeCutoffDate(referenceDate = new Date()): string {
  const utcYear = referenceDate.getUTCFullYear();
  const utcMonth = referenceDate.getUTCMonth();
  const utcDay = referenceDate.getUTCDate();

  const monthAnchor = new Date(Date.UTC(utcYear, utcMonth, 1));
  monthAnchor.setUTCMonth(monthAnchor.getUTCMonth() - COLLECTION_PURGE_RETENTION_MONTHS);

  const maxDayInTargetMonth = new Date(
    Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const safeDay = Math.min(utcDay, maxDayInTargetMonth);

  return new Date(
    Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth(), safeDay),
  )
    .toISOString()
    .slice(0, 10);
}
