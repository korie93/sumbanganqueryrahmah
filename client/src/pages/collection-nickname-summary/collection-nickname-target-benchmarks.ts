import { useEffect, useMemo, useState } from "react";
import { getCollectionMonthlyTarget } from "@/lib/api";
import { parseApiError } from "@/pages/collection/utils";
import type { CollectionNicknameSummaryChartDatum } from "./collection-nickname-summary-chart-utils";
import type { NicknameTotalSummary } from "./utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const TARGET_FETCH_CONCURRENCY = 6;

export type CollectionNicknameTargetBenchmark = {
  amount: number;
  configuredMonths: number;
  missingMonths: number;
  requestedMonths: number;
};

export type CollectionNicknameTargetBenchmarkState = {
  benchmarks: ReadonlyMap<string, CollectionNicknameTargetBenchmark>;
  configuredCount: number;
  errorMessage: string | null;
  loading: boolean;
  requestedMonths: number;
};

export type CollectionNicknameTargetMonthWeight = {
  daysInMonth: number;
  month: string;
  overlapDays: number;
  weight: number;
};

const EMPTY_BENCHMARK: CollectionNicknameTargetBenchmark = {
  amount: 0,
  configuredMonths: 0,
  missingMonths: 0,
  requestedMonths: 0,
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function roundMoney(value: number): number {
  const safeValue = Number(value);
  return Number.isFinite(safeValue) ? Math.round(safeValue * 100) / 100 : 0;
}

function toSafeNonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toSafeNonNegativeInteger(value: unknown): number {
  return Math.trunc(toSafeNonNegativeNumber(value));
}

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

function formatMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function normalizeCollectionNicknameTargetKey(nickname: string): string {
  return String(nickname || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-MY");
}

export function getCollectionNicknameTargetBenchmark(
  benchmarks: ReadonlyMap<string, CollectionNicknameTargetBenchmark> | null | undefined,
  nickname: string,
): CollectionNicknameTargetBenchmark {
  return benchmarks?.get(normalizeCollectionNicknameTargetKey(nickname)) ?? EMPTY_BENCHMARK;
}

export function buildCollectionNicknameTargetBenchmarksFromRows(
  rows: readonly NicknameTotalSummary[] | null | undefined,
): Map<string, CollectionNicknameTargetBenchmark> {
  const benchmarks = new Map<string, CollectionNicknameTargetBenchmark>();
  if (!Array.isArray(rows)) {
    return benchmarks;
  }

  for (const row of rows) {
    const nickname = String(row?.nickname || "").trim();
    const benchmark = row?.targetBenchmark;
    const requestedMonths = toSafeNonNegativeInteger(benchmark?.requestedMonths);
    if (!nickname || requestedMonths <= 0) {
      continue;
    }

    benchmarks.set(normalizeCollectionNicknameTargetKey(nickname), {
      amount: roundMoney(toSafeNonNegativeNumber(benchmark?.amount)),
      configuredMonths: toSafeNonNegativeInteger(benchmark?.configuredMonths),
      missingMonths: toSafeNonNegativeInteger(benchmark?.missingMonths),
      requestedMonths,
    });
  }

  return benchmarks;
}

export function buildCollectionNicknameTargetMonthWeights(
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
        daysInMonth,
        month: formatMonthKey(year, monthIndex),
        overlapDays,
        weight: overlapDays / daysInMonth,
      });
    }

    cursor.setUTCMonth(monthIndex + 1);
  }

  return weights;
}

export function calculateCollectionNicknameWeightedTarget(
  monthlyTarget: number,
  weight: number,
): number {
  const safeMonthlyTarget = Number(monthlyTarget);
  const safeWeight = Number(weight);
  if (!Number.isFinite(safeMonthlyTarget) || !Number.isFinite(safeWeight)) {
    return 0;
  }
  return roundMoney(Math.max(0, safeMonthlyTarget) * Math.max(0, safeWeight));
}

