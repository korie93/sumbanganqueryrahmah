import type { CategoryRule, CategoryStatRow } from "./ai-category-types";
import {
  countRowsByCategoryKeywords,
  getCategoryRules,
  getCategoryRulesMaxUpdatedAt,
  getCategoryStats,
} from "./ai-category-read-repository";
import {
  computeCategoryStatsForKeys,
  rebuildCategoryStats,
} from "./ai-category-stats-repository";

export type { CategoryRule, CategoryStatRow } from "./ai-category-types";

export class AiCategoryRepository {
  async countRowsByKeywords(params: { groups: CategoryRule[] }): Promise<{
    totalRows: number;
    counts: Record<string, number>;
  }> {
    return countRowsByCategoryKeywords(params);
  }

  async getCategoryRules(): Promise<Array<{
    key: string;
    terms: string[];
    fields: string[];
    matchMode: string;
    enabled: boolean;
  }>> {
    return getCategoryRules();
  }

  async getCategoryRulesMaxUpdatedAt(): Promise<Date | null> {
    return getCategoryRulesMaxUpdatedAt();
  }

  async getCategoryStats(keys: string[]): Promise<CategoryStatRow[]> {
    return getCategoryStats(keys);
  }

  async computeCategoryStatsForKeys(keys: string[], groups: CategoryRule[]): Promise<CategoryStatRow[]> {
    return computeCategoryStatsForKeys(keys, groups);
  }

  async rebuildCategoryStats(groups: CategoryRule[]): Promise<void> {
    return rebuildCategoryStats(groups);
  }
}
