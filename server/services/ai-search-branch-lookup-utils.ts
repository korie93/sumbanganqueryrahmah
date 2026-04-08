import {
  extractCustomerLocationHint,
  extractCustomerPostcode,
  extractLatLng,
  hasPostcodeCoord,
  isLatLng,
  isNonEmptyString,
  normalizeLocationHint,
  toObjectJson,
} from "./ai-search-query-utils";
import { logger } from "../lib/logger";
import type {
  AiBranchSearchResult,
  AiNearestBranchResult,
  AiPostcodeCoord,
  AiSearchCandidateRow,
} from "./ai-search-types";

export type AiResolvedBranch = (AiBranchSearchResult & { distanceKm?: number }) | AiNearestBranchResult;

export type AiBranchLookupResult = {
  nearestBranch: AiResolvedBranch | null;
  missingCoords: boolean;
  branchTextSearch: boolean;
};

export type AiBranchLookupFns = {
  findBranchesByText: (text: string, limit: number, timeoutMs: number) => Promise<AiBranchSearchResult[]>;
  findBranchesByPostcode: (
    postcode: string,
    limit: number,
    timeoutMs: number,
  ) => Promise<AiBranchSearchResult[]>;
  findBranchesByPostcodeFallback?: (
    postcode: string,
    limit: number,
  ) => Promise<AiBranchSearchResult[]>;
  nearestBranches: (
    lat: number,
    lng: number,
    limit: number,
    timeoutMs: number,
  ) => Promise<AiNearestBranchResult[]>;
  postcodeLatLng: (postcode: string, timeoutMs: number) => Promise<AiPostcodeCoord | null>;
};

export type ResolveAiBranchLookupParams = {
  query: string;
  shouldFindBranch: boolean;
  hasPersonId: boolean;
  best: AiSearchCandidateRow | null;
  fallbackPerson: AiSearchCandidateRow | null;
  keywordResults: AiSearchCandidateRow[];
  fallbackDigitsResults: AiSearchCandidateRow[];
  branchTimeoutMs: number;
  lookups: AiBranchLookupFns;
  debugEnabled?: boolean;
};

const BRANCH_TEXT_QUERY_PATTERN =
  /cawangan|branch|terdekat|nearest|lokasi|alamat|di|yang|paling|dekat/gi;

function extractBranchLookupText(query: string): string {
  return normalizeLocationHint(query.replace(BRANCH_TEXT_QUERY_PATTERN, " "));
}

function selectLocationSource(params: {
  best: AiSearchCandidateRow | null;
  keywordResults: AiSearchCandidateRow[];
  fallbackDigitsResults: AiSearchCandidateRow[];
  personForBranch: AiSearchCandidateRow;
}) {
  let data = toObjectJson(params.personForBranch.jsonDataJsonb) || {};
  const basePostcode = extractCustomerPostcode(data);
  const baseHint = normalizeLocationHint(extractCustomerLocationHint(data));

  if (basePostcode || baseHint.length >= 3) {
    return data;
  }

  for (const candidate of [params.best, ...params.keywordResults, ...params.fallbackDigitsResults]) {
    const candidateData = toObjectJson(candidate?.jsonDataJsonb);
    if (!candidateData) continue;
    const candidatePostcode = extractCustomerPostcode(candidateData);
    const candidateHint = normalizeLocationHint(extractCustomerLocationHint(candidateData));
    if (candidatePostcode || candidateHint.length >= 3) {
      data = candidateData;
      break;
    }
  }

  return data;
}

export async function resolveAiBranchLookup(
  params: ResolveAiBranchLookupParams,
): Promise<AiBranchLookupResult> {
  const {
    query,
    shouldFindBranch,
    hasPersonId,
    best,
    fallbackPerson,
    keywordResults,
    fallbackDigitsResults,
    branchTimeoutMs,
    lookups,
    debugEnabled = false,
  } = params;

  if (!shouldFindBranch) {
    return {
      nearestBranch: null,
      missingCoords: false,
      branchTextSearch: false,
    };
  }

  const branchTextPreferred = !hasPersonId;
  const personForBranch = branchTextPreferred
    ? null
    : (best || (!hasPersonId ? fallbackPerson : null) || null);

  let nearestBranch: AiResolvedBranch | null = null;
  let missingCoords = false;
  let branchTextSearch = false;

  try {
    if (branchTextPreferred) {
      const locationHint = extractBranchLookupText(query);
      branchTextSearch = true;
      if (locationHint.length >= 3) {
        const branches = await lookups.findBranchesByText(locationHint, 3, branchTimeoutMs);
        nearestBranch = branches[0] || null;
      }

      return {
        nearestBranch,
        missingCoords,
        branchTextSearch,
      };
    }

    if (!personForBranch) {
      return {
        nearestBranch,
        missingCoords,
        branchTextSearch,
      };
    }

    const coords = extractLatLng(toObjectJson(personForBranch.jsonDataJsonb) || {});
    if (isLatLng(coords)) {
      const branches = await lookups.nearestBranches(coords.lat, coords.lng, 1, branchTimeoutMs);
      nearestBranch = branches[0] || null;
      return {
        nearestBranch,
        missingCoords,
        branchTextSearch,
      };
    }

    const data = selectLocationSource({
      best,
      keywordResults,
      fallbackDigitsResults,
      personForBranch,
    });

    let postcodeWasProvided = false;
    const postcode = extractCustomerPostcode(data);
    if (postcode) {
      postcodeWasProvided = true;
      if (isNonEmptyString(postcode)) {
        const pc = await lookups.postcodeLatLng(postcode, branchTimeoutMs);
        if (hasPostcodeCoord(pc)) {
          const branches = await lookups.nearestBranches(pc.lat, pc.lng, 1, branchTimeoutMs);
          nearestBranch = branches[0] || null;
          if (debugEnabled) {
            logger.debug("AI search postcode coordinate lookup", {
              postcode,
              lat: pc.lat,
              lng: pc.lng,
              branchCount: branches.length,
            });
          }
        } else {
          let branches = await lookups.findBranchesByPostcode(postcode, 1, branchTimeoutMs);
          if (!branches.length && lookups.findBranchesByPostcodeFallback) {
            try {
              branches = await lookups.findBranchesByPostcodeFallback(postcode, 1);
            } catch {
              branches = [];
            }
          }

          nearestBranch = branches[0] || null;
          if (debugEnabled) {
            logger.debug("AI search postcode text lookup", {
              postcode,
              branchCount: branches.length,
              branch: branches[0]?.name || null,
            });
          }
          if (!nearestBranch) {
            missingCoords = false;
          }
        }
      } else {
        missingCoords = true;
      }
    } else {
      missingCoords = true;
    }

    if (!nearestBranch && missingCoords && !postcodeWasProvided) {
      const hint = normalizeLocationHint(extractCustomerLocationHint(data));
      if (hint.length >= 3) {
        branchTextSearch = true;
        const branches = await lookups.findBranchesByText(hint, 1, branchTimeoutMs);
        nearestBranch = branches[0] ? branches[0] : null;
      }
    }
  } catch {
    missingCoords = true;
    nearestBranch = null;
  }

  return {
    nearestBranch,
    missingCoords,
    branchTextSearch,
  };
}
