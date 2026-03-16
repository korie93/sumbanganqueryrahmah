import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveAiTravelDecision,
  resolveAiBranchLookup,
} from "../ai-search-branch-utils";
import type {
  AiBranchSearchResult,
  AiNearestBranchResult,
  AiSearchCandidateRow,
} from "../ai-search-types";

function createCandidate(rowId: string, jsonDataJsonb: Record<string, unknown>): AiSearchCandidateRow {
  return {
    rowId,
    jsonDataJsonb,
  } as AiSearchCandidateRow;
}

function createBranch(name: string, address = "Alamat cawangan"): AiBranchSearchResult {
  return {
    name,
    address,
    phone: "03-12345678",
    fax: null,
    businessHour: null,
    dayOpen: null,
    atmCdm: null,
    inquiryAvailability: null,
    applicationAvailability: null,
    aeonLounge: null,
  } as AiBranchSearchResult;
}

function createNearestBranch(name: string, distanceKm: number): AiNearestBranchResult {
  return {
    ...createBranch(name),
    distanceKm,
  } as AiNearestBranchResult;
}

test("deriveAiTravelDecision maps distance bands to lightweight travel guidance", () => {
  assert.deepEqual(deriveAiTravelDecision(undefined), {
    decision: null,
    travelMode: null,
    estimatedMinutes: null,
  });

  assert.deepEqual(deriveAiTravelDecision(4.2), {
    decision: "WALK-IN",
    travelMode: "WALK",
    estimatedMinutes: 50,
  });

  assert.deepEqual(deriveAiTravelDecision(12), {
    decision: "DRIVE",
    travelMode: "DRIVE",
    estimatedMinutes: 18,
  });

  assert.deepEqual(deriveAiTravelDecision(45), {
    decision: "CALL",
    travelMode: "CALL",
    estimatedMinutes: null,
  });
});

test("resolveAiBranchLookup uses simplified text search for branch-first queries", async () => {
  let receivedText = "";
  const result = await resolveAiBranchLookup({
    query: "cawangan terdekat di Shah Alam",
    shouldFindBranch: true,
    hasPersonId: false,
    best: null,
    fallbackPerson: null,
    keywordResults: [],
    fallbackDigitsResults: [],
    branchTimeoutMs: 1200,
    lookups: {
      findBranchesByText: async (text) => {
        receivedText = text;
        return [createBranch("AEON Shah Alam")];
      },
      findBranchesByPostcode: async () => [],
      nearestBranches: async () => [],
      postcodeLatLng: async () => null,
    },
  });

  assert.equal(receivedText, "Shah Alam");
  assert.equal(result.branchTextSearch, true);
  assert.equal(result.missingCoords, false);
  assert.equal(result.nearestBranch?.name, "AEON Shah Alam");
});

test("resolveAiBranchLookup prefers postcode coordinates before branch text fallback", async () => {
  const result = await resolveAiBranchLookup({
    query: "900101015555",
    shouldFindBranch: true,
    hasPersonId: true,
    best: createCandidate("row-1", {
      HomePostcode: "68000",
      HomeAddress1: "Jalan Ampang",
    }),
    fallbackPerson: null,
    keywordResults: [],
    fallbackDigitsResults: [],
    branchTimeoutMs: 1200,
    lookups: {
      findBranchesByText: async () => [],
      findBranchesByPostcode: async () => [],
      nearestBranches: async (lat, lng) => {
        assert.equal(lat, 3.14);
        assert.equal(lng, 101.75);
        return [createNearestBranch("AEON AU2", 3.5)];
      },
      postcodeLatLng: async (postcode) => {
        assert.equal(postcode, "68000");
        return { lat: 3.14, lng: 101.75 };
      },
    },
  });

  assert.equal(result.branchTextSearch, false);
  assert.equal(result.missingCoords, false);
  assert.equal(result.nearestBranch?.name, "AEON AU2");
  assert.equal(result.nearestBranch?.distanceKm, 3.5);
});

test("resolveAiBranchLookup falls back to customer location hint when postcode is unavailable", async () => {
  let receivedHint = "";
  const result = await resolveAiBranchLookup({
    query: "tolong cari cawangan terdekat",
    shouldFindBranch: true,
    hasPersonId: true,
    best: createCandidate("row-empty", {
      Nama: "Ali",
    }),
    fallbackPerson: null,
    keywordResults: [
      createCandidate("row-hint", {
        HomeAddress1: "Taman Melawati",
        Bandar: "Kuala Lumpur",
      }),
    ],
    fallbackDigitsResults: [],
    branchTimeoutMs: 1200,
    lookups: {
      findBranchesByText: async (text) => {
        receivedHint = text;
        return [createBranch("AEON Wangsa Maju")];
      },
      findBranchesByPostcode: async () => [],
      nearestBranches: async () => [],
      postcodeLatLng: async () => null,
    },
  });

  assert.equal(receivedHint, "Taman Melawati Kuala Lumpur");
  assert.equal(result.branchTextSearch, true);
  assert.equal(result.missingCoords, true);
  assert.equal(result.nearestBranch?.name, "AEON Wangsa Maju");
  assert.equal(result.nearestBranch?.distanceKm, undefined);
});

test("resolveAiBranchLookup falls back to direct postcode branch match when coord lookup is unavailable", async () => {
  let fallbackUsed = false;
  const result = await resolveAiBranchLookup({
    query: "cari cawangan untuk pelanggan ini",
    shouldFindBranch: true,
    hasPersonId: true,
    best: createCandidate("row-1", {
      HomePostcode: "43200",
    }),
    fallbackPerson: null,
    keywordResults: [],
    fallbackDigitsResults: [],
    branchTimeoutMs: 1200,
    lookups: {
      findBranchesByText: async () => [],
      findBranchesByPostcode: async () => [],
      findBranchesByPostcodeFallback: async (postcode) => {
        fallbackUsed = true;
        assert.equal(postcode, "43200");
        return [createBranch("AEON Cheras Selatan")];
      },
      nearestBranches: async () => [],
      postcodeLatLng: async () => null,
    },
  });

  assert.equal(fallbackUsed, true);
  assert.equal(result.missingCoords, false);
  assert.equal(result.nearestBranch?.name, "AEON Cheras Selatan");
});
