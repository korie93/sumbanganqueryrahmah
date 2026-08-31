import type {
  CollectionSourceMatch,
  CollectionSourceMatchField,
} from "@/lib/api";

const COLLECTION_SOURCE_DIAGNOSTIC_LIMIT = 5;

const MATCH_FIELD_LABELS: Record<CollectionSourceMatchField, string> = {
  customer_name: "Name",
  ic_number: "IC",
  customer_phone: "Phone",
  account_number: "Account",
};

export type CollectionSourceMatchDiagnostic = {
  displayKey: string;
  sourceLabel: string;
  sourceFilename: string;
  matchAccuracy: number;
  matchedFieldsLabel: string;
};

export type CollectionSourceMatchDiagnosticResult = {
  items: CollectionSourceMatchDiagnostic[];
  omittedCount: number;
  totalCount: number;
};

function normalizeSourceText(value: string | null): string {
  return String(value || "").trim();
}

export function getCollectionSourceLabel(match: CollectionSourceMatch): string {
  return normalizeSourceText(match.sourceImportName)
    || normalizeSourceText(match.sourceFilename)
    || "Saved file";
}

export function buildUnusableCollectionSourceMatchDiagnostics(
  matches: CollectionSourceMatch[],
  limit = COLLECTION_SOURCE_DIAGNOSTIC_LIMIT,
): CollectionSourceMatchDiagnosticResult {
  const normalizedLimit = Number.isFinite(limit)
    ? Math.max(0, Math.trunc(limit))
    : COLLECTION_SOURCE_DIAGNOSTIC_LIMIT;
  const unusableMatches = matches.filter((match) => match.totalDue === null);
  const signatureCounts = new Map<string, number>();
  const items = unusableMatches.slice(0, normalizedLimit).map((match) => {
    const sourceLabel = getCollectionSourceLabel(match);
    const sourceFilename = normalizeSourceText(match.sourceFilename);
    const signature = [
      sourceLabel,
      sourceFilename,
      match.matchAccuracy,
      match.matchedFields.join(","),
    ].join(":");
    const signatureCount = (signatureCounts.get(signature) ?? 0) + 1;
    signatureCounts.set(signature, signatureCount);

    return {
      displayKey: `${signature}:${signatureCount}`,
      sourceLabel,
      sourceFilename: sourceFilename === sourceLabel ? "" : sourceFilename,
      matchAccuracy: match.matchAccuracy,
      matchedFieldsLabel: match.matchedFields
        .map((field) => MATCH_FIELD_LABELS[field])
        .join(", ") || "-",
    };
  });

  return {
    items,
    omittedCount: Math.max(0, unusableMatches.length - items.length),
    totalCount: unusableMatches.length,
  };
}

export function formatCollectionSourceMatchedFields(match: CollectionSourceMatch): string {
  return match.matchedFields.map((field) => MATCH_FIELD_LABELS[field]).join(", ") || "-";
}
