import assert from "node:assert/strict";
import test from "node:test";
import {
  clampAiBranchLookupLimit,
  extractAiBranchSeedPostcode,
  normalizeAiBranchLookupPostcode,
  normalizeAiBranchLookupQuery,
} from "../ai-branch-lookup-utils";
import {
  coerceImportBranchRecord,
  detectAiBranchImportKeys,
  normalizeImportedBranchPostcode,
} from "../ai-branch-import-utils";
import { mapBranchRow, mapSearchRow, normalizeJsonPayload, readRows } from "../ai-repository-mappers";
import { resolveAiKeywordFields, tokenizeAiFuzzyQuery } from "../ai-search-record-utils";

test("readRows and normalizeJsonPayload handle empty and JSON payloads safely", () => {
  assert.deepEqual(readRows<{ id: string }>({ rows: null }), []);
  assert.deepEqual(readRows<{ id: string }>({ rows: [{ id: "row-1" }] }), [{ id: "row-1" }]);

  assert.deepEqual(normalizeJsonPayload('{"name":"Ali"}'), { name: "Ali" });
  assert.equal(normalizeJsonPayload("not-json"), "not-json");
});

test("mapSearchRow and mapBranchRow normalize row payloads for AI search consumers", () => {
  const searchRow = mapSearchRow({
    rowId: "row-1",
    importId: "import-1",
    importName: "March",
    importFilename: "march.csv",
    jsonDataJsonb: '{"Nama":"Ali"}',
  });
  assert.deepEqual(searchRow.jsonDataJsonb, { Nama: "Ali" });

  const branch = mapBranchRow({
    name: "AEON AU2",
    branch_address: "Taman Keramat",
    phone_number: "03-12345678",
    fax_number: "03-87654321",
    business_hour: "10AM - 10PM",
    day_open: "Daily",
    atm_cdm: "ATM + CDM",
    inquiry_availability: "Yes",
    application_availability: "Yes",
    aeon_lounge: "No",
    distance_km: 4.2,
  });

  assert.deepEqual(branch, {
    name: "AEON AU2",
    address: "Taman Keramat",
    phone: "03-12345678",
    fax: "03-87654321",
    businessHour: "10AM - 10PM",
    dayOpen: "Daily",
    atmCdm: "ATM + CDM",
    inquiryAvailability: "Yes",
    applicationAvailability: "Yes",
    aeonLounge: "No",
  });
});

test("branch import helpers detect likely keys and normalize postcode input", () => {
  const detected = detectAiBranchImportKeys({
    Branch_Name: "AEON AU2",
    Latitude: "3.2",
    Longitude: "101.7",
    BranchAddress: "Taman Keramat 54200 Kuala Lumpur",
    PhoneNumber: "03-12345678",
    FaxNumber: "03-87654321",
    BusinessHour: "10AM - 10PM",
    DayOpen: "Daily",
    ATM_CDM: "ATM + CDM",
    State: "Kuala Lumpur",
  });

  assert.equal(detected.nameKey, "Branch_Name");
  assert.equal(detected.latKey, "Latitude");
  assert.equal(detected.lngKey, "Longitude");
  assert.equal(detected.addressKey, "BranchAddress");
  assert.equal(detected.phoneKey, "PhoneNumber");

  assert.equal(normalizeImportedBranchPostcode("54200 Kuala Lumpur"), "54200");
  assert.equal(normalizeImportedBranchPostcode("6800"), "06800");
  assert.equal(normalizeImportedBranchPostcode("No postcode"), null);
});

test("coerceImportBranchRecord returns an object only for safe record-like values", () => {
  assert.deepEqual(coerceImportBranchRecord({ hello: "world" }), { hello: "world" });
  assert.deepEqual(coerceImportBranchRecord("bad"), {});
  assert.deepEqual(coerceImportBranchRecord(null), {});
});

test("AI search record helpers normalize keyword field selection and fuzzy tokens", () => {
  assert.deepEqual(resolveAiKeywordFields("900101015555"), [
    "No. MyKad",
    "ID No",
    "No Pengenalan",
    "IC",
    "NRIC",
    "MyKad",
  ]);
  assert.deepEqual(resolveAiKeywordFields("0123456789"), [
    "No. Telefon Rumah",
    "No. Telefon Bimbit",
    "Telefon",
    "Phone",
    "HP",
    "Handphone",
    "OfficePhone",
  ]);
  assert.deepEqual(resolveAiKeywordFields("1234567890123456"), [
    "Nombor Akaun Bank Pemohon",
    "Account No",
    "Account Number",
    "No Akaun",
    "Card No",
  ]);

  assert.deepEqual(tokenizeAiFuzzyQuery("Ali bin Abu @ Jalan!"), [
    "ali",
    "bin",
    "abu",
    "jalan",
  ]);
  assert.deepEqual(tokenizeAiFuzzyQuery("a @ 12"), []);
});

test("AI branch lookup helpers clamp limits and normalize postcode/address inputs", () => {
  assert.equal(clampAiBranchLookupLimit(undefined), 5);
  assert.equal(clampAiBranchLookupLimit(0), 1);
  assert.equal(clampAiBranchLookupLimit(20), 5);
  assert.equal(clampAiBranchLookupLimit(3), 3);

  assert.equal(normalizeAiBranchLookupQuery("  AU2 branch "), "AU2 branch");
  assert.equal(normalizeAiBranchLookupPostcode("6800"), "06800");
  assert.equal(normalizeAiBranchLookupPostcode("54200 Kuala Lumpur"), "54200");
  assert.equal(normalizeAiBranchLookupPostcode("bad"), "");

  assert.equal(extractAiBranchSeedPostcode("Taman Keramat 54200 Kuala Lumpur"), "54200");
  assert.equal(extractAiBranchSeedPostcode("Kedah 6800"), "06800");
  assert.equal(extractAiBranchSeedPostcode("Tiada poskod"), null);
});
