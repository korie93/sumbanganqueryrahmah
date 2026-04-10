import {
  buildAiBestCandidateDebugPayload,
  buildAiSearchDebugPayload,
} from "./ai-search-candidate-utils";
import {
  buildResolvedAiSearchResult,
  resolveAiSearchCandidates,
} from "./ai-search-compute-utils";
import { createAiSafeBranchLookups } from "./ai-search-io-utils";
import {
  buildAiSearchResolveErrorResponse,
  getFreshLastAiPerson,
  getFreshTimedCacheEntry,
  getOrCreateAiSearchInflight,
  resolveAiSearchRequestTimeoutMs,
  shouldLogAiSearchResolveError,
  sweepTimedCacheEntries,
  withTimeout,
} from "./ai-search-runtime-utils";
import type {
  AiSearchResponse,
  AiSearchResult,
  AiSearchRuntimeSettings,
  AiSearchServiceOptions,
  LastAiPersonEntry,
  SearchCacheEntry,
} from "./ai-search-types";
import { runtimeConfig } from "../config/runtime";
import { logger } from "../lib/logger";

export class AiSearchService {
  private readonly debugGlobal = globalThis as typeof globalThis & {
    __searchInflightMap?: Map<string, Promise<AiSearchResult>>;
  };
  private readonly searchCache = new Map<string, SearchCacheEntry>();
  private readonly searchInflight = new Map<string, Promise<AiSearchResult>>();
  private readonly lastAiPerson = new Map<string, LastAiPersonEntry>();
  private readonly searchCacheMs = 60_000;
  private readonly searchFastTimeoutMs = 5500;
  private readonly maxSearchCacheEntries: number;
  private readonly maxLastAiPersonEntries: number;
  private readonly lastAiPersonTtlMs: number;
  private readonly branchLookups: ReturnType<typeof createAiSafeBranchLookups>;

  constructor(private readonly options: AiSearchServiceOptions) {
    this.maxSearchCacheEntries = runtimeConfig.ai.cache.maxSearchEntries;
    this.maxLastAiPersonEntries = runtimeConfig.ai.cache.maxLastPersonEntries;
    this.lastAiPersonTtlMs = runtimeConfig.ai.cache.lastPersonTtlMs;
    this.branchLookups = createAiSafeBranchLookups(options.storage);
    this.debugGlobal.__searchInflightMap = this.searchInflight;
  }

  sweepCaches(now = Date.now()) {
    sweepTimedCacheEntries(
      this.searchCache,
      this.searchCacheMs,
      Math.max(10, this.maxSearchCacheEntries),
      now,
    );
    sweepTimedCacheEntries(
      this.lastAiPerson,
      this.lastAiPersonTtlMs,
      Math.max(10, this.maxLastAiPersonEntries),
      now,
    );
  }

  clearSearchCache() {
    this.searchCache.clear();
  }

  async resolveSearchRequest(params: {
    query: string;
    userKey: string;
    runtimeSettings: AiSearchRuntimeSettings;
  }): Promise<AiSearchResponse> {
    const { query, userKey, runtimeSettings } = params;
    const cacheKey = `search:${query.toLowerCase()}`;
    const cached = getFreshTimedCacheEntry(this.searchCache, cacheKey, this.searchCacheMs);
    if (cached) {
      return {
        statusCode: 200,
        body: cached.payload,
        audit: cached.audit,
      };
    }

    const inflight = getOrCreateAiSearchInflight({
      cacheKey,
      inflight: this.searchInflight,
      cache: this.searchCache,
      maxCacheEntries: Math.max(10, this.maxSearchCacheEntries),
      compute: () =>
        this.options.withAiCircuit(() =>
          this.computeAiSearch(
            query,
            userKey,
            runtimeSettings.semanticSearchEnabled,
            runtimeSettings.aiTimeoutMs,
          ),
        ),
    });

    try {
      const configuredTimeout = runtimeSettings.aiTimeoutMs || this.searchFastTimeoutMs;
      const timeoutMs = resolveAiSearchRequestTimeoutMs(configuredTimeout);
      const result = await withTimeout(inflight, timeoutMs);
      return {
        statusCode: 200,
        body: result.payload,
        audit: result.audit,
      };
    } catch (error: unknown) {
      if (shouldLogAiSearchResolveError(error)) {
        logger.error("AI search compute failed", { error });
      }
      return buildAiSearchResolveErrorResponse(error);
    }
  }

  private async computeAiSearch(
    query: string,
    userKey: string,
    semanticSearchEnabled: boolean,
    aiTimeoutMs: number,
  ): Promise<AiSearchResult> {
    const resolution = await resolveAiSearchCandidates({
      query,
      semanticSearchEnabled,
      aiTimeoutMs,
      storage: this.options.storage,
      withAiCircuit: this.options.withAiCircuit,
      ollamaChat: this.options.ollamaChat,
      ollamaEmbed: this.options.ollamaEmbed,
      intentMode: runtimeConfig.ai.intentMode ?? undefined,
    });

    if (runtimeConfig.ai.debugEnabled) {
      logger.debug(
        "AI search candidate debug",
        buildAiSearchDebugPayload({
          query,
          keywordQuery: resolution.keywordQuery,
          queryDigits: resolution.queryDigits,
          keywordResults: resolution.keywordResults,
          fallbackDigitsResults: resolution.fallbackDigitsResults,
        }),
      );
    }

    if (runtimeConfig.ai.debugEnabled && resolution.best) {
      const bestCandidateDebugPayload = buildAiBestCandidateDebugPayload(resolution.best);
      if (bestCandidateDebugPayload) {
        logger.debug("AI search best row", bestCandidateDebugPayload);
      }
    }

    if (resolution.best) {
      this.lastAiPerson.set(userKey, { ts: Date.now(), row: resolution.best });
      sweepTimedCacheEntries(
        this.lastAiPerson,
        this.lastAiPersonTtlMs,
        Math.max(10, this.maxLastAiPersonEntries),
      );
    }

    const fallbackPerson = getFreshLastAiPerson(this.lastAiPerson, userKey, this.lastAiPersonTtlMs);
    return buildResolvedAiSearchResult({
      query,
      aiTimeoutMs,
      intent: resolution.intent,
      best: resolution.best,
      bestScore: resolution.bestScore,
      hasDigitsQuery: resolution.hasDigitsQuery,
      keywordResults: resolution.keywordResults,
      fallbackDigitsResults: resolution.fallbackDigitsResults,
      fallbackPerson,
      storage: this.options.storage,
      branchLookups: this.branchLookups,
      debugEnabled: runtimeConfig.ai.debugEnabled,
    });
  }

}
