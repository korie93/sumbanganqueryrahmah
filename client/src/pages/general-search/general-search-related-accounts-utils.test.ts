import assert from "node:assert/strict";
import test from "node:test";
import { buildGeneralSearchRelatedAccounts } from "@/pages/general-search/general-search-related-accounts-utils";

test("related accounts use the same valid IC and keep distinct account numbers", () => {
  const selected = {
    "IC Number": "910731-13-5359",
    "Customer Name": "Chua Ee Ka",
    "Account No": "ACC-1001",
    "Source File": "NPL CC P10 JULY",
    _collectionStatus: { state: "recorded" },
  };
  const related = {
    "IC Number": "910731135359",
    "Customer Name": "Chua Ee Ka",
    "Account No": "ACC-2002",
    "Source File": "NPL CC P20 JULY",
    _collectionStatus: { state: "historical" },
  };
  const sameNameOnly = {
    "IC Number": "880101145555",
    "Customer Name": "Chua Ee Ka",
    "Account No": "ACC-3003",
    _collectionStatus: { state: "recorded" },
  };

  const accounts = buildGeneralSearchRelatedAccounts(selected, [selected, related, sameNameOnly]);

  assert.deepEqual(accounts.map((account) => account.accountNumber), ["ACC-1001", "ACC-2002"]);
  assert.equal(accounts[0].isSelected, true);
  assert.equal(accounts[1].collectionState, "historical");
  assert.equal(accounts[1].sourceFile, "NPL CC P20 JULY");
});

test("related accounts do not use card numbers or customer names as account identity", () => {
  const selected = {
    "IC Number": "910731135359",
    "Customer Name": "Same Name",
    "Account No": "ACC-1001",
  };
  const cardOnly = {
    "IC Number": "910731135359",
    "Customer Name": "Same Name",
    "Card No": "CARD-9999",
  };
  const invalidIc = {
    "IC Number": "not-an-ic",
    "Customer Name": "Same Name",
    "Account No": "ACC-2002",
  };

  const accounts = buildGeneralSearchRelatedAccounts(selected, [cardOnly, invalidIc]);

  assert.deepEqual(accounts.map((account) => account.accountNumber), ["ACC-1001"]);
});

test("related accounts deduplicate equivalent account values and prefer collection evidence", () => {
  const selected = {
    "IC Number": "910731135359",
    "Account No": "ACC-1001",
    _collectionStatus: { state: "not_recorded" },
  };
  const duplicateWithoutCollection = {
    "IC Number": "910731135359",
    "Account No": "acc-2002",
    _collectionStatus: { state: "not_recorded" },
  };
  const duplicateWithCollection = {
    "IC Number": "910731135359",
    "Account No": "ACC-2002",
    _collectionStatus: { state: "recorded" },
  };
  const duplicateSelectedAccount = {
    "IC Number": "910731135359",
    "Account No": "acc-1001",
    _collectionStatus: { state: "recorded" },
  };

  const accounts = buildGeneralSearchRelatedAccounts(selected, [
    duplicateSelectedAccount,
    duplicateWithoutCollection,
    duplicateWithCollection,
  ]);

  assert.equal(accounts.length, 2);
  assert.equal(accounts[0].record, selected);
  assert.equal(accounts[1].collectionState, "recorded");
  assert.equal(accounts[1].record, duplicateWithCollection);
});
