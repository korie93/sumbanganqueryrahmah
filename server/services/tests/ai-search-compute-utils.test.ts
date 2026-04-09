import assert from "node:assert/strict";
import test from "node:test";
import {
  buildResolvedAiSearchResult,
  resolveAiSearchCandidates,
} from "../ai-search-compute-utils";
import type {
  AiFuzzySearchRow,
  AiIntent,
  AiSearchCandidateRow,
} from "../ai-search-types";
import type { AiSearchPayloadShape } from "../ai-search-result-utils";

type CandidateResolutionStorage = Parameters<typeof resolveAiSearchCandidates>[0]["storage"];
type ResultAssemblyStorage = Parameters<typeof buildResolvedAiSearchResult>[0]["storage"];
type BranchLookups = Parameters<typeof buildResolvedAiSearchResult>[0]["branchLookups"];
type SemanticSearchRow = Awaited<ReturnType<CandidateResolutionStorage["semanticSearch"]>>[number];

function createCandidate(rowId: string, jsonDataJsonb: Record<string, unknown>): AiSearchCandidateRow {
  return {
    rowId,
    importId: "import-1",
    importName: "Import 1",
    importFilename: "import-1.csv",
    jsonDataJsonb,
  };
}

function createSemanticCandidate(rowId: string, jsonDataJsonb: Record<string, unknown>): SemanticSearchRow {
  return {
    rowId,
    importId: "import-semantic-1",
    content: JSON.stringify(jsonDataJsonb),
    score: 0.92,
    importName: "Semantic Import",
    importFilename: "semantic-import.csv",
    jsonDataJsonb,
  };
}

function createFuzzyRow(jsonDataJsonb: Record<string, unknown>, score: number): AiFuzzySearchRow {
  return {
    rowId: "row-fuzzy",
    importId: "import-fuzzy",
    importName: "Import Fuzzy",
    importFilename: "import-fuzzy.csv",
    jsonDataJsonb,
    score,
  };
}

function createIntent(): AiIntent {
  return {
    intent: "search_person",
    entities: {
      name: "Ali",
      ic: null,
      account_no: null,
      phone: null,
      address: null,
      count_groups: null,
    },
    need_nearest_branch: false,
  };
}

function createCandidateResolutionStorage(
  overrides: Partial<CandidateResolutionStorage> = {},
): CandidateResolutionStorage {
  return {
    aiKeywordSearch: async () => [],
    aiNameSearch: async () => [],
    aiDigitsSearch: async () => [],
    semanticSearch: async () => [],
    ...overrides,
  };
}

function createResultAssemblyStorage(
  overrides: Partial<ResultAssemblyStorage> = {},
): ResultAssemblyStorage {
  return {
    aiFuzzySearch: async () => [],
    ...overrides,
  };
}

function createBranchLookups(overrides: Partial<BranchLookups> = {}): BranchLookups {
  return {
    findBranchesByText: async () => [],
    findBranchesByPostcode: async () => [],
    nearestBranches: async () => [],
    postcodeLatLng: async () => null,
    ...overrides,
  };
}

function assertAiSearchPayloadShape(payload: unknown): asserts payload is AiSearchPayloadShape {
  assert.ok(payload && typeof payload === "object");
  assert.ok("person" in payload);
  assert.ok("nearest_branch" in payload);
  assert.ok("decision" in payload);
  assert.ok("ai_explanation" in payload);
}

test("resolveAiSearchCandidates uses semantic results for non-digit queries", async () => {
  const nameCalls: Array<Record<string, unknown>> = [];
  const semanticCalls: Array<Record<string, unknown>> = [];
  const embedCalls: string[] = [];

  const result = await resolveAiSearchCandidates({
    query: "Ali",
    semanticSearchEnabled: true,
    aiTimeoutMs: 6000,
    storage: createCandidateResolutionStorage({
      aiKeywordSearch: async () => {
        throw new Error("digits path should not be used");
      },
      aiNameSearch: async (params: Record<string, unknown>) => {
        nameCalls.push(params);
        return [];
      },
      aiDigitsSearch: async () => [],
      semanticSearch: async (params: Record<string, unknown>) => {
        semanticCalls.push(params);
        return [createSemanticCandidate("row-vector", { Nama: "Ali Bin Abu" })];
      },
    }),
    withAiCircuit: async <T>(operation: () => Promise<T>) => operation(),
    ollamaChat: async () => "",
    ollamaEmbed: async (text: string) => {
      embedCalls.push(text);
      return [0.1, 0.2];
    },
    intentMode: "fast",
  });

  assert.deepEqual(nameCalls, [{ query: "Ali", limit: 10 }]);
  assert.deepEqual(embedCalls, ["Ali"]);
  assert.deepEqual(semanticCalls, [{ embedding: [0.1, 0.2], limit: 10 }]);
  assert.equal(result.vectorResults.length, 1);
  assert.equal(result.best?.rowId, "row-vector");
  assert.equal(result.hasDigitsQuery, false);
});

