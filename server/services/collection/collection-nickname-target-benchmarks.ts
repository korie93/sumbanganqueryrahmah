import { parseCollectionAmountMyrNumber } from "../../../shared/collection-amount-types";
import { roundMoney } from "./collection-daily-helpers";
import type { CollectionStoragePort } from "./collection-service-support";

const DAY_MS = 24 * 60 * 60 * 1000;

export type CollectionNicknameTargetBenchmark = {
  amount: number;
  configuredMonths: number;
  missingMonths: number;
  requestedMonths: number;
};

type CollectionNicknameTargetMonthWeight = {
  month: number;
  weight: number;
  year: number;
};

function parseIsoDateToUtc(value: string | undefined): number | null {
  const normalized = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

function buildCollectionNicknameTargetMonthWeights(
  fromDate: string | undefined,
  toDate: string | undefined,
): CollectionNicknameTargetMonthWeight[] {
  const fromTimestamp = parseIsoDateToUtc(fromDate);
  const toTimestamp = parseIsoDateToUtc(toDate);
  if (fromTimestamp === null || toTimestamp === null || fromTimestamp > toTimestamp) {
    return [];
  }

  const weights: CollectionNicknameTargetMonthWeight[] = [];
  const cursor = new Date(fromTimestamp);
  cursor.setUTCDate(1);

  while (cursor.getTime() <= toTimestamp) {
    const year = cursor.getUTCFullYear();
    const monthIndex = cursor.getUTCMonth();
    const monthStart = Date.UTC(year, monthIndex, 1);
    const monthEnd = Date.UTC(year, monthIndex + 1, 0);
    const overlapStart = Math.max(fromTimestamp, monthStart);
    const overlapEnd = Math.min(toTimestamp, monthEnd);
    const daysInMonth = new Date(monthEnd).getUTCDate();
    const overlapDays = Math.max(0, Math.floor((overlapEnd - overlapStart) / DAY_MS) + 1);

    if (overlapDays > 0) {
      weights.push({
        month: monthIndex + 1,
        weight: overlapDays / daysInMonth,
        year,
      });
    }

    cursor.setUTCMonth(monthIndex + 1);
  }

  return weights;
}

export function normalizeCollectionNicknameTargetBenchmarkKey(nickname: string): string {
  return String(nickname || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-MY");
}

export async function buildCollectionNicknameTargetBenchmarkMap(
  storage: CollectionStoragePort,
  params: {
    from?: string | undefined;
    nicknames: readonly string[];
    to?: string | undefined;
  },
): Promise<Map<string, CollectionNicknameTargetBenchmark>> {
  if (typeof storage.getCollectionDailyTarget !== "function") {
    return new Map();
  }

  const months = buildCollectionNicknameTargetMonthWeights(params.from, params.to);
  const benchmarks = new Map<string, CollectionNicknameTargetBenchmark>();
  if (months.length === 0) {
    return benchmarks;
  }

  for (const nickname of params.nicknames) {
    let amount = 0;
    let configuredMonths = 0;
    let missingMonths = 0;

    for (const month of months) {
      const target = await storage.getCollectionDailyTarget({
        username: nickname,
        year: month.year,
        month: month.month,
      });
      const monthlyTarget = parseCollectionAmountMyrNumber(target?.monthlyTarget ?? 0);
      if (target && monthlyTarget > 0) {
        amount += roundMoney(monthlyTarget * month.weight);
        configuredMonths += 1;
      } else {
        missingMonths += 1;
      }
    }

    benchmarks.set(normalizeCollectionNicknameTargetBenchmarkKey(nickname), {
      amount: roundMoney(amount),
      configuredMonths,
      missingMonths,
      requestedMonths: months.length,
    });
  }

  return benchmarks;
}
