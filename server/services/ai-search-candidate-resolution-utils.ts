import {
  selectAiSearchCandidate,
  buildAiSearchKeywordContext,
} from "./ai-search-candidate-utils";
import { resolveAiSearchIntent } from "./ai-search-intent-utils";
import { parseIntentFallback } from "./ai-search-query-utils";
import type {
  AiIntent,
  AiIntentEntities,
  AiSearchCandidateRow,
  AiSearchStorage,
} from "./ai-search-types";

type CandidateResolutionStorage = Pick<
  AiSearchStorage,
  "aiDigitsSearch" | "aiKeywordSearch" | "aiNameSearch" | "semanticSearch"
>;

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
  ollamaChat: (
    messages: import("../ai-ollama").OllamaMessage[],
    options?: Record<string, unknown>,
  ) => Promise<string>;
  ollamaEmbed: (text: string) => Promise<number[]>;
  intentMode?: string | undefined;
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
