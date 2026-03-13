import type { PostgresStorage } from "../storage-postgres";

type CategoryRule = {
  key: string;
  terms: string[];
  fields: string[];
  matchMode?: string;
  enabled?: boolean;
};

type CategoryStatsRow = Awaited<ReturnType<PostgresStorage["getCategoryStats"]>>[number];

type CountQuerySummary = {
  processing: boolean;
  summary: string;
  stats: CategoryStatsRow[];
};

const CATEGORY_RULES_CACHE_MS = 60_000;

const DEFAULT_COUNT_GROUPS: CategoryRule[] = [
  {
    key: "kerajaan",
    terms: [
      "kerajaan", "government", "gov", "gomen", "sector awam", "public sector",
      "kementerian", "jabatan", "agensi", "persekutuan", "negeri", "majlis",
      "kkm", "kpm", "kpt", "moe", "moh", "state government", "federal",
      "sekolah", "guru", "teacher", "cikgu", "pendidikan", "government",
    ],
    fields: [
      "EMPLOYER NAME", "NATURE OF BUSINESS", "NOB", "EmployerName",
      "Nature of Business", "Company", "Nama Majikan", "Majikan",
      "Department", "Agensi",
    ],
    matchMode: "contains",
  },
  {
    key: "polis",
    terms: ["polis", "police", "pdrm", "polis diraja malaysia", "ipd", "ipk"],
    fields: [
      "EMPLOYER NAME", "NATURE OF BUSINESS", "NOB", "EmployerName",
      "Nature of Business", "Company", "Nama Majikan", "Majikan",
      "Department", "Agensi",
    ],
    matchMode: "contains",
  },
  {
    key: "tentera",
    terms: ["tentera", "army", "military", "atm", "angkatan tentera", "tldm", "tudm", "tentera darat", "tentera laut", "tentera udara"],
    fields: [
      "EMPLOYER NAME", "NATURE OF BUSINESS", "NOB", "EmployerName",
      "Nature of Business", "Company", "Nama Majikan", "Majikan",
      "Department", "Agensi",
    ],
    matchMode: "contains",
  },
  {
    key: "hospital",
    terms: ["hospital", "klinik", "clinic", "medical", "kesihatan", "health", "klin ik", "medical center", "healthcare"],
    fields: [
      "EMPLOYER NAME", "NATURE OF BUSINESS", "NOB", "EmployerName",
      "Nature of Business", "Company", "Nama Majikan", "Majikan",
      "Department", "Agensi",
    ],
    matchMode: "contains",
  },
  {
    key: "hotel",
    terms: ["hotel", "hospitality", "resort", "inn", "motel", "restaurant"],
    fields: [
      "EMPLOYER NAME", "NATURE OF BUSINESS", "NOB", "EmployerName",
      "Nature of Business", "Company", "Nama Majikan", "Majikan",
      "Department", "Agensi",
    ],
    matchMode: "contains",
  },
  {
    key: "swasta",
    terms: ["swasta", "private", "sdn bhd", "bhd", "enterprise", "trading", "ltd", "plc"],
    fields: [
      "EMPLOYER NAME", "NATURE OF BUSINESS", "NOB", "EmployerName",
      "Nature of Business", "Company", "Nama Majikan", "Majikan",
      "Department", "Agensi",
    ],
    matchMode: "complement",
  },
];

export class CategoryStatsService {
  private categoryRulesCache: { ts: number; rules: CategoryRule[] } | null = null;
  private readonly categoryStatsInflight = new Map<string, Promise<void>>();

  constructor(private readonly storage: PostgresStorage) {}

  async resolveCountSummary(query: string, timeoutMs: number): Promise<CountQuerySummary | null> {
    const rules = await this.loadCategoryRules();
    const countGroups = this.detectCountRequest(query, rules);
    if (!countGroups) {
      return null;
    }

    const keys = [...countGroups.map((group) => group.key), "__all__"];
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
      summary: this.buildSummary(countGroups, statsMap, totalRow?.total ?? 0),
      stats: statsRows,
    };
  }

  async warmCategoryStats(): Promise<{ skipped: boolean; computeKeys: number }> {
    const rules = await this.loadCategoryRules();
    const enabledRuleKeys = rules.filter((rule) => rule.enabled !== false).map((rule) => rule.key);
    const targetKeys = Array.from(new Set(["__all__", ...enabledRuleKeys]));
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

  private detectCountRequest(query: string, rules: CategoryRule[]): CategoryRule[] | null {
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

  private enqueueCategoryStatsCompute(keys: string[], rules: CategoryRule[]) {
    const normalized = Array.from(new Set(keys)).filter(Boolean).sort();
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
        console.error("Category stats compute failed:", error?.message || error);
      })
      .finally(() => {
        this.categoryStatsInflight.delete(queueKey);
      });

    this.categoryStatsInflight.set(queueKey, task);
  }

  private buildSummary(
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
