export type NicknameTargetBenchmarkSummary = {
  amount: number;
  configuredMonths: number;
  missingMonths: number;
  requestedMonths: number;
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
    missingMonths: toNonNegativeInteger(value.missingMonths),
    requestedMonths,
  };
}
