import type { PostgresStorage } from "../storage-postgres";
import type { AiBranchLookupFns } from "./ai-search-branch-utils";
import { withTimeout } from "./ai-search-runtime-utils";

type AiBranchLookupStorage = Pick<
  PostgresStorage,
  "findBranchesByText" | "findBranchesByPostcode" | "getNearestBranches" | "getPostcodeLatLng"
>;

async function safeAiLookup<T>(operation: () => Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  try {
    return await withTimeout(operation(), timeoutMs);
  } catch {
    return fallback;
  }
}

export function createAiSafeBranchLookups(storage: AiBranchLookupStorage): AiBranchLookupFns {
  return {
    findBranchesByText: (text, limit, timeoutMs) =>
      safeAiLookup(() => storage.findBranchesByText({ query: text, limit }), timeoutMs, []),
    findBranchesByPostcode: (postcode, limit, timeoutMs) =>
      safeAiLookup(() => storage.findBranchesByPostcode({ postcode, limit }), timeoutMs, []),
    findBranchesByPostcodeFallback: (postcode, limit) =>
      storage.findBranchesByPostcode({ postcode, limit }),
    nearestBranches: (lat, lng, limit, timeoutMs) =>
      safeAiLookup(() => storage.getNearestBranches({ lat, lng, limit }), timeoutMs, []),
    postcodeLatLng: (postcode, timeoutMs) =>
      safeAiLookup(() => storage.getPostcodeLatLng(postcode), timeoutMs, null),
  };
}
