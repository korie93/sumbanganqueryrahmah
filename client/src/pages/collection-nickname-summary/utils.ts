export type NicknameTargetBenchmarkSummary = {
  amount: number;
  configuredMonths: number;
  latestUpdatedAt: string | null;
  latestUpdatedBy: string | null;
  missingMonths: number;
  months: NicknameTargetMonthSummary[];
  requestedMonths: number;
};

export type NicknameTargetMonthSummary = {
  amount: number;
  configured: boolean;
  month: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type NicknameTotalSummary = {
  nickname: string;
  totalAmount: number;
  totalRecords: number;
  targetBenchmark?: NicknameTargetBenchmarkSummary | null;
};

export function normalizeNicknameTotals(rows: unknown): NicknameTotalSummary[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item) => {
      const record = isObjectRecord(item) ? item : {};
      return {
        nickname: String(record.nickname || "").trim(),
        totalRecords: Number(record.totalRecords || 0),
        totalAmount: Number(record.totalAmount || 0),
        targetBenchmark: normalizeTargetBenchmark(record.targetBenchmark),
      };
    })
    .filter((item) => item.nickname !== "")
    .sort((left, right) =>
      left.nickname.localeCompare(right.nickname, undefined, {
        sensitivity: "base",
      }),
    );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toNonNegativeInteger(value: unknown): number {
  return Math.trunc(toNonNegativeNumber(value));
}

function toNullableText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 120) : null;
}

function toNullableIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function normalizeTargetMonths(value: unknown): NicknameTargetMonthSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isObjectRecord(item)) {
      return [];
    }
    const month = typeof item.month === "string" && /^\d{4}-\d{2}$/.test(item.month)
      ? item.month
      : "";
    if (!month) {
      return [];
    }
    return [{
      amount: toNonNegativeNumber(item.amount),
      configured: item.configured === true,
      month,
      updatedAt: toNullableIsoTimestamp(item.updatedAt),
      updatedBy: toNullableText(item.updatedBy),
    }];
  });
}

function normalizeTargetBenchmark(value: unknown): NicknameTargetBenchmarkSummary | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const requestedMonths = toNonNegativeInteger(value.requestedMonths);
  if (requestedMonths <= 0) {
    return null;
  }

  return {
    amount: toNonNegativeNumber(value.amount),
    configuredMonths: toNonNegativeInteger(value.configuredMonths),
    latestUpdatedAt: toNullableIsoTimestamp(value.latestUpdatedAt),
    latestUpdatedBy: toNullableText(value.latestUpdatedBy),
    missingMonths: toNonNegativeInteger(value.missingMonths),
    months: normalizeTargetMonths(value.months),
    requestedMonths,
  };
}