async function runLimited<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function loadNicknameTargetBenchmark(
  nickname: string,
  months: readonly CollectionNicknameTargetMonthWeight[],
  signal: AbortSignal,
): Promise<[string, CollectionNicknameTargetBenchmark]> {
  let amount = 0;
  let configuredMonths = 0;
  let missingMonths = 0;

  for (const month of months) {
    const response = await getCollectionMonthlyTarget(
      {
        month: month.month,
        nickname,
      },
      { signal },
    );
    const monthlyTarget = Number(response.monthlyTarget || 0);
    if (response.configured && Number.isFinite(monthlyTarget) && monthlyTarget > 0) {
      amount += calculateCollectionNicknameWeightedTarget(monthlyTarget, month.weight);
      configuredMonths += 1;
    } else {
      missingMonths += 1;
    }
  }

  return [
    normalizeCollectionNicknameTargetKey(nickname),
    {
      amount: roundMoney(amount),
      configuredMonths,
      missingMonths,
      requestedMonths: months.length,
    },
  ];
}

export function useCollectionNicknameTargetBenchmarks({
  enabled,
  fromDate,
  prefetchedBenchmarks,
  rows,
  toDate,
}: {
  enabled: boolean;
  fromDate?: string | undefined;
  prefetchedBenchmarks?: ReadonlyMap<string, CollectionNicknameTargetBenchmark> | undefined;
  rows: readonly CollectionNicknameSummaryChartDatum[];
  toDate?: string | undefined;
}): CollectionNicknameTargetBenchmarkState {
  const months = useMemo(
    () => buildCollectionNicknameTargetMonthWeights(fromDate, toDate),
    [fromDate, toDate],
  );
  const nicknames = useMemo(
    () => Array.from(new Set(
      rows
        .map((row) => String(row.nickname || "").trim())
        .filter(Boolean),
    )),
    [rows],
  );
  const [state, setState] = useState<CollectionNicknameTargetBenchmarkState>({
    benchmarks: new Map(),
    configuredCount: 0,
    errorMessage: null,
    loading: false,
    requestedMonths: 0,
  });

  useEffect(() => {
    if (!enabled || nicknames.length === 0 || months.length === 0) {
      setState({
        benchmarks: new Map(),
        configuredCount: 0,
        errorMessage: null,
        loading: false,
        requestedMonths: months.length,
      });
      return undefined;
    }

    const prefetchedEntries = nicknames
      .map((nickname) => {
        const key = normalizeCollectionNicknameTargetKey(nickname);
        const benchmark = prefetchedBenchmarks?.get(key);
        return benchmark ? [key, benchmark] as const : null;
      })
      .filter((entry): entry is readonly [string, CollectionNicknameTargetBenchmark] => entry !== null);

    if (prefetchedEntries.length === nicknames.length) {
      const benchmarks = new Map(prefetchedEntries);
      setState({
        benchmarks,
        configuredCount: prefetchedEntries.filter(([, benchmark]) => benchmark.amount > 0).length,
        errorMessage: null,
        loading: false,
        requestedMonths: months.length,
      });
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setState((current) => ({
      ...current,
      errorMessage: null,
      loading: true,
      requestedMonths: months.length,
    }));

    const tasks = nicknames.map((nickname) => (
      () => loadNicknameTargetBenchmark(nickname, months, controller.signal)
    ));

    void runLimited(tasks, TARGET_FETCH_CONCURRENCY)
      .then((entries) => {
        if (!active || controller.signal.aborted) {
          return;
        }
        const benchmarks = new Map(entries);
        const configuredCount = entries.filter(([, benchmark]) => benchmark.amount > 0).length;
        setState({
          benchmarks,
          configuredCount,
          errorMessage: null,
          loading: false,
          requestedMonths: months.length,
        });
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted || isAbortError(error)) {
          return;
        }
        setState({
          benchmarks: new Map(),
          configuredCount: 0,
          errorMessage: parseApiError(error),
          loading: false,
          requestedMonths: months.length,
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled, months, nicknames, prefetchedBenchmarks]);

  return state;
}
