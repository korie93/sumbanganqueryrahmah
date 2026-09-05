import type { SearchResultRow } from "@/pages/general-search/types";
import {
  formatDateTimeDDMMYYYYMalaysia,
  formatIsoDateToDDMMYYYY,
} from "@/lib/date-format";

export type GeneralSearchCollectionStatus = {
  state: "recorded" | "historical" | "not_recorded" | "unavailable";
  recordCount: number;
  latestPaymentDate: string | null;
  latestCreatedAt: string | null;
  latestStaffNickname: string | null;
  latestCreatedByLogin: string | null;
  latestAccountNumber: string | null;
  latestAmount: string | null;
  sourceImportName: string | null;
  sourceFilename: string | null;
  purgedAt: string | null;
  purgedBy: string | null;
  matchBasis: "source_row" | "source_and_identifier" | "identifier_only" | null;
  historyKey: string | null;
};

function readNullableText(value: unknown, maxLength = 255): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || null;
}

export function formatGeneralSearchCollectionPaymentDate(value: string | null): string {
  if (!value) return "Tidak dinyatakan";
  return formatIsoDateToDDMMYYYY(value, value);
}

export function formatGeneralSearchCollectionRecordedAt(value: string | null): string {
  if (!value) return "Tidak dinyatakan";
  return formatDateTimeDDMMYYYYMalaysia(value, { fallback: value });
}

export function getGeneralSearchCollectionStatus(
  row: SearchResultRow,
): GeneralSearchCollectionStatus {
  const raw = row._collectionStatus;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      state: "unavailable",
      recordCount: 0,
      latestPaymentDate: null,
      latestCreatedAt: null,
      latestStaffNickname: null,
      latestCreatedByLogin: null,
      latestAccountNumber: null,
      latestAmount: null,
      sourceImportName: null,
      sourceFilename: null,
      purgedAt: null,
      purgedBy: null,
      matchBasis: null,
      historyKey: null,
    };
  }

  const value = raw as Record<string, unknown>;
  const state = value.state === "recorded"
    || value.state === "historical"
    || value.state === "not_recorded"
    ? value.state
    : "unavailable";
  const numericCount = Number(value.recordCount);

  return {
    state,
    recordCount: (state === "recorded" || state === "historical") && Number.isFinite(numericCount)
      ? Math.max(1, Math.min(1_000_000, Math.trunc(numericCount)))
      : 0,
    latestPaymentDate: readNullableText(value.latestPaymentDate, 64),
    latestCreatedAt: readNullableText(value.latestCreatedAt, 64),
    latestStaffNickname: readNullableText(value.latestStaffNickname),
    latestCreatedByLogin: readNullableText(value.latestCreatedByLogin),
    latestAccountNumber: readNullableText(value.latestAccountNumber, 256),
    latestAmount: readNullableText(value.latestAmount, 64),
    sourceImportName: readNullableText(value.sourceImportName),
    sourceFilename: readNullableText(value.sourceFilename),
    purgedAt: readNullableText(value.purgedAt, 64),
    purgedBy: readNullableText(value.purgedBy),
    matchBasis: value.matchBasis === "source_row"
      || value.matchBasis === "source_and_identifier"
      || value.matchBasis === "identifier_only"
      ? value.matchBasis
      : null,
    historyKey: readNullableText(value.historyKey, 1_024),
  };
}

export function getGeneralSearchCollectionStatusAriaLabel(row: SearchResultRow): string {
  const status = getGeneralSearchCollectionStatus(row);
  if (status.state === "recorded") {
    const savedBy = status.latestStaffNickname || status.latestCreatedByLogin;
    return [
      `Collection direkodkan, ${status.recordCount} rekod`,
      savedBy ? `disimpan oleh ${savedBy}` : null,
      status.latestAccountNumber ? `nombor akaun ${status.latestAccountNumber}` : null,
      status.latestAmount ? `jumlah RM ${status.latestAmount}` : null,
      status.latestPaymentDate
        ? `tarikh bayaran ${formatGeneralSearchCollectionPaymentDate(status.latestPaymentDate)}`
        : null,
      status.latestCreatedAt
        ? `direkod pada ${formatGeneralSearchCollectionRecordedAt(status.latestCreatedAt)}`
        : null,
    ].filter(Boolean).join(", ");
  }
  if (status.state === "historical") {
    const savedBy = status.latestStaffNickname || status.latestCreatedByLogin;
    return [
      `Rekod sejarah collection, ${status.recordCount} rekod telah dipurge`,
      savedBy ? `asalnya disimpan oleh ${savedBy}` : null,
      status.latestAccountNumber ? `nombor akaun ${status.latestAccountNumber}` : null,
      status.latestAmount ? `jumlah RM ${status.latestAmount}` : null,
      status.latestPaymentDate
        ? `tarikh bayaran ${formatGeneralSearchCollectionPaymentDate(status.latestPaymentDate)}`
        : null,
      status.purgedAt
        ? `dipurge pada ${formatGeneralSearchCollectionRecordedAt(status.purgedAt)}`
        : null,
      status.purgedBy ? `dipurge oleh ${status.purgedBy}` : null,
    ].filter(Boolean).join(", ");
  }
  if (status.state === "not_recorded") {
    return "Tiada rekod collection";
  }
  return "Status collection tidak dapat disahkan";
}
