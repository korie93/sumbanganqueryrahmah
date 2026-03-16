import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAiSearchAudit,
  buildAiSearchPayload,
  buildAiSuggestions,
  mapAiNearestBranchPayload,
  mapAiSearchPerson,
} from "../ai-search-result-utils";
import type {
  AiFuzzySearchRow,
  AiIntent,
  AiSearchCandidateRow,
} from "../ai-search-types";
import type { AiResolvedBranch } from "../ai-search-branch-utils";

function createCandidate(rowId: string, jsonDataJsonb: Record<string, unknown>): AiSearchCandidateRow {
  return {
    rowId,
    jsonDataJsonb,
  } as AiSearchCandidateRow;
}

function createFuzzyRow(jsonDataJsonb: Record<string, unknown>, score: number): AiFuzzySearchRow {
  return {
    rowId: "row-fuzzy",
    jsonDataJsonb,
    score,
  } as AiFuzzySearchRow;
}

function createResolvedBranch(distanceKm = 4.2): AiResolvedBranch {
  return {
    name: "AEON AU2",
    address: "Taman Keramat",
    phone: "03-12345678",
    fax: "03-9999999",
    businessHour: "10AM - 10PM",
    dayOpen: "Everyday",
    atmCdm: "ATM + CDM",
    inquiryAvailability: "Yes",
    applicationAvailability: "Yes",
    aeonLounge: "No",
    distanceKm,
  } as AiResolvedBranch;
}

test("buildAiSuggestions formats fuzzy rows into compact suggestion lines", () => {
  const suggestions = buildAiSuggestions("ali jalan ampang", [
    createFuzzyRow(
      {
        Nama: "Ali Bin Abu",
        "No. MyKad": "900101015555",
        HomeAddress1: "Jalan Ampang",
      },
      2,
    ),
    createFuzzyRow(
      {
        Nama: "",
      },
      1,
    ),
  ]);

  assert.equal(suggestions.length, 1);
  assert.ok(suggestions[0].includes("Ali Bin Abu"));
  assert.ok(suggestions[0].includes("900101015555"));
  assert.ok(suggestions[0].includes("Jalan Ampang"));
});

test("person and branch payload mappers preserve existing API field names", () => {
  const person = mapAiSearchPerson(
    createCandidate("row-1", {
      Nama: "Ali Bin Abu",
      HomeAddress1: "Jalan Ampang",
    }),
  );
  const branchPayload = mapAiNearestBranchPayload(createResolvedBranch(), "WALK", 50);

  assert.equal(person?.id, "row-1");
  assert.equal(person?.Nama, "Ali Bin Abu");
  assert.deepEqual(branchPayload, {
    name: "AEON AU2",
    address: "Taman Keramat",
    phone: "03-12345678",
    fax: "03-9999999",
    business_hour: "10AM - 10PM",
    day_open: "Everyday",
    atm_cdm: "ATM + CDM",
    inquiry_availability: "Yes",
    application_availability: "Yes",
    aeon_lounge: "No",
    distance_km: 4.2,
    travel_mode: "WALK",
    estimated_minutes: 50,
  });
});

test("buildAiSearchPayload and buildAiSearchAudit keep response and audit shape stable", () => {
  const intent: AiIntent = {
    intent: "search_person",
    entities: {
      name: "Ali",
      ic: null,
      account_no: null,
      phone: null,
      address: null,
      count_groups: null,
    },
    need_nearest_branch: true,
  };
  const person = mapAiSearchPerson(
    createCandidate("row-1", {
      Nama: "Ali Bin Abu",
    }),
  );
  const nearestBranch = createResolvedBranch(11.5);

  const payload = buildAiSearchPayload({
    person,
    nearestBranch,
    decision: "DRIVE",
    explanation: "Cadangan ringkas",
    travelMode: "DRIVE",
    estimatedMinutes: 17,
  });
  const audit = buildAiSearchAudit({
    query: "ali ampang",
    intent,
    person,
    nearestBranch,
    decision: "DRIVE",
    travelMode: "DRIVE",
    estimatedMinutes: 17,
    usedLastPerson: true,
  });

  assert.equal(payload.person?.id, "row-1");
  assert.equal(payload.nearest_branch?.distance_km, 11.5);
  assert.equal(payload.decision, "DRIVE");
  assert.equal(payload.ai_explanation, "Cadangan ringkas");

  assert.deepEqual(audit, {
    query: "ali ampang",
    intent,
    matched_profile_id: "row-1",
    branch: "AEON AU2",
    distance_km: 11.5,
    decision: "DRIVE",
    travel_mode: "DRIVE",
    estimated_minutes: 17,
    used_last_person: true,
  });
});
