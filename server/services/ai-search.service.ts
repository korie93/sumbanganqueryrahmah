import {
  buildAiBestCandidateDebugPayload,
  buildAiSearchDebugPayload,
  buildAiSearchKeywordContext,
  selectAiSearchCandidate,
} from "./ai-search-candidate-utils";
import {
  deriveAiTravelDecision,
  resolveAiBranchLookup,
} from "./ai-search-branch-utils";
import {
  buildBranchSummary,
  buildExplanation,
  buildPersonSummary,
} from "./ai-search-explanation-utils";
import {
  buildFieldMatchSummary,
} from "./ai-search-query-utils";
import { createAiSafeBranchLookups } from "./ai-search-io-utils";
import { resolveAiSearchIntent } from "./ai-search-intent-utils";
import {
  buildAiSearchAudit,
  buildAiSearchPayload,
  buildAiSuggestions,
  mapAiSearchPerson,
} from "./ai-search-result-utils";
import {
  buildAiSearchResolveErrorResponse,
  getFreshLastAiPerson,
  getFreshTimedCacheEntry,
  getOrCreateAiSearchInflight,
  shouldLogAiSearchResolveError,
  sweepTimedCacheEntries,
  withTimeout,
} from "./ai-search-runtime-utils";
import type {
  AiSearchCandidateRow,
  AiSearchResponse,
  AiSearchResult,
  AiSearchRuntimeSettings,
  AiSearchServiceOptions,
  LastAiPersonEntry,
  SearchCacheEntry,
} from "./ai-search-types";

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
    this.maxSearchCacheEntries = Number(
      process.env.SQR_MAX_SEARCH_CACHE_ENTRIES ?? (options.lowMemoryMode ? "60" : "180"),
    );
    this.maxLastAiPersonEntries = Number(
      process.env.SQR_MAX_AI_LAST_PERSON_ENTRIES ?? (options.lowMemoryMode ? "40" : "120"),
    );
    this.lastAiPersonTtlMs = Number(process.env.SQR_AI_LAST_PERSON_TTL_MS ?? "1800000");
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
      const timeoutMs = Math.max(1000, Math.min(configuredTimeout, configuredTimeout - 1200));
      const result = await withTimeout(inflight, timeoutMs);
      return {
        statusCode: 200,
        body: result.payload,
        audit: result.audit,
      };
    } catch (error: unknown) {
      if (shouldLogAiSearchResolveError(error)) {
        const errorMessage = error instanceof Error ? error.message : String(error ?? "");
        console.error("AI search compute failed:", errorMessage || error);
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
    const intent = await resolveAiSearchIntent({
      query,
      timeoutMs: aiTimeoutMs,
      withAiCircuit: this.options.withAiCircuit,
      ollamaChat: this.options.ollamaChat,
      intentMode: process.env.AI_INTENT_MODE,
    });
    const entities = intent.entities || {};
    const { keywordQuery, queryDigits, hasDigitsQuery } = buildAiSearchKeywordContext(query, entities);
    const keywordResults = hasDigitsQuery
      ? await this.options.storage.aiKeywordSearch({ query: keywordQuery, limit: 10 })
      : await this.options.storage.aiNameSearch({ query: keywordQuery, limit: 10 });
    let fallbackDigitsResults: AiSearchCandidateRow[] = [];

    if (!hasDigitsQuery && keywordResults.length === 0 && queryDigits.length >= 6) {
      fallbackDigitsResults = await this.options.storage.aiDigitsSearch({
        digits: queryDigits,
        limit: 25,
      });
    }

    if (process.env.AI_DEBUG === "1") {
      console.log(
        "AI_SEARCH DEBUG",
        buildAiSearchDebugPayload({
          query,
          keywordQuery,
          queryDigits,
          keywordResults,
          fallbackDigitsResults,
        }),
      );
    }

    let vectorResults: AiSearchCandidateRow[] = [];
    if (semanticSearchEnabled && !hasDigitsQuery) {
      try {
        const embedding = await this.options.withAiCircuit(() => this.options.ollamaEmbed(query));
        if (embedding.length > 0) {
          vectorResults = await this.options.storage.semanticSearch({ embedding, limit: 10 });
        }
      } catch {
        vectorResults = [];
      }
    }

    const { best, bestScore } = selectAiSearchCandidate({
      entities,
      keywordQuery,
      hasDigitsQuery,
      queryDigits,
      keywordResults,
      fallbackDigitsResults,
      vectorResults,
    });

    if (process.env.AI_DEBUG === "1" && best) {
      console.log("AI_SEARCH BEST ROW", buildAiBestCandidateDebugPayload(best));
    }

    if (best) {
      this.lastAiPerson.set(userKey, { ts: Date.now(), row: best });
      sweepTimedCacheEntries(
        this.lastAiPerson,
        this.lastAiPersonTtlMs,
        Math.max(10, this.maxLastAiPersonEntries),
      );
    }

    const fallbackPerson = getFreshLastAiPerson(this.lastAiPerson, userKey, this.lastAiPersonTtlMs);
    const hasPersonId = Boolean(entities.ic || entities.account_no || entities.phone);
    const shouldFindBranch = intent.need_nearest_branch || hasPersonId;
    const branchTimeoutMs = Math.max(700, Math.min(2200, Math.floor(aiTimeoutMs * 0.35)));
    const { nearestBranch, missingCoords, branchTextSearch } = await resolveAiBranchLookup({
      query,
      shouldFindBranch,
      hasPersonId,
      best,
      fallbackPerson,
      keywordResults,
      fallbackDigitsResults,
      branchTimeoutMs,
      debugEnabled: process.env.AI_DEBUG === "1",
      lookups: this.branchLookups,
    });
    const { decision, travelMode, estimatedMinutes } = deriveAiTravelDecision(
      nearestBranch?.distanceKm,
    );

    const person = mapAiSearchPerson(best);

    let suggestions: string[] = [];
    if ((!person || bestScore < 6) && !hasDigitsQuery) {
      const fuzzyResults = await this.options.storage.aiFuzzySearch({ query, limit: 5 });
      suggestions = buildAiSuggestions(query, fuzzyResults);
    }

    const personSummary = buildPersonSummary(person);
    const branchSummary = buildBranchSummary(nearestBranch);
    const explanation = buildExplanation({
      decision,
      distanceKm: nearestBranch?.distanceKm ?? null,
      branch: nearestBranch?.name ?? null,
      personSummary,
      branchSummary,
      estimatedMinutes,
      travelMode,
      missingCoords,
      suggestions,
      matchFields:
        !hasDigitsQuery && person && typeof person === "object"
          ? buildFieldMatchSummary(person, query)
          : [],
      branchTextSearch,
    });

    return {
      payload: buildAiSearchPayload({
        person,
        nearestBranch,
        decision,
        explanation,
        travelMode,
        estimatedMinutes,
      }),
      audit: buildAiSearchAudit({
        query,
        intent,
        person,
        nearestBranch,
        decision,
        travelMode,
        estimatedMinutes,
        usedLastPerson: !best && !!fallbackPerson,
      }),
    };
  }

}
