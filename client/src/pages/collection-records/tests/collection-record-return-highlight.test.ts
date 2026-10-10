import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveCollectionRecordReturnMarker } from "../useCollectionRecordReturnHighlight";

test("return marker follows stable IDs through same-context reordering, not row numbers", () => {
  const marker = { recordId: "synthetic-B", contextKey: "page-one" };
  assert.equal(resolveCollectionRecordReturnMarker(marker, "page-one", [{ id: "synthetic-B" }, { id: "synthetic-A" }]), marker);
  assert.equal(resolveCollectionRecordReturnMarker(marker, "page-one", [{ id: "synthetic-A" }]), null);
});

test("return marker clears on a different result context or a removed record", () => {
  const records = [{ id: "synthetic-A" }];
  const marker = { recordId: "synthetic-A", contextKey: "page-one" };
  assert.equal(resolveCollectionRecordReturnMarker(null, "page-one", records), null);
  assert.equal(resolveCollectionRecordReturnMarker(marker, "other-filter-page-or-role", records), null);
  assert.equal(resolveCollectionRecordReturnMarker(marker, "page-one", []), null);
  const cleared = resolveCollectionRecordReturnMarker(marker, "other-filter-page-or-role", records);
  assert.equal(resolveCollectionRecordReturnMarker(cleared, "page-one", records), null);
});

test("return marker context includes every table filter, role and pagination without persistent storage", () => {
  const page = readFileSync("client/src/pages/collection/CollectionRecordsPage.tsx", "utf8");
  const context = page.slice(page.indexOf("const returnContextKey"), page.indexOf("const { lastViewedRecordId"));
  for (const key of ["role", "tablePage", "tablePageSize", "fromDate", "toDate", "searchInput", "nicknameFilter", "leaderFilter", "sourceImportFilter", "agingFilter", "classificationFilter", "sortValue"]) {
    assert.ok(context.includes(key), key);
  }
  const hook = readFileSync("client/src/pages/collection-records/useCollectionRecordReturnHighlight.ts", "utf8");
  assert.doesNotMatch(hook, /localStorage|sessionStorage|setTimeout|scrollIntoView|scrollTo\(/);
  assert.match(page, /onRecordDetailsToggle=\{\(record\) => markViewed\(record\.id\)\}/);
});
