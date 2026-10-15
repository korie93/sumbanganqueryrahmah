import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getAccountManagementSearchSync } from "./account-management-search-sync";

test("pending and outbox drafts publish normalized typing, not the stale applied search", () => {
  for (const draftSearch of [" MAYA.SYNTHETIC ", " SYNTHETIC@EXAMPLE.TEST ", " ACTIVATION "]) {
    const typing = { appliedSearch: "", previousAppliedSearch: "", lastSubmittedSearch: null, draftSearch, deferredSearch: "" };
    assert.deepEqual(getAccountManagementSearchSync(typing), { resetDraft: false, publishSearch: null });
    assert.deepEqual(getAccountManagementSearchSync({ ...typing, deferredSearch: draftSearch }), {
      resetDraft: false, publishSearch: draftSearch.trim().toLowerCase(),
    });
  }
});

test("incoming external search clears a draft without publishing its previous deferred value", () => {
  const reset = { appliedSearch: "", previousAppliedSearch: "activation", lastSubmittedSearch: null, draftSearch: "activation", deferredSearch: "activation" };
  assert.deepEqual(getAccountManagementSearchSync(reset), { resetDraft: true, publishSearch: null });
  assert.deepEqual(getAccountManagementSearchSync({ ...reset, previousAppliedSearch: "", draftSearch: "" }), { resetDraft: false, publishSearch: null });
});

test("pending hook synchronizes incoming snapshots rather than reapplying stale query on each keystroke", () => {
  const source = readFileSync(new URL("usePendingResetRequestsFilterState.ts", import.meta.url), "utf8");
  assert.match(source, /getAccountManagementSearchSync/);
  assert.match(source, /if \(resetDraft\) setSearchQuery\(query.search\)/);
  assert.match(source, /if \(publishSearch === null\) return/);
  assert.match(source, /lastSubmittedSearch.current = publishSearch/);
  assert.match(source, /page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,\s+search: publishSearch/);
  assert.doesNotMatch(source, /\[query.search, searchQuery\]|\[query.status, statusFilter\]/);
});

test("outbox waits for both deferred drafts before applying the atomic email/subject query", () => {
  const source = readFileSync(new URL("useLocalMailOutboxState.ts", import.meta.url), "utf8");
  assert.equal((source.match(/= getAccountManagementSearchSync\(/g) || []).length, 2);
  assert.match(source, /!emailSync.resetDraft && !subjectSync.resetDraft/);
  assert.match(source, /normalizedDeferredEmailQuery === normalizeSearchValue\(emailQuery\)/);
  assert.match(source, /normalizedDeferredSubjectQuery === normalizeSearchValue\(subjectQuery\)/);
  assert.match(source, /if \(!canPublishSearch\) return/);
  assert.match(source, /searchEmail: normalizedDeferredEmailQuery,\s+searchSubject: normalizedDeferredSubjectQuery/);
  assert.doesNotMatch(source, /\[emailQuery, query.searchEmail\]|\[query.searchSubject, subjectQuery\]|\[query.sortDirection, sortDirection\]/);
});
