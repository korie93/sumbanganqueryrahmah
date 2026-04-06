import type { PostgresStorage } from "../storage-postgres";
import { logger } from "../lib/logger";
import {
  buildCategoryStatsSummary,
  detectCategoryCountRequest,
  normalizeCategoryStatsKeys,
} from "./category-stats-query-utils";
import {
  CATEGORY_RULES_CACHE_MS,
  CountQuerySummary,
  CategoryRule,
  DEFAULT_COUNT_GROUPS,
} from "./category-stats-types";

export class CategoryStatsService {
  private categoryRulesCache: { ts: number; rules: CategoryRule[] } | null = null;
  private readonly categoryStatsInflight = new Map<string, Promise<void>>();

  constructor(private readonly storage: PostgresStorage) {}

  async resolveCountSummary(query: string, timeoutMs: number): Promise<CountQuerySummary | null> {
    const rules = await this.loadCategoryRules();
    const countGroups = detectCategoryCountRequest(query, rules);
    if (!countGroups) {
      return null;
    }

    const keys = normalizeCategoryStatsKeys([...countGroups.map((group) => group.key), "__all__"]);
    const rulesUpdatedAt = await this.storage.getCategoryRulesMaxUpdatedAt();
    let statsRows = await this.storage.getCategoryStats(keys);
    let statsMap = new Map(statsRows.map((row) => [row.key, row]));
    let totalRow = statsMap.get("__all__");
    const statsUpdatedAt = totalRow?.updatedAt ?? null;
    const missingKeys = keys.filter((key) => !statsMap.get(key));
    const staleStats = Boolean(rulesUpdatedAt && statsUpdatedAt && rulesUpdatedAt > statsUpdatedAt);

    if (!totalRow || missingKeys.length > 0 || staleStats) {
      const computeKeys = staleStats ? keys : Array.from(new Set([...missingKeys, "__all__"]));
      let readyNow = false;
      try {
        await this.withTimeout(
          this.storage.computeCategoryStatsForKeys(computeKeys, rules),
          Math.max(3000, timeoutMs),
        );
        statsRows = await this.storage.getCategoryStats(keys);
        statsMap = new Map(statsRows.map((row) => [row.key, row]));
        totalRow = statsMap.get("__all__");
        readyNow = Boolean(totalRow && keys.every((key) => statsMap.has(key)));
      } catch {
        readyNow = false;
      }

      if (!readyNow) {
        this.enqueueCategoryStatsCompute(computeKeys, rules);
        return {
          processing: true,
          summary: "Statistik sedang disediakan. Sila cuba semula dalam 10-20 saat.",
          stats: [],
        };
      }
    }

    return {
      processing: false,
      summary: buildCategoryStatsSummary(countGroups, statsMap, totalRow?.total ?? 0),
      stats: statsRows,
    };
  }

  async warmCategoryStats(): Promise<{ skipped: boolean; computeKeys: number }> {
    const rules = await this.loadCategoryRules();
    const enabledRuleKeys = rules.filter((rule) => rule.enabled !== false).map((rule) => rule.key);
    const targetKeys = normalizeCategoryStatsKeys(["__all__", ...enabledRuleKeys]);
    const rulesUpdatedAt = await this.storage.getCategoryRulesMaxUpdatedAt();
    const existing = await this.storage.getCategoryStats(targetKeys);
    const byKey = new Map(existing.map((row) => [row.key, row]));
    const statsUpdatedAt = byKey.get("__all__")?.updatedAt ?? null;
    const hasAllKeys = targetKeys.every((key) => byKey.has(key));
    const isStale = Boolean(rulesUpdatedAt && statsUpdatedAt && rulesUpdatedAt > statsUpdatedAt);

    if (hasAllKeys && !isStale) {
      return { skipped: true, computeKeys: 0 };
    }

    const missingKeys = targetKeys.filter((key) => !byKey.has(key));
    const computeKeys = isStale ? targetKeys : Array.from(new Set([...missingKeys, "__all__"]));
    await this.storage.computeCategoryStatsForKeys(computeKeys, rules);
    return { skipped: false, computeKeys: computeKeys.length };
  }

  private async loadCategoryRules(): Promise<CategoryRule[]> {
    if (this.categoryRulesCache && Date.now() - this.categoryRulesCache.ts < CATEGORY_RULES_CACHE_MS) {
      return this.categoryRulesCache.rules;
    }

    try {
      const rules = await this.storage.getCategoryRules();
      if (rules.length > 0) {
        this.categoryRulesCache = { ts: Date.now(), rules };
        return rules;
      }
    } catch {
      // fallback below
    }

    return DEFAULT_COUNT_GROUPS;
  }

  private enqueueCategoryStatsCompute(keys: string[], rules: CategoryRule[]) {
    const normalized = normalizeCategoryStatsKeys(keys);
    if (!normalized.length) {
      return;
    }

    const queueKey = normalized.join("|");
    if (this.categoryStatsInflight.has(queueKey)) {
      return;
    }

    const task = this.storage
      .computeCategoryStatsForKeys(normalized, rules)
      .then(() => undefined)
      .catch((error) => {
        logger.error("Category stats compute failed", { error });
      })
      .finally(() => {
        this.categoryStatsInflight.delete(queueKey);
      });

    this.categoryStatsInflight.set(queueKey, task);
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = setTimeout(() => reject(new Error("timeout")), ms);
      promise
        .then((value) => {
          clearTimeout(id);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(id);
          reject(error);
        });
    });
  }
}
