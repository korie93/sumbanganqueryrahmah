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
    ...view.homeAddressFields,
    ...view.officeAddressFields,
    ...view.contactFields,
    ...view.paymentFields,
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
  assert.deepEqual(view.officeAddressFields.map((field) => field.header), [
    "OfficeAddress1",
    "OfficePostcode",
    "OfficePhone",
  ]);
  assert.equal(view.contactFields.length, 0);
  assert.deepEqual(view.officeAddressFields.map((field) => field.label), [
    "Alamat pejabat 1",
    "Poskod pejabat",
    "Telefon pejabat",
  ]);
});

test("record dialog separates home and office addresses and keeps payment fields adjacent", () => {
  const view = buildGeneralSearchRecordDialogView(
    {
      "IC Number": "910731135359",
      "Customer Name": "Chua Ee Ka",
      "Account No": "ACC-1001",
      HomeAddress1: "12 Jalan Damai",
      HomeAddress2: "Taman Murni",
      HomePostcode: "43000",
      OfficeAddress1: "Menara Usahawan",
      OfficePostcode: "50000",
      Handphone: "0123456789",
      PaymentAmount: "250.00",
      LastPaidDate: "2026-08-05",
      Segment: "P10",
    },
    true,
  );

  assert.deepEqual(view.homeAddressFields.map((field) => field.header), [
    "HomeAddress1",
    "HomeAddress2",
    "HomePostcode",
  ]);
  assert.deepEqual(view.officeAddressFields.map((field) => field.header), [
    "OfficeAddress1",
    "OfficePostcode",
  ]);
  assert.deepEqual(view.contactFields.map((field) => field.header), ["Handphone"]);
  assert.deepEqual(view.paymentFields.map((field) => field.header), [
    "LastPaidDate",
    "PaymentAmount",
  ]);
  assert.deepEqual(view.paymentFields.map((field) => field.label), [
    "Tarikh bayaran terakhir",
    "Jumlah bayaran",
  ]);
  assert.deepEqual(view.additionalFields.map((field) => field.header), ["Segment"]);
});
