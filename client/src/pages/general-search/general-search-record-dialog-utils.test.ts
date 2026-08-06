import assert from "node:assert/strict";
import test from "node:test";
import { buildGeneralSearchRecordDialogView } from "@/pages/general-search/general-search-record-dialog-utils";

test("record dialog groups fields without repeating summary values", () => {
  const view = buildGeneralSearchRecordDialogView(
    {
      "IC Number": "910731135359",
      "Customer Name": "Chua Ee Ka",
      "Account No": "ACC-1001",
      "Card No": "CARD-22",
      Address: "Kuala Lumpur",
      Phone: "0123456789",
      Segment: "P10",
      Notes: null,
      "Source File": "NPL CC P10 JULY",
      _collectionStatus: { state: "recorded" },
    },
    true,
  );

  assert.deepEqual(view.summaryFields.map((field) => field.header), [
    "IC Number",
    "Customer Name",
    "Account No",
  ]);
  assert.deepEqual(view.identityFields.map((field) => field.header), ["Card No"]);
  assert.deepEqual(view.contactFields.map((field) => field.header), ["Address", "Phone"]);
  assert.deepEqual(view.additionalFields.map((field) => field.header), ["Segment"]);
  assert.deepEqual(view.sourceFields.map((field) => field.header), ["Source File"]);
  assert.deepEqual(view.emptyFields.map((field) => field.header), ["Notes"]);

  const visibleHeaders = [
    ...view.summaryFields,
    ...view.identityFields,
    ...view.contactFields,
    ...view.additionalFields,
    ...view.sourceFields,
    ...view.emptyFields,
  ].map((field) => field.header);

  assert.equal(new Set(visibleHeaders).size, visibleHeaders.length);
  assert.equal(visibleHeaders.length, view.totalFields);
});

test("record dialog excludes source metadata for roles without source access", () => {
  const view = buildGeneralSearchRecordDialogView(
    {
      Name: "Test User",
      "Source File": "restricted.xlsx",
    },
    false,
  );

  assert.equal(view.sourceFields.length, 0);
  assert.equal(view.totalFields, 1);
  assert.equal(
    [...view.summaryFields, ...view.additionalFields].some(
      (field) => field.header === "Source File",
    ),
    false,
  );
});

test("record dialog keeps zero and false values while minimizing empty text", () => {
  const view = buildGeneralSearchRecordDialogView(
    {
      Balance: 0,
      Eligible: false,
      Empty: "  ",
      Missing: undefined,
      Placeholder: "-",
    },
    true,
  );

  assert.deepEqual(view.additionalFields.map((field) => field.header), ["Balance", "Eligible"]);
  assert.deepEqual(view.emptyFields.map((field) => field.header), [
    "Empty",
    "Missing",
    "Placeholder",
  ]);
});

test("record dialog does not mistake Office fields for an IC number", () => {
  const view = buildGeneralSearchRecordDialogView(
    {
      "ID No": "860914236504",
      "Customer Name": "Example Customer",
      "Account No": "10002957986000014",
      OfficeAddress1: "PERSIARAN USAHAWAN",
      OfficePhone: "60351634137",
      OfficePostcode: "40150",
    },
    true,
  );

  assert.deepEqual(view.summaryFields.map((field) => field.header), [
    "ID No",
    "Customer Name",
    "Account No",
  ]);
  assert.deepEqual(view.contactFields.map((field) => field.header), [
    "OfficeAddress1",
    "OfficePostcode",
    "OfficePhone",
  ]);
});
