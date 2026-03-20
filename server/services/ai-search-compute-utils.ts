import {
  selectAiSearchCandidate,
  buildAiSearchKeywordContext,
} from "./ai-search-candidate-utils";
import {
  deriveAiTravelDecision,
  resolveAiBranchLookup,
  type AiBranchLookupFns,
} from "./ai-search-branch-utils";
import {
  buildBranchSummary,
  buildExplanation,
  buildPersonSummary,
} from "./ai-search-explanation-utils";
import { resolveAiSearchIntent } from "./ai-search-intent-utils";
import {
  buildAiSearchAudit,
  buildAiSearchPayload,
  buildAiSuggestions,
  mapAiSearchPerson,
} from "./ai-search-result-utils";
import { buildFieldMatchSummary, parseIntentFallback } from "./ai-search-query-utils";
import type {
  AiIntent,
  AiIntentEntities,
  AiSearchCandidateRow,
  AiSearchResult,
  AiSearchStorage,
} from "./ai-search-types";

type CandidateResolutionStorage = Pick<
  AiSearchStorage,
  "aiDigitsSearch" | "aiKeywordSearch" | "aiNameSearch" | "semanticSearch"
>;

type ResultAssemblyStorage = Pick<AiSearchStorage, "aiFuzzySearch">;

export type AiSearchCandidateResolution = {
  intent: AiIntent;
  entities: AiIntentEntities;
  keywordQuery: string;
  queryDigits: string;
  hasDigitsQuery: boolean;
  keywordResults: AiSearchCandidateRow[];
  fallbackDigitsResults: AiSearchCandidateRow[];
  vectorResults: AiSearchCandidateRow[];
  best: AiSearchCandidateRow | null;
  bestScore: number;
};

export async function resolveAiSearchCandidates(params: {
  query: string;
  semanticSearchEnabled: boolean;
  aiTimeoutMs: number;
  storage: CandidateResolutionStorage;
  withAiCircuit: <T>(operation: () => Promise<T>) => Promise<T>;
  ollamaChat: (messages: import("../ai-ollama").OllamaMessage[], options?: Record<string, unknown>) => Promise<string>;
  ollamaEmbed: (text: string) => Promise<number[]>;
  intentMode?: string;
}): Promise<AiSearchCandidateResolution> {
  const intent = await resolveAiSearchIntent({
    query: params.query,
    timeoutMs: params.aiTimeoutMs,
    withAiCircuit: params.withAiCircuit,
    ollamaChat: params.ollamaChat,
    intentMode: params.intentMode,
  });
  const entities = intent.entities || {};
  const { keywordQuery, queryDigits, hasDigitsQuery } = buildAiSearchKeywordContext(
    params.query,
    entities,
  );
  const keywordResults = hasDigitsQuery
    ? await params.storage.aiKeywordSearch({ query: keywordQuery, limit: 10 })
    : await params.storage.aiNameSearch({ query: keywordQuery, limit: 10 });

  const rawFallbackEntities = parseIntentFallback(params.query).entities || {};
  const fallbackDigits =
    String(
      rawFallbackEntities.ic
      || rawFallbackEntities.account_no
      || rawFallbackEntities.phone
      || "",
    ).replace(/\D/g, "");

  let fallbackDigitsResults: AiSearchCandidateRow[] = [];
  if (!hasDigitsQuery && keywordResults.length === 0 && fallbackDigits.length >= 6) {
    fallbackDigitsResults = await params.storage.aiDigitsSearch({
      digits: fallbackDigits,
      limit: 25,
    });
  }

  let vectorResults: AiSearchCandidateRow[] = [];
  if (params.semanticSearchEnabled && !hasDigitsQuery) {
    try {
      const embedding = await params.withAiCircuit(() => params.ollamaEmbed(params.query));
      if (embedding.length > 0) {
        vectorResults = await params.storage.semanticSearch({ embedding, limit: 10 });
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

  return {
    intent,
    entities,
    keywordQuery,
    queryDigits,
    hasDigitsQuery,
    keywordResults,
    fallbackDigitsResults,
    vectorResults,
    best,
    bestScore,
  };
}

export async function buildResolvedAiSearchResult(params: {
  query: string;
  aiTimeoutMs: number;
  intent: AiIntent;
  best: AiSearchCandidateRow | null;
  bestScore: number;
  hasDigitsQuery: boolean;
  keywordResults: AiSearchCandidateRow[];
  fallbackDigitsResults: AiSearchCandidateRow[];
  fallbackPerson: AiSearchCandidateRow | null;
  storage: ResultAssemblyStorage;
  branchLookups: AiBranchLookupFns;
  debugEnabled?: boolean;
}): Promise<AiSearchResult> {
  const entities = params.intent.entities || {};
  const hasPersonId = Boolean(entities.ic || entities.account_no || entities.phone);
  const shouldFindBranch = params.intent.need_nearest_branch || hasPersonId;
  const branchTimeoutMs = Math.max(700, Math.min(2200, Math.floor(params.aiTimeoutMs * 0.35)));

  const { nearestBranch, missingCoords, branchTextSearch } = await resolveAiBranchLookup({
    query: params.query,
    shouldFindBranch,
    hasPersonId,
    best: params.best,
    fallbackPerson: params.fallbackPerson,
    keywordResults: params.keywordResults,
    fallbackDigitsResults: params.fallbackDigitsResults,
    branchTimeoutMs,
    debugEnabled: params.debugEnabled === true,
    lookups: params.branchLookups,
  });

  const { decision, travelMode, estimatedMinutes } = deriveAiTravelDecision(
    nearestBranch?.distanceKm,
  );

  const person = mapAiSearchPerson(params.best);

  let suggestions: string[] = [];
  if ((!person || params.bestScore < 6) && !params.hasDigitsQuery) {
    const fuzzyResults = await params.storage.aiFuzzySearch({ query: params.query, limit: 5 });
    suggestions = buildAiSuggestions(params.query, fuzzyResults);
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
      !params.hasDigitsQuery && person && typeof person === "object"
        ? buildFieldMatchSummary(person, params.query)
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
      query: params.query,
      intent: params.intent,
      person,
      nearestBranch,
      decision,
      travelMode,
      estimatedMinutes,
      usedLastPerson: !params.best && !!params.fallbackPerson,
    }),
  };
}
