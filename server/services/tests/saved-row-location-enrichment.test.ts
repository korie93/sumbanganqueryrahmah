import assert from "node:assert/strict";
import test from "node:test";
import {
  enrichSavedDataRow,
  enrichSavedRowLocation,
} from "../../lib/saved-row-location-enrichment";
import {
  buildMalaysianPhoneSearchVariants,
  normalizeMalaysianPhoneSearchValue,
} from "../../../shared/common/malaysian-phone";
import { resolveSpreadsheetIdentifierKind } from "../../../shared/common/spreadsheet-identifier-normalization";

test("Saved rows derive bounded home and office postal locations without external calls", () => {
  assert.deepEqual(enrichSavedRowLocation({
    HomePostcode: "9600",
    OfficePostcode: "47500",
  }), {
    HomePostcode: "09600",
    OfficePostcode: "47500",
    "Home Postal District": "Lunas",
    "Home State": "Kedah",
    "Office Postal District": "Subang Jaya",
    "Office State": "Selangor",
  });
});

test("Saved row enrichment preserves authoritative source locality fields", () => {
  assert.deepEqual(enrichSavedRowLocation({
    HomePostcode: "31400",
    "Home District": "Kinta",
    "Home State": "Perak Darul Ridzuan",
  }), {
    HomePostcode: "31400",
    "Home District": "Kinta",
    "Home State": "Perak Darul Ridzuan",
  });
});

test("Saved row enrichment ignores foreign and unknown postcodes", () => {
  const source = { OfficePostcode: "738725", HomePostcode: "99999" };
  assert.deepEqual(enrichSavedRowLocation(source), source);
  assert.equal(enrichSavedRowLocation(null), null);
});

test("Saved row enrichment does not infer Malaysian locations for foreign addresses", () => {
  const source = {
    OfficeAddress1: "SINGAPORE 437733",
    OfficePostcode: "80000",
    HomeAddress1: "12 Jalan Damai",
    HomePostcode: "47500",
  };

  assert.deepEqual(enrichSavedRowLocation(source), {
    ...source,
    "Home Postal District": "Subang Jaya",
    "Home State": "Selangor",
  });
});

test("Saved data row enrichment keeps metadata while enriching legacy JSON", () => {
  const row = enrichSavedDataRow({
    id: "row-1",
    importId: "import-1",
    jsonDataJsonb: { HomePostcode: "81300" },
  });

  assert.equal(row.id, "row-1");
  assert.deepEqual(row.jsonDataJsonb, {
    HomePostcode: "81300",
    "Home Postal District": "Johor Bahru",
    "Home State": "Johor",
  });
});

test("Malaysian phone normalization detects local, international, and missing trunk forms", () => {
  assert.equal(normalizeMalaysianPhoneSearchValue("+60 12-345 6789"), "0123456789");
  assert.equal(normalizeMalaysianPhoneSearchValue("012-345 6789"), "0123456789");
  assert.equal(normalizeMalaysianPhoneSearchValue("123456789"), "0123456789");
  assert.deepEqual(
    buildMalaysianPhoneSearchVariants("012-345 6789"),
    ["0123456789", "123456789", "60123456789", "0060123456789"],
  );
  assert.deepEqual(buildMalaysianPhoneSearchVariants("6587129691"), []);
});

test("numbered phone headers remain classified by their column meaning", () => {
  assert.equal(resolveSpreadsheetIdentifierKind("Phone 1"), "phone");
  assert.equal(resolveSpreadsheetIdentifierKind("Office Phone No 2"), "officePhone");
  assert.equal(resolveSpreadsheetIdentifierKind("Home Telephone 2"), "homePhone");
});
