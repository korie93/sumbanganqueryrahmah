import type { SearchResultRow } from "@/pages/general-search/types";

export type GeneralSearchCollectionStatus = {
  state: "recorded" | "not_recorded" | "unavailable";
  recordCount: number;
  latestPaymentDate: string | null;
  latestCreatedAt: string | null;
  latestStaffNickname: string | null;
  sourceImportName: string | null;
  sourceFilename: string | null;
  matchBasis: "source_and_identifier" | "identifier_only" | null;
};

function readNullableText(value: unknown, maxLength = 255): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || null;
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
      sourceImportName: null,
      sourceFilename: null,
      matchBasis: null,
    };
  }

  const value = raw as Record<string, unknown>;
  const state = value.state === "recorded" || value.state === "not_recorded"
    ? value.state
    : "unavailable";
  const numericCount = Number(value.recordCount);

  return {
    state,
    recordCount: state === "recorded" && Number.isFinite(numericCount)
      ? Math.max(1, Math.min(1_000_000, Math.trunc(numericCount)))
      : 0,
    latestPaymentDate: readNullableText(value.latestPaymentDate, 64),
    latestCreatedAt: readNullableText(value.latestCreatedAt, 64),
    latestStaffNickname: readNullableText(value.latestStaffNickname),
    sourceImportName: readNullableText(value.sourceImportName),
    sourceFilename: readNullableText(value.sourceFilename),
    matchBasis: value.matchBasis === "source_and_identifier" || value.matchBasis === "identifier_only"
      ? value.matchBasis
      : null,
  };
}

export function getGeneralSearchCollectionStatusAriaLabel(row: SearchResultRow): string {
  const status = getGeneralSearchCollectionStatus(row);
  if (status.state === "recorded") {
    return `Collection direkodkan, ${status.recordCount} rekod`;
  }
  if (status.state === "not_recorded") {
    return "Tiada rekod collection";
  }
  return "Status collection tidak dapat disahkan";
}
