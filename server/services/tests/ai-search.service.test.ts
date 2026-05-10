import assert from "node:assert/strict";
import test from "node:test";
import { runtimeConfig } from "../../config/runtime";
import { AiSearchService } from "../ai-search.service";
import type { AiSearchResult, AiSearchServiceOptions } from "../ai-search-types";

type AiSearchDebugGlobal = typeof globalThis & {
  __searchInflightMap?: Map<string, Promise<AiSearchResult>>;
};

function createAiSearchServiceOptions(): AiSearchServiceOptions {
  return {
    storage: {
      aiDigitsSearch: async () => [],
      aiFuzzySearch: async () => [],
      aiKeywordSearch: async () => [],
      aiNameSearch: async () => [],
      findBranchesByPostcode: async () => [],
      findBranchesByText: async () => [],
      getNearestBranches: async () => [],
      getPostcodeLatLng: async () => null,
      semanticSearch: async () => [],
    },
    withAiCircuit: async (operation) => operation(),
    ollamaChat: async () => "",
    ollamaEmbed: async () => [],
    defaultAiTimeoutMs: 5_000,
    lowMemoryMode: true,
  };
}

test("AiSearchService only exposes inflight debug state when AI debug is enabled", () => {
  const debugGlobal = globalThis as AiSearchDebugGlobal;
  const originalDebugEnabled = runtimeConfig.ai.debugEnabled;

  try {
    debugGlobal.__searchInflightMap = new Map();
    runtimeConfig.ai.debugEnabled = false;
    const productionService = new AiSearchService(createAiSearchServiceOptions());

    assert.equal(debugGlobal.__searchInflightMap, undefined);
    productionService.disposeDebugState();

    runtimeConfig.ai.debugEnabled = true;
    const debugService = new AiSearchService(createAiSearchServiceOptions());

    const debugInflightMap: unknown = debugGlobal.__searchInflightMap;
    assert.ok(debugInflightMap instanceof Map);
    debugService.disposeDebugState();
    assert.equal(debugGlobal.__searchInflightMap, undefined);
  } finally {
    runtimeConfig.ai.debugEnabled = originalDebugEnabled;
    delete debugGlobal.__searchInflightMap;
  }
});
