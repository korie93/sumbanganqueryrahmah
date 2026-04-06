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
import {
  buildAiSearchAudit,
  buildAiSearchPayload,
  buildAiSuggestions,
  mapAiSearchPerson,
} from "./ai-search-result-utils";
import { buildFieldMatchSummary } from "./ai-search-query-utils";
import type {
  AiIntent,
  AiSearchCandidateRow,
  AiSearchResult,
  AiSearchStorage,
} from "./ai-search-types";

type ResultAssemblyStorage = Pick<AiSearchStorage, "aiFuzzySearch">;

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
