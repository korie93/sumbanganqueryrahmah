import { AsyncLocalStorage } from "node:async_hooks";
import type { RuntimeConfig } from "../config/runtime-config-types";

type DbQueryProfileLogger = {
  warn: (message: string, meta?: Record<string, unknown>) => void;
};

type DbQueryProfileRequestMeta = {
  method: string;
  path: string;
  requestId: string;
};

type DbQueryProfileStatementSummary = {
  count: number;
  maxDurationMs: number;
  normalized: string;
  sample: string;
  totalDurationMs: number;
};

type DbQueryProfileRequestSummary = {
  method: string;
  path: string;
  possibleNPlusOne: boolean;
  queryCount: number;
  repeatedStatements: DbQueryProfileStatementSummary[];
  requestElapsedMs: number | null;
  requestId: string;
  statusCode: number;
  totalQueryDurationMs: number;
  uniqueStatementCount: number;
};

type DbQueryProfilerOptions = RuntimeConfig["runtime"]["dbQueryProfiling"] & {
  logger: DbQueryProfileLogger;
  random?: () => number;
};

type DbQueryProfileRequestState = {
  method: string;
  path: string;
  queryCount: number;
  requestId: string;
  statementMap: Map<string, DbQueryProfileStatementState>;
  totalQueryDurationMs: number;
};

type DbQueryProfileStatementState = {
  count: number;
  maxDurationMs: number;
  sample: string;
  totalDurationMs: number;
};

const dbQueryProfilerPatchedSymbol = Symbol("sqr.dbQueryProfiler.patched");
const dbQueryProfilerOriginalQuerySymbol = Symbol("sqr.dbQueryProfiler.originalQuery");
const MAX_QUERY_SAMPLE_LENGTH = 220;

type InstrumentablePgQueryPrototype = {
  query: (...args: unknown[]) => unknown;
  [dbQueryProfilerOriginalQuerySymbol]?: (...args: unknown[]) => unknown;
  [dbQueryProfilerPatchedSymbol]?: boolean;
};

function roundToTwoDecimals(value: number): number {
  return Number(value.toFixed(2));
}

function stripSqlComments(sqlText: string): string {
  return sqlText
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");
}

export function normalizeDbQueryProfileStatement(sqlText: string): string {
  return stripSqlComments(sqlText)
    .replace(/\$[0-9]+\b/g, "?")
    .replace(/\b\d+\b/g, "?")
    .replace(/'(?:''|[^'])*'/g, "?")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_SAMPLE_LENGTH);
}

export function summarizeDbQueryProfileSample(sqlText: string): string {
  return stripSqlComments(sqlText)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_SAMPLE_LENGTH);
}

export function shouldSampleDbQueryProfile(samplePercent: number, randomValue: number): boolean {
  if (samplePercent <= 0) {
    return false;
  }
  if (samplePercent >= 100) {
    return true;
  }

  return randomValue * 100 < samplePercent;
}

function resolvePgQueryText(args: unknown[]): string | null {
  const first = args[0];
  if (typeof first === "string") {
    return first;
  }
  if (first && typeof first === "object" && "text" in first) {
    const candidate = (first as { text?: unknown }).text;
    return typeof candidate === "string" ? candidate : null;
  }

  return null;
}

function findLastFunctionArgumentIndex(args: unknown[]): number {
  for (let index = args.length - 1; index >= 0; index -= 1) {
    if (typeof args[index] === "function") {
      return index;
    }
  }

  return -1;
}

function buildDbQueryProfileSummary(
  state: DbQueryProfileRequestState,
  options: DbQueryProfilerOptions,
  statusCode: number,
  requestElapsedMs: number | null,
): DbQueryProfileRequestSummary | null {
  const repeatedStatements = Array.from(state.statementMap.entries())
    .map(([normalized, entry]) => ({
      normalized,
      sample: entry.sample,
      count: entry.count,
      totalDurationMs: roundToTwoDecimals(entry.totalDurationMs),
      maxDurationMs: roundToTwoDecimals(entry.maxDurationMs),
    }))
    .filter((entry) => entry.count >= options.repeatedStatementThreshold)
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return right.totalDurationMs - left.totalDurationMs;
    })
    .slice(0, options.maxLoggedStatements);

  const totalQueryDurationMs = roundToTwoDecimals(state.totalQueryDurationMs);
  const shouldLog =
    repeatedStatements.length > 0 ||
    state.queryCount >= options.minQueryCount ||
    totalQueryDurationMs >= options.minTotalQueryMs;

  if (!shouldLog) {
    return null;
  }

  return {
    requestId: state.requestId,
    method: state.method,
    path: state.path,
    statusCode,
    requestElapsedMs: requestElapsedMs == null ? null : roundToTwoDecimals(requestElapsedMs),
    queryCount: state.queryCount,
    uniqueStatementCount: state.statementMap.size,
    totalQueryDurationMs,
    possibleNPlusOne:
      repeatedStatements.length > 0 && state.queryCount >= options.minQueryCount,
    repeatedStatements,
  };
}

