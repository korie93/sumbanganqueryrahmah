import type {
  AllAnalysisResult,
  AnalysisData,
  AnalysisMode,
  SingleAnalysisResult,
} from "@/pages/analysis/types";

export type AnalysisSnapshotItem = {
  label: string;
  value: string;
  supporting: string;
  tone?: "default" | "success" | "warning" | "danger";
};

type BuildAnalysisHeaderDescriptionOptions = {
  importName: string;
  mode: AnalysisMode;
};

type BuildAnalysisSnapshotItemsOptions = {
  allResult: AllAnalysisResult | null;
  analysis: AnalysisData | null;
  mode: AnalysisMode;
  singleResult: SingleAnalysisResult | null;
  totalRows: number;
};

export function buildAnalysisHeaderDescription({
  importName,
  mode,
}: BuildAnalysisHeaderDescriptionOptions) {
  return mode === "all"
    ? "Review ID distribution, duplicate pressure, and special record types across all saved imports."
    : `Review ID distribution, duplicate pressure, and special record types for ${importName}.`;
}

export function buildAnalysisSnapshotItems({
  allResult,
  analysis,
  mode,
  singleResult,
  totalRows,
}: BuildAnalysisSnapshotItemsOptions): AnalysisSnapshotItem[] {
  const duplicateCount = analysis?.duplicates.count ?? 0;
  const specialIdCount =
    (analysis?.noPolis.count ?? 0) +
    (analysis?.noTentera.count ?? 0) +
    (analysis?.passportMY.count ?? 0) +
    (analysis?.passportLuarNegara.count ?? 0);

  return [
    {
      label: "Scope",
      value: mode === "all" ? "All Files" : "Single File",
      supporting:
        mode === "all"
          ? `${allResult?.totalImports ?? 0} imports combined`
          : singleResult?.import.filename ?? "Selected import",
    },
    {
      label: "Rows",
      value: totalRows.toLocaleString(),
      supporting:
        totalRows === 1 ? "1 analyzed row" : `${totalRows.toLocaleString()} analyzed rows`,
    },
    {
      label: "Duplicates",
      value: duplicateCount.toLocaleString(),
      supporting:
        duplicateCount > 0 ? "Repeated IDs need review" : "No repeated IDs detected",
      tone: duplicateCount > 0 ? "warning" : "success",
    },
    {
      label: "Special IDs",
      value: specialIdCount.toLocaleString(),
      supporting: "Police, military, and passport records",
    },
  ];
}
