import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBranchSummary,
  buildExplanation,
  buildPersonSummary,
} from "../ai-search-explanation-utils";
import {
  buildFieldMatchSummary,
  ensureJsonRow,
  extractCustomerLocationHint,
  extractCustomerPostcode,
  extractJsonObject,
  normalizeLocationHint,
  parseIntentFallback,
  rowScore,
  scoreRowDigits,
  tokenizeQuery,
  toObjectJson,
} from "../ai-search-query-utils";

test("parseIntentFallback detects branch intent and common identifiers", () => {
  const branchIntent = parseIntentFallback("cawangan terdekat untuk 900101015555");
  assert.equal(branchIntent.need_nearest_branch, true);
  assert.equal(branchIntent.entities.ic, "900101015555");
  assert.equal(branchIntent.entities.name, null);

  const nameIntent = parseIntentFallback("Siti Nurhaliza");
  assert.equal(nameIntent.need_nearest_branch, false);
  assert.equal(nameIntent.entities.name, "Siti Nurhaliza");
  assert.equal(nameIntent.entities.ic, null);
});

test("extractJsonObject parses embedded JSON and ignores invalid wrappers", () => {
  assert.deepEqual(extractJsonObject('prefix {"intent":"search_person","entities":{}} suffix'), {
    intent: "search_person",
    entities: {},
  });
  assert.equal(extractJsonObject("not-json"), null);
});

test("customer postcode and location helpers prefer home fields and ignore relation/office noise", () => {
  const data = {
    HomePostcode: "68000",
    HomeAddress1: "Jalan Ampang",
    HomeAddress2: "Taman Mewah",
    Bandar: "Ampang",
    Negeri: "Selangor",
    OfficePostcode: "50000",
    SpousePostcode: "12345",
    SpouseAddress1: "Alamat pasangan",
  };

  assert.equal(extractCustomerPostcode(data), "68000");
  assert.deepEqual(extractCustomerLocationHint(data).split(" "), [
    "68000",
    "Jalan",
    "Ampang",
    "Taman",
    "Mewah",
    "Ampang",
    "Selangor",
  ]);
  assert.equal(normalizeLocationHint("Jalan Ampang, Selangor!!!"), "Jalan Ampang Selangor");
});

test("customer postcode and location helpers understand mailing and residential field variants", () => {
  const data = {
    MailingPostcode: "43200",
    MailingAddress1: "Jalan Cheras",
    MailingAddress2: "Taman Maju",
    Daerah: "Cheras",
    StateName: "Selangor",
    OfficePostalCode: "50000",
    SpouseMailingPostcode: "12345",
  };

  assert.equal(extractCustomerPostcode(data), "43200");
  assert.deepEqual(extractCustomerLocationHint(data).split(" "), [
    "43200",
    "Jalan",
    "Cheras",
    "Taman",
    "Maju",
    "Cheras",
    "Selangor",
  ]);
});

test("matching and scoring helpers rank likely fields without mutating behavior", () => {
  const row = ensureJsonRow({
    rowId: "row-1",
    jsonDataJsonb: JSON.stringify({
      Nama: "Ali Bin Abu",
      "No. MyKad": "900101015555",
      "Account No": "123456789012",
      HomeAddress1: "Jalan Merdeka",
    }),
  });

  const scoreByDigits = scoreRowDigits(row, "900101015555");
  assert.equal(scoreByDigits.score, 20);
  assert.equal(scoreByDigits.parsed["Nama"], "Ali Bin Abu");

  const weightedScore = rowScore(row, "900101015555", "Ali", "123456789012", null);
  assert.ok(weightedScore >= 30);

  assert.deepEqual(tokenizeQuery("Ali bin Abu @ Jalan"), ["ali", "bin", "abu", "jalan"]);
  assert.deepEqual(buildFieldMatchSummary(scoreByDigits.parsed, "Ali Jalan"), [
    "Nama: Ali Bin Abu",
    "HomeAddress1: Jalan Merdeka",
  ]);
});

test("summary and explanation helpers produce compact AI-ready text", () => {
  const person = toObjectJson({
    Nama: "Ali Bin Abu",
    "No. MyKad": "900101015555",
    HomeAddress1: "Jalan Merdeka",
    Negeri: "Selangor",
  });
  const branch = {
    name: "AEON AU2",
    address: "Taman Keramat",
    phone: "03-12345678",
    distanceKm: 4.2,
    atmCdm: "ATM + CDM",
  };

  const personSummary = buildPersonSummary(person);
  const branchSummary = buildBranchSummary(branch);
  const explanation = buildExplanation({
    decision: "WALK-IN",
    distanceKm: 4.2,
    branch: "AEON AU2",
    personSummary,
    branchSummary,
    estimatedMinutes: 50,
    travelMode: "WALK",
    missingCoords: false,
    matchFields: ["Nama: Ali Bin Abu"],
  });

  assert.ok(explanation.includes("Maklumat Pelanggan:"));
  assert.ok(explanation.includes("Cadangan: WALK-IN."));
  assert.ok(explanation.includes("AEON AU2"));
  assert.ok(explanation.includes("ATM & CDM: Ada ATM & CDM"));
});

test("branch summary normalizes ATM & CDM availability into Ada/Tiada wording", () => {
  const withAtm = buildBranchSummary({
    name: "AEON A",
    atmCdm: "ATM + CDM",
  });
  const withoutAtm = buildBranchSummary({
    name: "AEON B",
    atmCdm: "Tiada CDM",
  });

  assert.ok(withAtm.some((item) => item.label === "ATM & CDM" && item.value === "Ada ATM & CDM"));
  assert.ok(withoutAtm.some((item) => item.label === "ATM & CDM" && item.value === "Tiada ATM & CDM"));
});