export function instrumentPgClientQueryMethod(
  clientPrototype: InstrumentablePgQueryPrototype,
  recordQuerySample: (sqlText: string, durationMs: number) => void,
): () => void {
  if (clientPrototype[dbQueryProfilerPatchedSymbol]) {
    return () => undefined;
  }

  const originalQuery = clientPrototype.query;
  clientPrototype[dbQueryProfilerOriginalQuerySymbol] = originalQuery;
  clientPrototype[dbQueryProfilerPatchedSymbol] = true;

  clientPrototype.query = function profiledQuery(...args: unknown[]) {
    const sqlText = resolvePgQueryText(args);
    if (!sqlText) {
      return originalQuery.apply(this, args);
    }

    const startedAt = process.hrtime.bigint();
    const finalize = () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      recordQuerySample(sqlText, durationMs);
    };

    const callbackIndex = findLastFunctionArgumentIndex(args);
    const callbackWrappedArgs = [...args];
    if (callbackIndex >= 0) {
      const originalCallback = callbackWrappedArgs[callbackIndex] as (...callbackArgs: unknown[]) => unknown;
      callbackWrappedArgs[callbackIndex] = (...callbackArgs: unknown[]) => {
        finalize();
        return originalCallback(...callbackArgs);
      };
      return originalQuery.apply(this, callbackWrappedArgs);
    }

    let result: unknown;
    try {
      result = originalQuery.apply(this, args);
    } catch (error) {
      finalize();
      throw error;
    }

    if (result && typeof result === "object" && "then" in result) {
      return (result as Promise<unknown>).then(
        (value) => {
          finalize();
          return value;
        },
        (error) => {
          finalize();
          throw error;
        },
      );
    }

    finalize();
    return result;
  };

  return () => {
    if (!clientPrototype[dbQueryProfilerPatchedSymbol]) {
      return;
    }

    const storedOriginalQuery = clientPrototype[dbQueryProfilerOriginalQuerySymbol];
    if (storedOriginalQuery) {
      clientPrototype.query = storedOriginalQuery;
    }
    delete clientPrototype[dbQueryProfilerOriginalQuerySymbol];
    delete clientPrototype[dbQueryProfilerPatchedSymbol];
  };
}

export function createDbQueryProfiler(options: DbQueryProfilerOptions) {
  const requestStorage = new AsyncLocalStorage<DbQueryProfileRequestState | null>();
  const random = options.random ?? Math.random;

  const recordQuerySample = (sqlText: string, durationMs: number) => {
    const state = requestStorage.getStore();
    if (!state) {
      return;
    }

    const normalized = normalizeDbQueryProfileStatement(sqlText);
    const existing = state.statementMap.get(normalized);
    if (existing) {
      existing.count += 1;
      existing.totalDurationMs += durationMs;
      existing.maxDurationMs = Math.max(existing.maxDurationMs, durationMs);
    } else {
      state.statementMap.set(normalized, {
        count: 1,
        sample: summarizeDbQueryProfileSample(sqlText),
        totalDurationMs: durationMs,
        maxDurationMs: durationMs,
      });
    }

    state.queryCount += 1;
    state.totalQueryDurationMs += durationMs;
  };

  return {
    instrumentPgClientQueryMethod(clientPrototype: InstrumentablePgQueryPrototype) {
      if (!options.enabled) {
        return () => undefined;
      }

      return instrumentPgClientQueryMethod(clientPrototype, recordQuerySample);
    },

    runWithRequestProfiling<T>(meta: DbQueryProfileRequestMeta, fn: () => T): T {
      if (!options.enabled || !shouldSampleDbQueryProfile(options.samplePercent, random())) {
        return fn();
      }

      return requestStorage.run({
        requestId: meta.requestId,
        method: meta.method,
        path: meta.path,
        queryCount: 0,
        totalQueryDurationMs: 0,
        statementMap: new Map<string, DbQueryProfileStatementState>(),
      }, fn);
    },

    flushRequestProfile(statusCode: number, requestElapsedMs: number | null = null) {
      if (!options.enabled) {
        return;
      }

      const state = requestStorage.getStore();
      if (!state) {
        return;
      }

      const summary = buildDbQueryProfileSummary(state, options, statusCode, requestElapsedMs);
      if (!summary) {
        return;
      }

      options.logger.warn(
        summary.possibleNPlusOne
          ? "Database query profiling flagged a possible N+1 request pattern"
          : "Database query profiling observed a high-query request",
        summary,
      );
    },
  };
}