test("resolveAiSearchCandidates swallows embedding failures and keeps keyword matches", async () => {
  let semanticCalled = false;

  const result = await resolveAiSearchCandidates({
    query: "Ali",
    semanticSearchEnabled: true,
    aiTimeoutMs: 6000,
    storage: createCandidateResolutionStorage({
      aiKeywordSearch: async () => {
        throw new Error("digits path should not be used");
      },
      aiNameSearch: async () => [createCandidate("row-keyword", { Nama: "Ali Bin Abu" })],
      aiDigitsSearch: async () => [],
      semanticSearch: async () => {
        semanticCalled = true;
        return [];
      },
    }),
    withAiCircuit: async <T>(operation: () => Promise<T>) => operation(),
    ollamaChat: async () => "",
    ollamaEmbed: async () => {
      throw new Error("embed failed");
    },
    intentMode: "fast",
  });

  assert.equal(semanticCalled, false);
  assert.equal(result.vectorResults.length, 0);
  assert.equal(result.best?.rowId, "row-keyword");
});

test("resolveAiSearchCandidates falls back to raw query digits when intent only returns a name", async () => {
  const nameCalls: Array<Record<string, unknown>> = [];
  const digitsCalls: Array<Record<string, unknown>> = [];

  const result = await resolveAiSearchCandidates({
    query: "Ali 900101015555",
    semanticSearchEnabled: false,
    aiTimeoutMs: 6000,
    storage: createCandidateResolutionStorage({
      aiKeywordSearch: async () => {
        throw new Error("digits-first path should not be used");
      },
      aiNameSearch: async (params: Record<string, unknown>) => {
        nameCalls.push(params);
        return [];
      },
      aiDigitsSearch: async (params: Record<string, unknown>) => {
        digitsCalls.push(params);
        return [
          createCandidate("row-digits", {
            Nama: "Ali Bin Abu",
            "No. MyKad": "900101015555",
          }),
        ];
      },
      semanticSearch: async () => [],
    }),
    withAiCircuit: async <T>(operation: () => Promise<T>) => operation(),
    ollamaChat: async () =>
      '{"intent":"search_person","entities":{"name":"Ali","ic":null,"account_no":null,"phone":null,"address":null},"need_nearest_branch":false}',
    ollamaEmbed: async () => [],
    intentMode: "model",
  });

  assert.deepEqual(nameCalls, [{ query: "Ali", limit: 10 }]);
  assert.deepEqual(digitsCalls, [{ digits: "900101015555", limit: 25 }]);
  assert.equal(result.hasDigitsQuery, false);
  assert.equal(result.fallbackDigitsResults.length, 1);
  assert.equal(result.best?.rowId, "row-digits");
});

