import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getAccountManagementSearchSync } from "./account-management-search-sync";

const initial = { appliedSearch: "", previousAppliedSearch: "", lastSubmittedSearch: "", draftSearch: "", deferredSearch: "" };

test("typing survives stale applied query and waits for the matching deferred draft", () => {
  const typing = { ...initial, draftSearch: "  MAYA.SYNTHETIC  " };
  assert.deepEqual(getAccountManagementSearchSync(typing), { resetDraft: false, publishSearch: null });
  assert.deepEqual(getAccountManagementSearchSync({ ...typing, deferredSearch: typing.draftSearch }), { resetDraft: false, publishSearch: "maya.synthetic" });
});

test("our normalized acknowledgement preserves the typed casing and a newer local draft", () => {
  assert.deepEqual(getAccountManagementSearchSync({ ...initial, appliedSearch: "maya", lastSubmittedSearch: "maya", draftSearch: "MAYA", deferredSearch: "MAYA" }), { resetDraft: false, publishSearch: null });
  assert.deepEqual(getAccountManagementSearchSync({ ...initial, appliedSearch: "maya", lastSubmittedSearch: "maya", draftSearch: "MAYA.SYNTHETIC", deferredSearch: "maya" }), { resetDraft: false, publishSearch: null });
});

test("an external applied change resets the draft without bouncing back the previous search", () => {
  const incoming = { appliedSearch: "", previousAppliedSearch: "maya", lastSubmittedSearch: "maya", draftSearch: "maya", deferredSearch: "maya" };
  assert.deepEqual(getAccountManagementSearchSync(incoming), { resetDraft: true, publishSearch: null });
  assert.deepEqual(getAccountManagementSearchSync({ ...incoming, previousAppliedSearch: "", draftSearch: "" }), { resetDraft: false, publishSearch: null });
  assert.deepEqual(getAccountManagementSearchSync({ ...incoming, previousAppliedSearch: "", draftSearch: "", deferredSearch: "" }), { resetDraft: false, publishSearch: null });
});

test("clear-search chip publishes the empty search instead of restoring the old query", () => {
  assert.deepEqual(getAccountManagementSearchSync({ appliedSearch: "maya", previousAppliedSearch: "maya", lastSubmittedSearch: "maya", draftSearch: "", deferredSearch: "" }), { resetDraft: false, publishSearch: "" });
});

test("a consumed acknowledgement cannot hide a later external query change", () => {
  assert.deepEqual(getAccountManagementSearchSync({ appliedSearch: "maya", previousAppliedSearch: "other", lastSubmittedSearch: null, draftSearch: "other", deferredSearch: "other" }), { resetDraft: true, publishSearch: null });
});

test("managed hook keeps normalization, first-page reset and query-only incoming role/status sync", () => {
  const source = readFileSync(new URL("./useManagedAccountsFilterState.ts", import.meta.url), "utf8");
  assert.match(source, /getAccountManagementSearchSync/);
  assert.match(source, /if \(resetDraft\) setSearchQuery\(query.search\)/);
  assert.match(source, /if \(publishSearch === null\) return/);
  assert.match(source, /lastSubmittedSearch.current = publishSearch/);
  assert.match(source, /page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,\s+search: publishSearch/);
  assert.doesNotMatch(source, /\[query.search, searchQuery\]|\[query.role, roleFilter\]|\[query.status, statusFilter\]/);
});
