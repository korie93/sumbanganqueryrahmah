import { useEffect, useMemo, useState } from "react";
import { getCollectionMonthlyTarget } from "@/lib/api";
import { parseApiError } from "@/pages/collection/utils";
import type { CollectionNicknameSummaryChartDatum } from "./collection-nickname-summary-chart-utils";
import type { NicknameTargetMonthSummary, NicknameTotalSummary } from "./utils";

const TARGET_FETCH_CONCURRENCY = 6;

export type CollectionNicknameTargetBenchmark = {
  amount: number;
  configuredMonths: number;
  latestUpdatedAt: string | null;
  latestUpdatedBy: string | null;
  missingMonths: number;
  months: CollectionNicknameTargetMonthBenchmark[];
  requestedMonths: number;
};

export type CollectionNicknameTargetMonthBenchmark = {
  amount: number;
  configured: boolean;
  month: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type CollectionNicknameTargetBenchmarkState = {
  benchmarks: ReadonlyMap<string, CollectionNicknameTargetBenchmark>;
  completeCount: number;
  configuredCount: number;
  errorMessage: string | null;
  incompleteCount: number;
  loading: boolean;
  requestedMonths: number;
};

export type CollectionNicknameTargetMonth = {
  month: string;
};

const EMPTY_BENCHMARK: CollectionNicknameTargetBenchmark = {
  amount: 0,
  configuredMonths: 0,
  latestUpdatedAt: null,
  latestUpdatedBy: null,
  missingMonths: 0,
  months: [],
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

export function isCollectionNicknameTargetBenchmarkComplete(
  benchmark: CollectionNicknameTargetBenchmark,
): boolean {
  return benchmark.requestedMonths > 0
    && benchmark.configuredMonths === benchmark.requestedMonths
    && benchmark.missingMonths === 0;
}

export function getCollectionNicknameTargetEvaluationAmount(
  benchmark: CollectionNicknameTargetBenchmark,
): number {
  return isCollectionNicknameTargetBenchmarkComplete(benchmark) ? benchmark.amount : 0;
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
      latestUpdatedAt: benchmark?.latestUpdatedAt ?? null,
      latestUpdatedBy: benchmark?.latestUpdatedBy ?? null,
      missingMonths: toSafeNonNegativeInteger(benchmark?.missingMonths),
      months: (benchmark?.months ?? []).map((month: NicknameTargetMonthSummary) => ({
            amount: roundMoney(toSafeNonNegativeNumber(month.amount)),
            configured: month.configured,
            month: month.month,
            updatedAt: month.updatedAt,
            updatedBy: month.updatedBy,
          })),
      requestedMonths,
    });
  }

  return benchmarks;
}

export function buildCollectionNicknameTargetMonths(
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
      month: formatMonthKey(cursor.getUTCFullYear(), cursor.getUTCMonth()),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

export function addCollectionNicknameConfiguredMonthlyTarget(
  currentTotal: number,
  monthlyTarget: number,
): number {
  const safeCurrentTotal = Number(currentTotal);
  const safeMonthlyTarget = Number(monthlyTarget);
  return roundMoney(
    (Number.isFinite(safeCurrentTotal) ? Math.max(0, safeCurrentTotal) : 0)
    + (Number.isFinite(safeMonthlyTarget) ? Math.max(0, safeMonthlyTarget) : 0),
  );
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
  months: readonly CollectionNicknameTargetMonth[],
  signal: AbortSignal,
): Promise<[string, CollectionNicknameTargetBenchmark]> {
  let amount = 0;
  let configuredMonths = 0;
  let missingMonths = 0;
  const monthBenchmarks: CollectionNicknameTargetMonthBenchmark[] = [];

  for (const month of months) {
    const response = await getCollectionMonthlyTarget(
      {
        month: month.month,
        nickname,
      },
      { signal },
    );
    const monthlyTarget = Number(response.monthlyTarget);
    if (response.configured && Number.isFinite(monthlyTarget) && monthlyTarget >= 0) {
      amount = addCollectionNicknameConfiguredMonthlyTarget(amount, monthlyTarget);
      configuredMonths += 1;
      monthBenchmarks.push({
        amount: roundMoney(monthlyTarget),
        configured: true,
        month: month.month,
        updatedAt: null,
        updatedBy: null,
      });
    } else {
      missingMonths += 1;
      monthBenchmarks.push({
        amount: 0,
        configured: false,
        month: month.month,
        updatedAt: null,
        updatedBy: null,
      });
    }
  }

  return [
    normalizeCollectionNicknameTargetKey(nickname),
    {
      amount: roundMoney(amount),
      configuredMonths,
      latestUpdatedAt: null,
      latestUpdatedBy: null,
      missingMonths,
      months: monthBenchmarks,
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
    () => buildCollectionNicknameTargetMonths(fromDate, toDate),
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
    completeCount: 0,
    configuredCount: 0,
    errorMessage: null,
    incompleteCount: 0,
    loading: false,
    requestedMonths: 0,
  });

  useEffect(() => {
    if (!enabled || nicknames.length === 0 || months.length === 0) {
      setState({
        benchmarks: new Map(),
        completeCount: 0,
        configuredCount: 0,
        errorMessage: null,
        incompleteCount: 0,
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
        completeCount: prefetchedEntries.filter(([, benchmark]) => (
          isCollectionNicknameTargetBenchmarkComplete(benchmark) && benchmark.amount > 0
        )).length,
        configuredCount: prefetchedEntries.filter(([, benchmark]) => benchmark.configuredMonths > 0).length,
        errorMessage: null,
        incompleteCount: prefetchedEntries.filter(([, benchmark]) => (
          benchmark.requestedMonths > 0 && !isCollectionNicknameTargetBenchmarkComplete(benchmark)
        )).length,
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
        const configuredCount = entries.filter(([, benchmark]) => benchmark.configuredMonths > 0).length;
        setState({
          benchmarks,
          completeCount: entries.filter(([, benchmark]) => (
            isCollectionNicknameTargetBenchmarkComplete(benchmark) && benchmark.amount > 0
          )).length,
          configuredCount,
          errorMessage: null,
          incompleteCount: entries.filter(([, benchmark]) => (
            benchmark.requestedMonths > 0 && !isCollectionNicknameTargetBenchmarkComplete(benchmark)
          )).length,
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
          completeCount: 0,
          configuredCount: 0,
          errorMessage: parseApiError(error),
          incompleteCount: 0,
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