test("buildResolvedAiSearchResult adds fuzzy suggestions and marks last-person usage", async () => {
  const fuzzyCalls: Array<Record<string, unknown>> = [];
  const result = await buildResolvedAiSearchResult({
    query: "ali jalan",
    aiTimeoutMs: 6000,
    intent: createIntent(),
    best: null,
    bestScore: 0,
    hasDigitsQuery: false,
    keywordResults: [],
    fallbackDigitsResults: [],
    fallbackPerson: createCandidate("row-last", { Nama: "Ali Lama" }),
    storage: createResultAssemblyStorage({
      aiFuzzySearch: async (params: Record<string, unknown>) => {
        fuzzyCalls.push(params);
        return [
          createFuzzyRow(
            {
              Nama: "Ali Bin Abu",
              "No. MyKad": "900101015555",
              HomeAddress1: "Jalan Ampang",
            },
            2,
          ),
        ];
      },
    }),
    branchLookups: createBranchLookups({
      findBranchesByText: async () => {
        throw new Error("branch lookup should not run");
      },
      findBranchesByPostcode: async () => {
        throw new Error("branch lookup should not run");
      },
      nearestBranches: async () => {
        throw new Error("branch lookup should not run");
      },
      postcodeLatLng: async () => {
        throw new Error("branch lookup should not run");
      },
    }),
  });

  assert.deepEqual(fuzzyCalls, [{ query: "ali jalan", limit: 5 }]);
  assertAiSearchPayloadShape(result.payload);
  assert.equal(result.payload.person, null);
  assert.ok(String(result.payload.ai_explanation).includes("Cadangan Rekod (fuzzy):"));
  assert.ok(String(result.payload.ai_explanation).includes("Ali Bin Abu"));
  assert.equal(result.audit.used_last_person, true);
});

test("buildResolvedAiSearchResult skips fuzzy suggestions for digit-style searches", async () => {
  let fuzzyCalled = false;

  const result = await buildResolvedAiSearchResult({
    query: "900101015555",
    aiTimeoutMs: 6000,
    intent: {
      ...createIntent(),
      entities: {
        name: null,
        ic: null,
        account_no: null,
        phone: null,
        address: null,
        count_groups: null,
      },
    },
    best: createCandidate("row-1", {
      Nama: "Ali Bin Abu",
      "No. MyKad": "900101015555",
    }),
    bestScore: 20,
    hasDigitsQuery: true,
    keywordResults: [],
    fallbackDigitsResults: [],
    fallbackPerson: null,
    storage: createResultAssemblyStorage({
      aiFuzzySearch: async () => {
        fuzzyCalled = true;
        return [];
      },
    }),
    branchLookups: createBranchLookups({
      findBranchesByText: async () => {
        throw new Error("branch lookup should not run");
      },
      findBranchesByPostcode: async () => {
        throw new Error("branch lookup should not run");
      },
      nearestBranches: async () => {
        throw new Error("branch lookup should not run");
      },
      postcodeLatLng: async () => {
        throw new Error("branch lookup should not run");
      },
    }),
  });

  assert.equal(fuzzyCalled, false);
  assertAiSearchPayloadShape(result.payload);
  assert.equal(result.payload.person?.id, "row-1");
  assert.equal(result.audit.used_last_person, false);
});

test("buildResolvedAiSearchResult includes nearest branch for IC searches with mailing postcode fields", async () => {
  let postcodeLookup = "";

  const result = await buildResolvedAiSearchResult({
    query: "900101015555",
    aiTimeoutMs: 6000,
    intent: {
      ...createIntent(),
      entities: {
        name: null,
        ic: "900101015555",
        account_no: null,
        phone: null,
        address: null,
        count_groups: null,
      },
    },
    best: createCandidate("row-1", {
      Nama: "Ali Bin Abu",
      "No. MyKad": "900101015555",
      MailingPostcode: "43200",
      MailingAddress1: "Jalan Cheras",
    }),
    bestScore: 20,
    hasDigitsQuery: true,
    keywordResults: [],
    fallbackDigitsResults: [],
    fallbackPerson: null,
    storage: createResultAssemblyStorage(),
    branchLookups: createBranchLookups({
      findBranchesByText: async () => [],
      findBranchesByPostcode: async (postcode: string) => {
        postcodeLookup = postcode;
        return [{
          name: "AEON Cheras Selatan",
          address: "Cheras Selatan",
          phone: "03-12345678",
          fax: null,
          businessHour: null,
          dayOpen: null,
          atmCdm: null,
          inquiryAvailability: null,
          applicationAvailability: null,
          aeonLounge: null,
        }];
      },
      nearestBranches: async () => [],
      postcodeLatLng: async () => null,
    }),
  });

  assert.equal(postcodeLookup, "43200");
  assertAiSearchPayloadShape(result.payload);
  assert.equal(result.payload.nearest_branch?.name, "AEON Cheras Selatan");
  assert.ok(String(result.payload.ai_explanation).includes("AEON Cheras Selatan"));
});
