import type { DuplicateItem, AllAnalysisResult } from "@/pages/analysis/types";

type AnalysisFileRowAriaOptions = {
  index: number;
  item: AllAnalysisResult["imports"][number];
};

type AnalysisDuplicateRowAriaOptions = {
  duplicate: DuplicateItem;
  index: number;
};

function normalizeAnalysisValue(value: string | number | null | undefined) {
  const normalized = String(value ?? "-").replace(/\s+/g, " ").trim();
  return normalized || "-";
}

export function buildAnalysisFileRowAriaLabel({
  index,
  item,
}: AnalysisFileRowAriaOptions) {
  return [
    `Analyzed file ${index}`,
    `name ${normalizeAnalysisValue(item.name)}`,
    `filename ${normalizeAnalysisValue(item.filename)}`,
    `${Number(item.rowCount || 0).toLocaleString()} rows`,
  ].join(", ");
}

export function buildAnalysisDuplicateRowAriaLabel({
  duplicate,
  index,
}: AnalysisDuplicateRowAriaOptions) {
  return [
    `Duplicate value ${index}`,
    `value ${normalizeAnalysisValue(duplicate.value)}`,
    `appears ${normalizeAnalysisValue(duplicate.count)} times`,
  ].join(", ");
}
