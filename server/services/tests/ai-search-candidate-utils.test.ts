import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAiBestCandidateDebugPayload,
  buildAiSearchDebugPayload,
  buildAiSearchKeywordContext,
  selectAiSearchCandidate,
} from "../ai-search-candidate-utils";
import type { AiSearchCandidateRow } from "../ai-search-types";

function createCandidate(rowId: string, jsonDataJsonb: unknown): AiSearchCandidateRow {
  return {
    rowId,
    jsonDataJsonb,
  } as AiSearchCandidateRow;
}

test("buildAiSearchKeywordContext prefers identifiers over raw query text", () => {
  const context = buildAiSearchKeywordContext("ali bin abu", {
    name: "Ali",
    ic: "900101015555",
    account_no: null,
    phone: null,
    address: null,
    count_groups: null,
  });

  assert.deepEqual(context, {
    keywordQuery: "900101015555",
    queryDigits: "900101015555",
    hasDigitsQuery: true,
  });
});

test("selectAiSearchCandidate prefers strongest digits match and normalizes parsed JSON", () => {
  const exactIc = createCandidate("row-ic", {
    Nama: "Ali",
    "No. MyKad": "900101015555",
  });
  const phoneOnly = createCandidate("row-phone", {
    Nama: "Ali",
    Phone: "0123456789",
  });

  const result = selectAiSearchCandidate({
    entities: {
      name: null,
      ic: "900101015555",
      account_no: null,
      phone: null,
      address: null,
      count_groups: null,
    },
    keywordQuery: "900101015555",
    hasDigitsQuery: true,
    queryDigits: "900101015555",
    keywordResults: [phoneOnly, exactIc],
    fallbackDigitsResults: [],
    vectorResults: [],
  });

  assert.equal(result.best?.rowId, "row-ic");
  assert.equal(result.bestScore, 20);
  assert.deepEqual(result.best?.jsonDataJsonb, {
    Nama: "Ali",
    "No. MyKad": "900101015555",
  });
});

test("selectAiSearchCandidate dedupes rows and keeps highest weighted non-digit match", () => {
  const weak = createCandidate(
    "row-weak",
    JSON.stringify({
      Nama: "Abu",
      Address: "Cheras",
    }),
  );
  const strong = createCandidate(
    "row-strong",
    JSON.stringify({
      Nama: "Ali Bin Abu",
      "Account No": "123456789012",
      HomeAddress1: "Jalan Merdeka",
    }),
  );
  const duplicateStrong = createCandidate(
    "row-strong",
    JSON.stringify({
      Nama: "Ali Bin Abu",
      "Account No": "123456789012",
      HomeAddress1: "Jalan Merdeka",
    }),
  );

  const result = selectAiSearchCandidate({
    entities: {
      name: "Ali",
      ic: null,
      account_no: "123456789012",
      phone: null,
      address: null,
      count_groups: null,
    },
    keywordQuery: "Ali",
    hasDigitsQuery: false,
    queryDigits: "",
    keywordResults: [weak, strong],
    fallbackDigitsResults: [duplicateStrong],
    vectorResults: [],
  });

  assert.equal(result.best?.rowId, "row-strong");
  assert.ok(result.bestScore >= 18);
  assert.equal(typeof result.best?.jsonDataJsonb, "object");
});

test("debug payload helpers keep compact logging shape stable", () => {
  const debugPayload = buildAiSearchDebugPayload({
    query: "ali",
    keywordQuery: "ali",
    queryDigits: "",
    keywordResults: [createCandidate("row-1", {})],
    fallbackDigitsResults: [createCandidate("row-2", {})],
  });
  const bestPayload = buildAiBestCandidateDebugPayload(
    createCandidate("row-1", { Nama: "Ali", Negeri: "Selangor" }),
  );

  assert.deepEqual(debugPayload, {
    query: "ali",
    keywordQuery: "ali",
    queryDigits: "",
    keywordCount: 1,
    fallbackDigitsCount: 1,
  });
  assert.deepEqual(bestPayload, {
    rowId: "row-1",
    jsonType: "object",
    sampleKeys: ["Nama", "Negeri"],
  });
});
