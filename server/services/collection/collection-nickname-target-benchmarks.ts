import { parseCollectionAmountMyrNumber } from "../../../shared/collection-amount-types";
import { roundMoney } from "./collection-daily-helpers";
import type { CollectionStoragePort } from "./collection-service-support";

export type CollectionNicknameTargetBenchmark = {
  amount: number;
  configuredMonths: number;
  missingMonths: number;
  requestedMonths: number;
};

type CollectionNicknameTargetMonth = {
  month: number;
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

function buildCollectionNicknameTargetMonths(
  fromDate: string | undefined,
  toDate: string | undefined,
): CollectionNicknameTargetMonth[] {
  const fromTimestamp = parseIsoDateToUtc(fromDate);
  const toTimestamp = parseIsoDateToUtc(toDate);
  if (fromTimestamp === null || toTimestamp === null || fromTimestamp > toTimestamp) {
    return [];
  }

  const months: CollectionNicknameTargetMonth[] = [];
  const cursor = new Date(fromTimestamp);
  cursor.setUTCDate(1);
  const finalMonth = new Date(toTimestamp);
  finalMonth.setUTCDate(1);

  while (cursor.getTime() <= finalMonth.getTime()) {
    months.push({
      month: cursor.getUTCMonth() + 1,
      year: cursor.getUTCFullYear(),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
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

  const months = buildCollectionNicknameTargetMonths(params.from, params.to);
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
      if (target) {
        const monthlyTarget = Math.max(
          0,
          parseCollectionAmountMyrNumber(target.monthlyTarget),
        );
        amount += monthlyTarget;
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
