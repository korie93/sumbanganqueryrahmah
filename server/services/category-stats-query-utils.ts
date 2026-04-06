import type { CategoryRule, CategoryStatsRow } from "./category-stats-types";

export function detectCategoryCountRequest(
  query: string,
  rules: CategoryRule[],
): CategoryRule[] | null {
  const lower = query.toLowerCase();
  const trigger = /(berapa|jumlah|bilangan|ramai|count|how many|berapa orang)/i.test(lower);
  if (!trigger) {
    return null;
  }

  const enabledRules = rules.filter((rule) => rule.enabled !== false);
  const matched = enabledRules.filter(
    (group) =>
      group.terms.some((term) => lower.includes(term.toLowerCase())) ||
      lower.includes(group.key),
  );
  return matched.length > 0 ? matched : enabledRules;
}

export function normalizeCategoryStatsKeys(keys: string[]): string[] {
  return Array.from(new Set(keys)).filter(Boolean).sort();
}

export function buildCategoryStatsSummary(
  countGroups: CategoryRule[],
  statsMap: Map<string, CategoryStatsRow>,
  total: number,
): string {
  const summaryLines = [
    "Ringkasan Statistik (berdasarkan data import):",
    `Jumlah rekod dianalisis: ${total}`,
  ];

  for (const group of countGroups) {
    const row = statsMap.get(group.key);
    const count = row?.total ?? 0;
    summaryLines.push(`- ${group.key}: ${count}`);
    if (row?.samples?.length) {
      summaryLines.push("  Contoh rekod:");
      for (const sample of row.samples.slice(0, 10)) {
        const source = sample.source ? ` (${sample.source})` : "";
        summaryLines.push(`  - ${sample.name} | IC: ${sample.ic}${source}`);
      }
    }
  }

  return summaryLines.join("\n");
}
