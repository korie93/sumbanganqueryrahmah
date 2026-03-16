import {
  ensureJsonRow,
  rowScore,
  scoreRowDigits,
} from "./ai-search-query-utils";
import type {
  AiIntentEntities,
  AiSearchCandidateRow,
} from "./ai-search-types";

export type AiSearchKeywordContext = {
  keywordQuery: string;
  queryDigits: string;
  hasDigitsQuery: boolean;
};

export type AiSearchCandidateSelection = AiSearchKeywordContext & {
  best: AiSearchCandidateRow | null;
  bestScore: number;
};

export function buildAiSearchKeywordContext(
  query: string,
  entities: AiIntentEntities | undefined | null,
): AiSearchKeywordContext {
  const keywordTerms = [
    entities?.ic,
    entities?.account_no,
    entities?.phone,
    entities?.name,
  ].filter(Boolean) as string[];

  const keywordQuery = keywordTerms.length > 0 ? keywordTerms[0] : query;
  const queryDigits = keywordQuery.replace(/[^0-9]/g, "");

  return {
    keywordQuery,
    queryDigits,
    hasDigitsQuery: queryDigits.length >= 6,
  };
}

export function selectAiSearchCandidate(params: {
  entities: AiIntentEntities | undefined | null;
  keywordQuery: string;
  hasDigitsQuery: boolean;
  queryDigits: string;
  keywordResults: AiSearchCandidateRow[];
  fallbackDigitsResults: AiSearchCandidateRow[];
  vectorResults: AiSearchCandidateRow[];
}): AiSearchCandidateSelection {
  const {
    entities,
    keywordQuery: _keywordQuery,
    hasDigitsQuery,
    queryDigits,
    keywordResults,
    fallbackDigitsResults,
    vectorResults,
  } = params;

  let best: AiSearchCandidateRow | null = null;
  let bestScore = 0;

  if (hasDigitsQuery) {
    for (const row of [...keywordResults, ...fallbackDigitsResults]) {
      const scored = scoreRowDigits(row, queryDigits);
      if (scored.score > bestScore) {
        bestScore = scored.score;
        row.jsonDataJsonb = scored.parsed;
        best = row;
      }
    }
  } else {
    const resultMap = new Map<string, AiSearchCandidateRow>();
    for (const row of keywordResults) {
      resultMap.set(row.rowId, row);
    }
    for (const row of fallbackDigitsResults) {
      resultMap.set(row.rowId, row);
    }
    for (const row of vectorResults) {
      resultMap.set(row.rowId, row);
    }

    const scored = Array.from(resultMap.values())
      .map((row) => {
        const normalized = ensureJsonRow(row);
        return {
          row: normalized,
          score: rowScore(
            normalized,
            entities?.ic,
            entities?.name,
            entities?.account_no,
            entities?.phone,
          ),
        };
      })
      .sort((a, b) => b.score - a.score);

    best = scored.length > 0 ? scored[0].row : null;
    bestScore = scored.length > 0 ? scored[0].score : 0;
  }

  return {
    keywordQuery: _keywordQuery,
    queryDigits,
    hasDigitsQuery,
    best,
    bestScore,
  };
}

export function buildAiSearchDebugPayload(params: {
  query: string;
  keywordQuery: string;
  queryDigits: string;
  keywordResults: AiSearchCandidateRow[];
  fallbackDigitsResults: AiSearchCandidateRow[];
}) {
  return {
    query: params.query,
    keywordQuery: params.keywordQuery,
    queryDigits: params.queryDigits,
    keywordCount: params.keywordResults.length,
    fallbackDigitsCount: params.fallbackDigitsResults.length,
  };
}

export function buildAiBestCandidateDebugPayload(best: AiSearchCandidateRow | null) {
  if (!best) {
    return null;
  }

  const keys =
    best.jsonDataJsonb && typeof best.jsonDataJsonb === "object"
      ? Object.keys(best.jsonDataJsonb)
      : [];

  return {
    rowId: best.rowId,
    jsonType: typeof best.jsonDataJsonb,
    sampleKeys: keys.slice(0, 10),
  };
}
