import type { AnalysisData } from "@/pages/analysis/types";

export const TABLE_PAGE_SIZE =
  typeof document !== "undefined" && document.documentElement.classList.contains("low-spec")
    ? 100
    : 250;

export const ANALYSIS_CHART_COLORS = {
  blue: "#3b82f6",
  pink: "#ec4899",
  yellow: "#ca8a04",
  green: "#16a34a",
  purple: "#9333ea",
  orange: "#ea580c",
};

export function getPaginatedItems<T>(key: string, items: T[], tablePages: Record<string, number>) {
  const page = tablePages[key] ?? 0;
  const start = page * TABLE_PAGE_SIZE;
  const end = Math.min(start + TABLE_PAGE_SIZE, items.length);

  return {
    page,
    start,
    end,
    totalPages: Math.max(1, Math.ceil(items.length / TABLE_PAGE_SIZE)),
    items: items.slice(start, end),
  };
}

export function getGenderPieData(analysis: AnalysisData | null) {
  if (!analysis) return [];

  return [
    { name: "IC Male", value: analysis.icLelaki.count, color: ANALYSIS_CHART_COLORS.blue },
    { name: "IC Female", value: analysis.icPerempuan.count, color: ANALYSIS_CHART_COLORS.pink },
  ].filter((item) => item.value > 0);
}

export function getCategoryBarData(analysis: AnalysisData | null) {
  if (!analysis) return [];

  return [
    { name: "IC Male", count: analysis.icLelaki.count, fill: ANALYSIS_CHART_COLORS.blue },
    { name: "IC Female", count: analysis.icPerempuan.count, fill: ANALYSIS_CHART_COLORS.pink },
    { name: "Police No.", count: analysis.noPolis.count, fill: ANALYSIS_CHART_COLORS.yellow },
    { name: "Military No.", count: analysis.noTentera.count, fill: ANALYSIS_CHART_COLORS.green },
    { name: "Passport MY", count: analysis.passportMY.count, fill: ANALYSIS_CHART_COLORS.purple },
    { name: "Foreign Passport", count: analysis.passportLuarNegara.count, fill: ANALYSIS_CHART_COLORS.orange },
  ];
}
